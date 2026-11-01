jest.mock("../prismaClient", () => ({
  task: { findFirst: jest.fn() },
}));

const prisma = require("../prismaClient");
const {
  loadWorkspaceTask,
  taskInWorkspaceGuard,
  assertTaskUpdateAccess,
  assertTaskDeleteAccess,
} = require("../middleware/authorization");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const memberReq = (overrides = {}) => ({
  params: { id: "t1" },
  user: { id: "u1", type: "USER" },
  workspace: { id: "w1" },
  permissions: new Set(["task.update.own", "task.delete.own"]),
  ...overrides,
});

describe("loadWorkspaceTask", () => {
  it("returns 404 when the task does not exist (or is soft-deleted)", async () => {
    prisma.task.findFirst.mockResolvedValue(null);
    const req = memberReq();
    const res = mockRes();
    const next = jest.fn();

    await loadWorkspaceTask(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches the fully included task and calls next", async () => {
    const task = { id: "t1", workspaceId: "w1", createdById: "u1" };
    prisma.task.findFirst.mockResolvedValue(task);
    const req = memberReq();
    const res = mockRes();
    const next = jest.fn();

    await loadWorkspaceTask(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.task).toBe(task);
    // repository scoped by the resolved workspace
    expect(prisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "t1", workspaceId: "w1" }),
      })
    );
  });

  it("scopes by the member's workspace (repo receives workspaceId)", async () => {
    prisma.task.findFirst.mockResolvedValue(null);
    const req = memberReq();
    const res = mockRes();
    const next = jest.fn();

    await loadWorkspaceTask(req, res, next);

    expect(prisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "w1" }),
      })
    );
  });

  it("leaves scanning unscoped for a platform admin in sudo mode", async () => {
    prisma.task.findFirst.mockResolvedValue({ id: "t1", workspaceId: "w9" });
    const req = { params: { id: "t1" }, user: { id: "a1", type: "ADMIN" } };
    const res = mockRes();
    const next = jest.fn();

    await loadWorkspaceTask(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(
      prisma.task.findFirst
    ).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ workspaceId: expect.anything() }) })
    );
  });

  it("forwards repository errors to next", async () => {
    prisma.task.findFirst.mockRejectedValue(new Error("db down"));
    const req = memberReq();
    const res = mockRes();
    const next = jest.fn();

    await loadWorkspaceTask(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("taskInWorkspaceGuard", () => {
  it("404s a task loaded outside the resolved workspace", () => {
    const req = memberReq({
      task: { id: "t1", workspaceId: "other" },
    });
    const res = mockRes();
    const next = jest.fn();

    taskInWorkspaceGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes when the task belongs to the workspace", () => {
    const req = memberReq({ task: { id: "t1", workspaceId: "w1" } });
    const res = mockRes();
    const next = jest.fn();

    taskInWorkspaceGuard(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("passes for a platform admin without workspace context", () => {
    const req = {
      user: { id: "a1", type: "ADMIN" },
      isPlatformAdmin: true,
      task: { id: "t1", workspaceId: "w9" },
    };
    const res = mockRes();
    const next = jest.fn();

    taskInWorkspaceGuard(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe("assertTaskUpdateAccess / assertTaskDeleteAccess", () => {
  it("403s a member without update permissions", () => {
    const req = memberReq({
      task: { id: "t1", workspaceId: "w1", createdById: "other", createdByType: "USER" },
    });
    req.permissions = new Set(["task.create"]);
    const res = mockRes();
    const next = jest.fn();

    assertTaskUpdateAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows the creator via task.update.own", () => {
    const req = memberReq({
      task: { id: "t1", workspaceId: "w1", createdById: "u1", createdByType: "USER" },
    });
    const res = mockRes();
    const next = jest.fn();

    assertTaskUpdateAccess(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows any-workspace editors via task.update.any", () => {
    const req = memberReq({
      task: { id: "t1", workspaceId: "w1", createdById: "someone", createdByType: "ADMIN" },
    });
    req.permissions = new Set(["task.update.any"]);
    const res = mockRes();
    const next = jest.fn();

    assertTaskUpdateAccess(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("delete permission is checked with task.delete.own codes", () => {
    const req = memberReq({
      task: { id: "t1", workspaceId: "w1", createdById: "u1", createdByType: "USER" },
    });
    req.permissions = new Set(["task.update.any"]); // wrong code set
    const res = mockRes();
    const next = jest.fn();

    assertTaskDeleteAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("delete passes with task.delete.any", () => {
    const req = memberReq({
      task: { id: "t1", workspaceId: "w1", createdById: "someone", createdByType: "ADMIN" },
    });
    req.permissions = new Set(["task.delete.any"]);
    const res = mockRes();
    const next = jest.fn();

    assertTaskDeleteAccess(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("platform admins always pass", () => {
    const req = {
      user: { id: "a1", type: "ADMIN" },
      isPlatformAdmin: true,
      task: { id: "t1", workspaceId: "w9", createdById: "x1" },
    };
    const res = mockRes();
    const next = jest.fn();

    assertTaskUpdateAccess(req, res, next);
    expect(next).toHaveBeenCalledWith();

    req.task = { id: "t1", workspaceId: "w9" };
    const next2 = jest.fn();
    assertTaskDeleteAccess(req, res, next2);
    expect(next2).toHaveBeenCalledWith();
  });
});
