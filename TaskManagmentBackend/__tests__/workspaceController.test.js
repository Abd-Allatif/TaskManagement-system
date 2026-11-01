jest.mock("../prismaClient", () => ({}));

// The controller is tested against real repository implementations? No — mock
// the repository module and assert orchestration only.
jest.mock("../repository/Workspace/workspaceRepository", () => ({
  createWorkspace: jest.fn(),
  listAllWorkspaces: jest.fn(),
  listWorkspacesForUser: jest.fn(),
  updateWorkspace: jest.fn(),
  softDeleteWorkspace: jest.fn(),
  transferOwnership: jest.fn(),
  getMembership: jest.fn(),
  getMembershipById: jest.fn(),
  getMembershipByEmail: jest.fn(),
  listMembers: jest.fn(),
  getMembershipsByRoleId: jest.fn(),
  countRoleMemberships: jest.fn(),
  setMemberRole: jest.fn(),
  removeMember: jest.fn(),
  listRoles: jest.fn(),
  getRole: jest.fn(),
  getRoleByName: jest.fn(),
  createCustomRole: jest.fn(),
  renameRole: jest.fn(),
  setRolePermissions: jest.fn(),
  deleteRole: jest.fn(),
  countPendingInvitesForRole: jest.fn(),
  createInvite: jest.fn(),
  getInviteByToken: jest.fn(),
  getInviteInWorkspace: jest.fn(),
  listPendingInvites: jest.fn(),
  pendingInviteByEmail: jest.fn(),
  getPendingInviteById: jest.fn(),
  cancelInvite: jest.fn(),
  acceptInvite: jest.fn(),
  getPermissions: jest.fn(),
}));

jest.mock("../repository/Authentication/authRepository", () => ({
  findByEmail: jest.fn(),
}));

const workspaceRepository = require("../repository/Workspace/workspaceRepository");
const authRepository = require("../repository/Authentication/authRepository");
const controller = require("../controllers/Workspace/workspaceController");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const memberReq = (overrides = {}) => ({
  user: { id: "u1", email: "u1@example.com", type: "USER" },
  workspace: { id: "w1", name: "WS", ownerUserId: "u1" },
  member: { id: "m1" },
  permissions: new Set(["member.invite", "member.role.assign", "member.remove"]),
  body: {},
  params: {},
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe("createWorkspace", () => {
  it("makes the caller the OWNER and returns 201", async () => {
    workspaceRepository.createWorkspace.mockResolvedValue({
      workspace: { id: "w9", name: "Mine", ownerUserId: "u1" },
    });

    const req = memberReq({ body: { name: "Mine" } });
    const res = mockRes();
    await controller.createWorkspace(req, res);

    expect(workspaceRepository.createWorkspace).toHaveBeenCalledWith({
      name: "Mine",
      ownerUserId: "u1",
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("listWorkspaces", () => {
  it("returns every workspace for a platform admin", async () => {
    workspaceRepository.listAllWorkspaces.mockResolvedValue([{ id: "w1" }]);

    const req = memberReq({ isPlatformAdmin: true, member: undefined });
    const res = mockRes();
    await controller.listWorkspaces(req, res);
    const body = res.json.mock.calls[0][0];

    expect(body.scope).toBe("all");
    expect(body.workspaces).toHaveLength(1);
  });

  it("annotates memberships with the role and ownership flag for users", async () => {
    workspaceRepository.listWorkspacesForUser.mockResolvedValue([
      {
        workspace: { id: "w1", ownerUserId: "u2" },
        role: {
          id: "r1",
          name: "USER",
          rolePermissions: [{ permission: { code: "task.create" } }],
        },
      },
    ]);

    const req = memberReq();
    const res = mockRes();
    await controller.listWorkspaces(req, res);
    const body = res.json.mock.calls[0][0];

    expect(body.scope).toBe("memberships");
    expect(body.workspaces[0].role.name).toBe("USER");
    expect(body.workspaces[0].role.permissions).toEqual(["task.create"]);
    expect(body.workspaces[0].isOwner).toBe(false);
  });
});

describe("updateMemberRole", () => {
  it("blocks retyping the workspace owner's membership", async () => {
    workspaceRepository.getMembership.mockResolvedValue({ id: "m1", userId: "u1" });
    workspaceRepository.getRole.mockResolvedValue({ id: "r2", name: "USER" });

    const req = memberReq({ params: { userId: "u1" }, body: { roleId: "r2" } });
    const res = mockRes();
    await controller.updateMemberRole(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(workspaceRepository.setMemberRole).not.toHaveBeenCalled();
  });

  it("blocks assigning the OWNER role through this endpoint", async () => {
    workspaceRepository.getMembership.mockResolvedValue({ id: "m1", userId: "u2" });
    workspaceRepository.getRole.mockResolvedValue({ id: "r-owner", name: "OWNER" });

    const req = memberReq({ params: { userId: "u2" }, body: { roleId: "r-owner" } });
    const res = mockRes();
    await controller.updateMemberRole(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(workspaceRepository.setMemberRole).not.toHaveBeenCalled();
  });

  it("404s an unknown member or role", async () => {
    workspaceRepository.getMembership.mockResolvedValue(null);

    const req = memberReq({ params: { userId: "ghost" }, body: { roleId: "r2" } });
    const res = mockRes();
    await controller.updateMemberRole(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(workspaceRepository.getRole).not.toHaveBeenCalled();
  });

  it("assigns the role for a normal member", async () => {
    workspaceRepository.getMembership.mockResolvedValue({ id: "m1", userId: "u2" });
    workspaceRepository.getRole.mockResolvedValue({ id: "r2", name: "USER" });
    workspaceRepository.setMemberRole.mockResolvedValue({ id: "m1" });

    const req = memberReq({ params: { userId: "u2" }, body: { roleId: "r2" } });
    const res = mockRes();
    await controller.updateMemberRole(req, res);

    expect(workspaceRepository.setMemberRole).toHaveBeenCalledWith("m1", "r2");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("removeMember", () => {
  it("403s removing the owner", async () => {
    workspaceRepository.getMembership.mockResolvedValue({ id: "m1", userId: "u1" });

    const req = memberReq({ params: { userId: "u1" } });
    const res = mockRes();
    await controller.removeMember(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(workspaceRepository.removeMember).not.toHaveBeenCalled();
  });

  it("removes a normal member", async () => {
    workspaceRepository.getMembership.mockResolvedValue({ id: "m1", userId: "u2" });

    const req = memberReq({ params: { userId: "u2" } });
    const res = mockRes();
    await controller.removeMember(req, res);

    expect(workspaceRepository.removeMember).toHaveBeenCalledWith("m1");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("transferOwnership", () => {
  it("400s when the target already owns the workspace", async () => {
    const req = memberReq({ body: { userId: "u1" } });
    const res = mockRes();
    await controller.transferOwnership(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(workspaceRepository.transferOwnership).not.toHaveBeenCalled();
  });

  it("404s when the new owner is not a member", async () => {
    workspaceRepository.getMembership.mockResolvedValue(null);

    const req = memberReq({ body: { userId: "u9" } });
    const res = mockRes();
    await controller.transferOwnership(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("role management", () => {
  it("updateRole refuses system roles", async () => {
    workspaceRepository.getRole.mockResolvedValue({ id: "r1", name: "ADMIN", isSystem: true });

    const req = memberReq({
      params: { roleId: "r1" },
      body: { name: "Renamed" },
    });
    const res = mockRes();
    await controller.updateRole(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(workspaceRepository.renameRole).not.toHaveBeenCalled();
  });

  it("deleteRole 409s while the role still has members", async () => {
    workspaceRepository.getRole.mockResolvedValue({ id: "r1", name: "Editor", isSystem: false });
    workspaceRepository.countRoleMemberships.mockResolvedValue(2);

    const req = memberReq({ params: { roleId: "r1" } });
    const res = mockRes();
    await controller.deleteRole(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(workspaceRepository.deleteRole).not.toHaveBeenCalled();
  });

  it("deleteRole 409s with pending invites on the role", async () => {
    workspaceRepository.getRole.mockResolvedValue({ id: "r1", name: "Editor", isSystem: false });
    workspaceRepository.countRoleMemberships.mockResolvedValue(0);
    workspaceRepository.countPendingInvitesForRole.mockResolvedValue(1);

    const req = memberReq({ params: { roleId: "r1" } });
    const res = mockRes();
    await controller.deleteRole(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("setRolePermissions forwards codes for a custom role", async () => {
    workspaceRepository.getRole.mockResolvedValue({ id: "r1", name: "Editor", isSystem: false });
    workspaceRepository.setRolePermissions.mockResolvedValue({ id: "r1" });

    const req = memberReq({
      params: { roleId: "r1" },
      body: { permissionCodes: ["task.create"] },
    });
    const res = mockRes();
    await controller.setRolePermissions(req, res);

    expect(workspaceRepository.setRolePermissions).toHaveBeenCalledWith("r1", [
      "task.create",
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("createInvite", () => {
  it("403s a platform admin in sudo mode (no user account to attach)", async () => {
    const req = memberReq({ isPlatformAdmin: true, member: undefined });
    const res = mockRes();
    await controller.createInvite(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(workspaceRepository.createInvite).not.toHaveBeenCalled();
  });

  it("409s when the target is already a member", async () => {
    authRepository.findByEmail.mockResolvedValue({ id: "u2", email: "u2@example.com" });
    workspaceRepository.getMembership.mockResolvedValue({ id: "m9" });

    const req = memberReq({
      body: { email: "u2@example.com", roleId: "r-user" },
    });
    const res = mockRes();
    await controller.createInvite(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(workspaceRepository.createInvite).not.toHaveBeenCalled();
  });

  it("409s a duplicate pending invite", async () => {
    authRepository.findByEmail.mockResolvedValue(null);
    workspaceRepository.pendingInviteByEmail.mockResolvedValue({ id: "inv1" });
    workspaceRepository.getRole.mockResolvedValue({ id: "r-user", name: "USER" });

    const req = memberReq({
      body: { email: "u2@example.com", roleId: "r-user" },
    });
    const res = mockRes();
    await controller.createInvite(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("400s inviting someone as OWNER", async () => {
    authRepository.findByEmail.mockResolvedValue(null);
    workspaceRepository.getRole.mockResolvedValue({ id: "r-owner", name: "OWNER" });

    const req = memberReq({
      body: { email: "u2@example.com", roleId: "r-owner" },
    });
    const res = mockRes();
    await controller.createInvite(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("creates the invite and returns the token once", async () => {
    authRepository.findByEmail.mockResolvedValue(null);
    workspaceRepository.pendingInviteByEmail.mockResolvedValue(null);
    workspaceRepository.getRole.mockResolvedValue({ id: "r-user", name: "USER" });
    workspaceRepository.createInvite.mockResolvedValue({
      id: "inv1",
      token: "tok-123",
      expiresAt: new Date(),
      role: { id: "r-user", name: "USER" },
    });

    const req = memberReq({
      body: { email: "u2@example.com", roleId: "r-user" },
    });
    const res = mockRes();
    await controller.createInvite(req, res);

    expect(workspaceRepository.createInvite).toHaveBeenCalledWith({
      workspaceId: "w1",
      email: "u2@example.com",
      roleId: "r-user",
      invitedById: "u1",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.token).toBe("tok-123");
    // the embedded invite copy must not leak the token twice
    expect(body.invite.token).toBeUndefined();
  });
});

describe("redeemInvite", () => {
  it("404s an unknown token", async () => {
    workspaceRepository.getInviteByToken.mockResolvedValue(null);

    const req = memberReq({ body: { token: "nope" } });
    const res = mockRes();
    await controller.redeemInvite(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("rejects a used or expired invite", async () => {
    workspaceRepository.getInviteByToken.mockResolvedValue({ acceptedAt: new Date() });

    let res = mockRes();
    await controller.redeemInvite(memberReq({ body: { token: "t" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);

    workspaceRepository.getInviteByToken.mockResolvedValue({
      acceptedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    res = mockRes();
    await controller.redeemInvite(memberReq({ body: { token: "t" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("403s when the invite email does not match the account", async () => {
    workspaceRepository.getInviteByToken.mockResolvedValue({
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 1000),
      email: "someone-else@example.com",
    });

    const req = memberReq({ body: { token: "t" } });
    const res = mockRes();
    await controller.redeemInvite(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(workspaceRepository.acceptInvite).not.toHaveBeenCalled();
  });

  it("redeems and joins with the invited role", async () => {
    workspaceRepository.getInviteByToken.mockResolvedValue({
      id: "inv1",
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 1000),
      email: "U1@Example.com",
      roleId: "r-user",
      role: { id: "r-user", name: "USER" },
      workspace: { id: "w1", name: "WS" },
    });
    workspaceRepository.acceptInvite.mockResolvedValue({
      membership: { id: "m2" },
      role: { id: "r-user", name: "USER" },
      workspace: { id: "w1", name: "WS" },
    });

    const req = memberReq({ body: { token: "t" } });
    const res = mockRes();
    await controller.redeemInvite(req, res);

    // email match is case-insensitive
    expect(workspaceRepository.acceptInvite).toHaveBeenCalledWith({
      invite: expect.objectContaining({ id: "inv1" }),
      userId: "u1",
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("deleteWorkspace", () => {
  it("delegates to the soft-delete cascade", async () => {
    const res = mockRes();
    await controller.deleteWorkspace(memberReq(), res);

    expect(workspaceRepository.softDeleteWorkspace).toHaveBeenCalledWith("w1");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
