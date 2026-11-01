const crypto = require("crypto");
const prisma = require("../../prismaClient");
const { ALL_PERMISSIONS, SYSTEM_ROLES } = require("./permissionsCatalog");

const INVITE_TTL_DAYS = 7;

// Role include fields. Used directly as the include of prisma.role.* queries
// ("model-level") and wrapped in `include:` when nested inside another
// model's `role` relation — both spellings are required by Prisma's nested
// include syntax.
const roleIncludeFields = {
  rolePermissions: {
    include: { permission: true },
  },
};

// ---------- Permission catalog ----------

// Idempotent catalog seed: upserts every permission by its unique code.
const seedPermissions = async () => {
  for (const p of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { label: p.label },
      create: { code: p.code, label: p.label },
    });
  }
  return prisma.permission.findMany({ orderBy: { code: "asc" } });
};

const getPermissions = () =>
  prisma.permission.findMany({ orderBy: { code: "asc" } });

// ---------- Workspaces ----------

const getWorkspaceById = (id) =>
  prisma.workspace.findFirst({ where: { id, deletedAt: null } });

const listAllWorkspaces = () =>
  prisma.workspace.findMany({
    where: { deletedAt: null },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: {
        select: {
          memberships: true,
          tasks: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

const listWorkspacesForUser = (userId) =>
  prisma.membership.findMany({
    where: { userId, workspace: { deletedAt: null } },
    include: { workspace: true, role: { include: roleIncludeFields } },
    orderBy: { createdAt: "asc" },
  });

// Creates a workspace plus its seeded OWNER/ADMIN/USER system roles and the
// owner's membership, atomically. Roles connect their permissions by code
// so the catalog above is authoritative at creation time.
const createWorkspace = ({ name, ownerUserId }) =>
  prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({ data: { name, ownerUserId } });

    const roles = {};
    for (const [roleName, codes] of Object.entries(SYSTEM_ROLES)) {
      roles[roleName] = await tx.role.create({
        data: {
          workspaceId: workspace.id,
          name: roleName,
          isSystem: true,
          rolePermissions: {
            create: codes.map((code) => ({ permission: { connect: { code } } })),
          },
        },
      });
    }

    await tx.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: ownerUserId,
        roleId: roles.OWNER.id,
      },
    });

    return { workspace, roles };
  });

const updateWorkspace = (workspaceId, data) =>
  prisma.workspace.update({ where: { id: workspaceId }, data });

// Soft-deletes the workspace and everything scoped to it. Categories are
// hard-deleted (matching the existing category semantics); their pivots
// cascade. Memberships stay attached to the (hidden) workspace record.
const softDeleteWorkspace = (workspaceId) =>
  prisma.$transaction(async (tx) => {
    await tx.task.updateMany({
      where: { workspaceId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await tx.workspaceInvite.deleteMany({ where: { workspaceId } });
    await tx.category.deleteMany({ where: { workspaceId } });

    return tx.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt: new Date() },
    });
  });

const transferOwnership = (workspaceId, previousOwnerUserId, newOwnerUserId) =>
  prisma.$transaction(async (tx) => {
    const systemRoles = await tx.role.findMany({
      where: { workspaceId, isSystem: true, name: { in: ["OWNER", "ADMIN"] } },
    });
    const ownerRole = systemRoles.find((r) => r.name === "OWNER");
    const adminRole = systemRoles.find((r) => r.name === "ADMIN");

    const targetMembership = await tx.membership.findFirst({
      where: { workspaceId, userId: newOwnerUserId },
    });

    await tx.membership.update({
      where: { id: targetMembership.id },
      data: { roleId: ownerRole.id },
    });

    // The previous owner keeps editor-level access as a workspace ADMIN.
    const oldOwnerMembership = await tx.membership.findFirst({
      where: { workspaceId, userId: previousOwnerUserId },
    });
    if (oldOwnerMembership) {
      await tx.membership.update({
        where: { id: oldOwnerMembership.id },
        data: { roleId: adminRole.id },
      });
    }

    return tx.workspace.update({
      where: { id: workspaceId },
      data: { ownerUserId: newOwnerUserId },
    });
  });

// ---------- Memberships ----------

const getMembership = (workspaceId, userId) =>
  prisma.membership.findFirst({
    where: { workspaceId, userId },
    include: { role: { include: roleIncludeFields } },
  });

const getMembershipById = (workspaceId, membershipId) =>
  prisma.membership.findFirst({
    where: { id: membershipId, workspaceId },
    include: { role: true },
  });

const listMembers = (workspaceId) =>
  prisma.membership.findMany({
    where: { workspaceId },
    include: {
      user: { select: { id: true, name: true, email: true, createdAt: true } },
      role: true,
    },
    orderBy: { createdAt: "asc" },
  });

const getMembershipsByRoleId = (roleId) =>
  prisma.membership.findMany({ where: { roleId }, include: { user: true } });

const countRoleMemberships = (roleId) =>
  prisma.membership.count({ where: { roleId } });

const setMemberRole = (membershipId, roleId) =>
  prisma.membership.update({
    where: { id: membershipId },
    data: { roleId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      role: true,
    },
  });

const removeMember = (membershipId) =>
  prisma.membership.delete({ where: { id: membershipId } });

// ---------- Roles ----------

const listRoles = (workspaceId) =>
  prisma.role.findMany({
    where: { workspaceId },
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: "asc" },
  });

const getRole = (workspaceId, roleId) =>
  prisma.role.findFirst({
    where: { id: roleId, workspaceId },
    include: roleIncludeFields,
  });

const getRoleByName = (workspaceId, name) =>
  prisma.role.findFirst({ where: { workspaceId, name } });

const createCustomRole = (workspaceId, name) =>
  prisma.role.create({
    data: { workspaceId, name, isSystem: false },
    include: roleIncludeFields,
  });

const renameRole = (roleId, name) =>
  prisma.role.update({ where: { id: roleId }, data: { name }, include: roleIncludeFields });

// Replaces the full permission set of a custom role. Unknown codes reject
// inside the transaction so nothing is half-applied.
const setRolePermissions = (roleId, codes) =>
  prisma.$transaction(async (tx) => {
    const unknown = [];
    const permissionIds = [];
    for (const code of codes) {
      const permission = await tx.permission.findUnique({ where: { code } });
      if (!permission) unknown.push(code);
      else permissionIds.push(permission.id);
    }
    if (unknown.length > 0) {
      const err = new Error(
        `Unknown permission codes: ${unknown.join(", ")}`
      );
      err.statusCode = 400;
      throw err;
    }

    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      });
    }

    return tx.role.findFirst({
      where: { id: roleId },
      include: roleIncludeFields,
    });
  });

// Deleting a role that still has members or pending invites is blocked by
// the controller; this function only performs the delete.
const deleteRole = (roleId) => prisma.role.delete({ where: { id: roleId } });

const countPendingInvitesForRole = (roleId) =>
  prisma.workspaceInvite.count({ where: { roleId, acceptedAt: null } });

// ---------- Invites ----------

const getMembershipByEmail = (workspaceId, email) =>
  prisma.membership.findFirst({
    where: { workspaceId, user: { email } },
  });

const createInvite = ({ workspaceId, email, roleId, invitedById }) =>
  prisma.workspaceInvite.create({
    data: {
      workspaceId,
      email: email.toLowerCase(),
      roleId,
      invitedById,
      token: crypto.randomBytes(24).toString("hex"),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
    include: { role: true, workspace: true },
  });

const getInviteByToken = (token) =>
  prisma.workspaceInvite.findFirst({
    where: { token },
    include: { workspace: true, role: true },
  });

const getInviteInWorkspace = (workspaceId, inviteId) =>
  prisma.workspaceInvite.findFirst({
    where: { id: inviteId, workspaceId },
    include: { role: true },
  });

const listPendingInvites = (workspaceId) =>
  prisma.workspaceInvite.findMany({
    where: { workspaceId, acceptedAt: null },
    include: { role: true },
    orderBy: { createdAt: "desc" },
  });

const pendingInviteByEmail = (workspaceId, email) =>
  prisma.workspaceInvite.findFirst({
    where: { workspaceId, email: email.toLowerCase(), acceptedAt: null },
    include: { role: true },
  });

const getPendingInviteById = (workspaceId, inviteId) =>
  prisma.workspaceInvite.findFirst({
    where: { id: inviteId, workspaceId, acceptedAt: null },
  });

const cancelInvite = (inviteId) =>
  prisma.workspaceInvite.delete({ where: { id: inviteId } });

// Marks the invite accepted and upserts the membership in one transaction.
// If the user is already a member the invite is just marked accepted.
const acceptInvite = ({ invite, userId }) =>
  prisma.$transaction(async (tx) => {
    const existing = await tx.membership.findFirst({
      where: { workspaceId: invite.workspaceId, userId },
    });

    const membership =
      existing ||
      (await tx.membership.create({
        data: {
          workspaceId: invite.workspaceId,
          userId,
          roleId: invite.roleId,
        },
      }));

    await tx.workspaceInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    return { membership, role: invite.role, workspace: invite.workspace };
  });

module.exports = {
  INVITE_TTL_DAYS,
  seedPermissions,
  getPermissions,
  getWorkspaceById,
  listAllWorkspaces,
  listWorkspacesForUser,
  createWorkspace,
  updateWorkspace,
  softDeleteWorkspace,
  transferOwnership,
  getMembership,
  getMembershipById,
  getMembershipByEmail,
  listMembers,
  getMembershipsByRoleId,
  countRoleMemberships,
  setMemberRole,
  removeMember,
  listRoles,
  getRole,
  getRoleByName,
  createCustomRole,
  renameRole,
  setRolePermissions,
  deleteRole,
  countPendingInvitesForRole,
  createInvite,
  getInviteByToken,
  getInviteInWorkspace,
  listPendingInvites,
  pendingInviteByEmail,
  getPendingInviteById,
  cancelInvite,
  acceptInvite,
};
