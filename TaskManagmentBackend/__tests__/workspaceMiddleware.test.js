jest.mock("../prismaClient", () => ({
  workspace: { findFirst: jest.fn() },
  membership: { findFirst: jest.fn() },
}));

const prisma = require("../prismaClient");
const {
  resolveWorkspace,
  resolveWorkspaceOptional,
  resolveParamWorkspace,
} = require("../middleware/workspace");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const workspaceRow = { id: "w1", name: "WS", ownerUserId: "u1", deletedAt: null };

const membershipRow = {
  id: "m1",
  workspaceId: "w1",
  userId: "u1",
  role: {
    id: "r-user",
    name: "USER",
    rolePermissions: [
      { permission: { code: "task.create" } },
      { permission: { code: "task.update.own" } },
    ],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.workspace.findFirst.mockResolvedValue(workspaceRow);
  prisma.membership.findFirst.mockResolvedValue(membershipRow);
});

describe("resolveWorkspace", () => {
  it("400s when the X-Workspace-Id header is missing", async () => {
    const req = { headers: {}, user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveWorkspace(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("404s an unknown or soft-deleted workspace", async () => {
    prisma.workspace.findFirst.mockResolvedValue(null);
    const req = { headers: { "x-workspace-id": "w1" }, user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveWorkspace(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches workspace, membership and the permission set for members", async () => {
    const req = { headers: { "x-workspace-id": "w1" }, user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveWorkspace(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.workspace).toEqual(workspaceRow);
    expect(req.member).toEqual(membershipRow);
    expect(req.permissions.has("task.create")).toBe(true);
    expect(req.permissions.has("task.update.own")).toBe(true);
    expect(req.permissions.has("workspace.delete")).toBe(false);
    expect(prisma.workspace.findFirst).toHaveBeenCalledWith({
      where: { id: "w1", deletedAt: null },
    });
  });

  it("403s a user without membership in the workspace", async () => {
    prisma.membership.findFirst.mockResolvedValue(null);
    const req = { headers: { "x-workspace-id": "w1" }, user: { id: "u2", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveWorkspace(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("platform admins skip the membership check", async () => {
    const req = { headers: { "x-workspace-id": "w1" }, user: { id: "a1", type: "ADMIN" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveWorkspace(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.isPlatformAdmin).toBe(true);
    expect(prisma.membership.findFirst).not.toHaveBeenCalled();
  });

  it("forwards db errors to the error handler", async () => {
    prisma.workspace.findFirst.mockRejectedValue(new Error("db down"));
    const req = { headers: { "x-workspace-id": "w1" }, user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveWorkspace(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("resolveWorkspaceOptional", () => {
  it("sudo mode: a platform admin without a header proceeds unscoped", async () => {
    const req = { headers: {}, user: { id: "a1", type: "ADMIN" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveWorkspaceOptional(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.isPlatformAdmin).toBe(true);
    expect(req.workspace).toBeUndefined();
  });

  it("400s a member without a header", async () => {
    const req = { headers: {}, user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveWorkspaceOptional(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("behaves like resolveWorkspace when a header is present", async () => {
    const req = { headers: { "x-workspace-id": "w1" }, user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveWorkspaceOptional(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.workspace).toEqual(workspaceRow);
    expect(req.permissions.has("task.create")).toBe(true);
  });
});

describe("resolveParamWorkspace", () => {
  it("resolves the workspace from req.params.id", async () => {
    const req = { params: { id: "w1" }, user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveParamWorkspace(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.workspace).toEqual(workspaceRow);
    expect(req.permissions.has("task.create")).toBe(true);
  });

  it("404s an invalid workspace id", async () => {
    prisma.workspace.findFirst.mockResolvedValue(null);
    const req = { params: { id: "ghost" }, user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveParamWorkspace(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("platform admins pass without a membership", async () => {
    const req = { params: { id: "w1" }, user: { id: "a1", type: "ADMIN" } };
    const res = mockRes();
    const next = jest.fn();

    await resolveParamWorkspace(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.isPlatformAdmin).toBe(true);
  });
});
