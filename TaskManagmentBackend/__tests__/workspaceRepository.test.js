jest.mock("../prismaClient", () => ({
  workspace: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  permission: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
  },
  role: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  rolePermission: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  membership: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  workspaceInvite: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  task: {
    updateMany: jest.fn(),
  },
  category: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
}));

const prisma = require("../prismaClient");
const workspaceRepository = require("../repository/Workspace/workspaceRepository");

beforeEach(() => {
  jest.clearAllMocks();
  // Callback transactions delegate to prisma itself; array transactions fan out.
  prisma.$transaction.mockImplementation(async (arg) =>
    Array.isArray(arg) ? Promise.all(arg) : arg(prisma)
  );
});

describe("createWorkspace", () => {
  it("seeds 3 system roles, their permissions and the OWNER membership atomically", async () => {
    const roleIds = [];
    prisma.workspace.create.mockResolvedValue({ id: "w1", name: "My WS" });
    prisma.role.create.mockImplementation(async ({ data }) => {
      roleIds.push(data.name);
      return { id: `role-${data.name}`, name: data.name };
    });

    const { workspace, roles } = await workspaceRepository.createWorkspace({
      name: "My WS",
      ownerUserId: "u1",
    });

    expect(workspace.id).toBe("w1");
    // exactly OWNER / ADMIN / USER, in catalog order
    expect(roleIds).toEqual(["OWNER", "ADMIN", "USER"]);
    expect(Object.keys(roles).sort()).toEqual(["ADMIN", "OWNER", "USER"]);
    expect(prisma.membership.create).toHaveBeenCalledWith({
      data: { workspaceId: "w1", userId: "u1", roleId: "role-OWNER" },
    });
    // ADMIN lacks the owner-only codes, USER only has editor codes
    const adminCodes = prisma.role.create.mock.calls[1][0].data.rolePermissions.create.map(
      (c) => c.permission.connect.code
    );
    expect(adminCodes).toContain("workspace.update");
    expect(adminCodes).not.toContain("workspace.delete");
    expect(adminCodes).not.toContain("workspace.transfer");

    const userCodes = prisma.role.create.mock.calls[2][0].data.rolePermissions.create.map(
      (c) => c.permission.connect.code
    );
    expect(userCodes).toEqual([
      "task.create",
      "task.update.own",
      "task.delete.own",
      "task.assign",
      "category.create",
    ]);
  });
});

describe("softDeleteWorkspace", () => {
  it("soft-deletes live tasks, drops invites, hard-deletes categories, then the workspace", async () => {
    prisma.workspace.update.mockResolvedValue({ id: "w1", deletedAt: new Date() });

    await workspaceRepository.softDeleteWorkspace("w1");

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "w1", deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prisma.workspaceInvite.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: "w1" },
    });
    expect(prisma.category.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: "w1" },
    });
    expect(prisma.workspace.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

describe("transferOwnership", () => {
  it("retypes both memberships and moves owner_user_id in one transaction", async () => {
    prisma.role.findMany.mockResolvedValue([
      { id: "r-owner", name: "OWNER" },
      { id: "r-admin", name: "ADMIN" },
    ]);
    prisma.membership.findFirst
      .mockResolvedValueOnce({ id: "m-target", userId: "u2" }) // new owner
      .mockResolvedValueOnce({ id: "m-old", userId: "u1" }); // previous owner
    prisma.workspace.update.mockResolvedValue({
      id: "w1",
      ownerUserId: "u2",
    });

    const workspace = await workspaceRepository.transferOwnership("w1", "u1", "u2");

    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: "m-target" },
      data: { roleId: "r-owner" },
    });
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: "m-old" },
      data: { roleId: "r-admin" },
    });
    expect(workspace.ownerUserId).toBe("u2");
  });
});

describe("invites", () => {
  it("createInvite stores an opaque token with a 7-day expiry (email normalized)", async () => {
    prisma.workspaceInvite.create.mockResolvedValue({ id: "inv1", token: "tok" });

    const invite = await workspaceRepository.createInvite({
      workspaceId: "w1",
      email: "SomeOne@Example.COM",
      roleId: "r1",
      invitedById: "u1",
    });

    expect(invite.id).toBe("inv1");
    const call = prisma.workspaceInvite.create.mock.calls[0][0];
    expect(call.data.email).toBe("someone@example.com");
    expect(call.data.token).toMatch(/^[a-f0-9]{48}$/);
    expect(call.data.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      6.9 * 24 * 60 * 60 * 1000
    );
  });

  it("acceptInvite creates the membership via the invited role (idempotent when present)", async () => {
    const invite = {
      id: "inv1",
      workspaceId: "w1",
      roleId: "r1",
      role: { id: "r1", name: "USER" },
      workspace: { id: "w1", name: "WS" },
    };
    prisma.membership.findFirst.mockResolvedValue(null);
    prisma.membership.create.mockResolvedValue({ id: "m2", workspaceId: "w1", userId: "u2" });

    const { membership } = await workspaceRepository.acceptInvite({
      invite,
      userId: "u2",
    });

    expect(prisma.membership.create).toHaveBeenCalledWith({
      data: { workspaceId: "w1", userId: "u2", roleId: "r1" },
    });
    expect(prisma.workspaceInvite.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { acceptedAt: expect.any(Date) },
    });
    expect(membership).toBeTruthy();
  });

  it("setRolePermissions rejects unknown codes so nothing is half-applied", async () => {
    await expect(
      workspaceRepository.setRolePermissions("r1", ["task.create", "bogus.code"])
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it("replaces the permission set of an existing role", async () => {
    jest.spyOn(prisma.permission, "findUnique").mockImplementation(async ({ where }) =>
      where.code === "task.create" ? { id: "p1" } : null
    );
    prisma.role.findFirst.mockResolvedValue({ id: "r1", name: "Editor" });

    await workspaceRepository.setRolePermissions("r1", ["task.create"]);

    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: "r1" } });
    expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ roleId: "r1", permissionId: "p1" }],
    });
  });
});
