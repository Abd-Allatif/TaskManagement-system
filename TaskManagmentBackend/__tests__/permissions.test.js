const {
  hasPermission,
  requirePermission,
  requireWorkspaceOwner,
  isWorkspaceOwner,
} = require("../middleware/permissions");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("hasPermission", () => {
  it("returns true for a platform admin regardless of the set", () => {
    expect(hasPermission({ isPlatformAdmin: true }, "workspace.delete")).toBe(true);
    expect(hasPermission({ isPlatformAdmin: true, permissions: new Set() }, "x")).toBe(true);
  });

  it("returns true only when the resolved set contains the code", () => {
    const req = { permissions: new Set(["task.create"]) };
    expect(hasPermission(req, "task.create")).toBe(true);
    expect(hasPermission(req, "task.delete.any")).toBe(false);
  });

  it("returns false when no permission set was resolved", () => {
    expect(hasPermission({}, "task.create")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("calls next when the permission is held", () => {
    const req = { workspace: { id: "w1" }, permissions: new Set(["task.create"]) };
    const res = mockRes();
    const next = jest.fn();

    requirePermission("task.create")(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("403s with the missing code named when absent", () => {
    const req = { workspace: { id: "w1" }, permissions: new Set([]) };
    const res = mockRes();
    const next = jest.fn();

    requirePermission("task.create")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Forbidden. Missing permission: task.create",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("errors out (app bug, not user error) without a resolved workspace", () => {
    const req = { permissions: new Set(["task.create"]) };
    const res = mockRes();
    const next = jest.fn();

    requirePermission("task.create")(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });

  it("platform admins pass without any membership", () => {
    const req = { workspace: { id: "w1" }, isPlatformAdmin: true };
    const res = mockRes();
    const next = jest.fn();

    requirePermission("anything")(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe("requireWorkspaceOwner", () => {
  it("passes for the workspace owner", () => {
    const req = {
      workspace: { id: "w1", ownerUserId: "u1" },
      user: { id: "u1", type: "USER" },
    };
    const res = mockRes();
    const next = jest.fn();

    requireWorkspaceOwner(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("passes for a platform admin even when they are not the owner", () => {
    const req = {
      workspace: { id: "w1", ownerUserId: "u1" },
      user: { id: "a1", type: "ADMIN" },
      isPlatformAdmin: true,
    };
    const res = mockRes();
    const next = jest.fn();

    requireWorkspaceOwner(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("403s a non-owner member", () => {
    const req = {
      workspace: { id: "w1", ownerUserId: "u1" },
      user: { id: "u2", type: "USER" },
    };
    const res = mockRes();
    const next = jest.fn();

    requireWorkspaceOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("errors out without a resolved workspace", () => {
    const req = { user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    requireWorkspaceOwner(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("isWorkspaceOwner", () => {
  it("matches the workspace ownerUserId against the token subject", () => {
    expect(
      isWorkspaceOwner({
        workspace: { ownerUserId: "u1" },
        user: { id: "u1", type: "USER" },
      })
    ).toBe(true);
    expect(
      isWorkspaceOwner({
        workspace: { ownerUserId: "u1" },
        user: { id: "u2", type: "USER" },
      })
    ).toBe(false);
    expect(isWorkspaceOwner({})).toBe(false);
  });
});
