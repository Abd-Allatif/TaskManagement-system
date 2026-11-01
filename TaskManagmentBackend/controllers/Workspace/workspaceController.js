const workspaceRepository = require("../../repository/Workspace/workspaceRepository");
const authRepository = require("../../repository/Authentication/authRepository");

// Create — the creator always becomes the workspace OWNER and its first
// member (system roles are seeded in the same transaction).
const createWorkspace = async (req, res) => {
  const { workspace } = await workspaceRepository.createWorkspace({
    name: req.body.name,
    ownerUserId: req.user.id,
  });

  return res
    .status(201)
    .json({ message: "Workspace created successfully", workspace });
};

// List. Platform admins get every workspace (superuser); users get the
// workspaces they are members of, each with its role.
const listWorkspaces = async (req, res) => {
  if (req.isPlatformAdmin) {
    const workspaces = await workspaceRepository.listAllWorkspaces();
    return res.status(200).json({ workspaces, scope: "all" });
  }

  const memberships = await workspaceRepository.listWorkspacesForUser(
    req.user.id
  );

  return res.status(200).json({
    // Permission codes ride along so the UI can gate affordances without a
    // second round-trip; the server remains the enforcement point.
    workspaces: memberships.map((m) => ({
      ...m.workspace,
      role: {
        id: m.role.id,
        name: m.role.name,
        isSystem: m.role.isSystem,
        permissions: (m.role.rolePermissions || []).map((rp) => rp.permission.code),
      },
      isOwner: req.user.id === m.workspace.ownerUserId,
    })),
    scope: "memberships",
  });
};

const updateWorkspace = async (req, res) => {
  const workspace = await workspaceRepository.updateWorkspace(
    req.workspace.id,
    { name: req.body.name }
  );

  return res
    .status(200)
    .json({ message: "Workspace updated successfully", workspace });
};

// Soft-deletes the workspace, its live tasks and its categories.
const deleteWorkspace = async (req, res) => {
  await workspaceRepository.softDeleteWorkspace(req.workspace.id);

  return res.status(200).json({ message: "Workspace deleted successfully" });
};

// ---------- Members ----------

const listMembers = async (req, res) => {
  const members = await workspaceRepository.listMembers(req.workspace.id);

  return res.status(200).json({ members });
};

const updateMemberRole = async (req, res) => {
  const { userId, } = req.params;
  const { roleId } = req.body;

  const membership = await workspaceRepository.getMembership(
    req.workspace.id,
    userId
  );

  if (!membership) {
    return res.status(404).json({ message: "Member not found" });
  }

  const role = await workspaceRepository.getRole(req.workspace.id, roleId);

  if (!role) {
    return res.status(404).json({ message: "Role not found" });
  }

  // Ownership is transferred through the dedicated endpoint; retyping the
  // owner's membership role here would revoke their owner powers in place.
  if (req.workspace.ownerUserId === userId) {
    return res.status(403).json({
      message:
        "Forbidden. The workspace owner's role is fixed; transfer ownership instead.",
    });
  }

  // OWNER can only be held by the single owner enforced above.
  if (role.name === "OWNER") {
    return res.status(403).json({
      message:
        "Forbidden. Use the ownership transfer endpoint to grant the OWNER role.",
    });
  }

  const updated = await workspaceRepository.setMemberRole(
    membership.id,
    role.id
  );

  return res
    .status(200)
    .json({ message: "Member role updated successfully", member: updated });
};

const removeMember = async (req, res) => {
  const { userId } = req.params;

  const membership = await workspaceRepository.getMembership(
    req.workspace.id,
    userId
  );

  if (!membership) {
    return res.status(404).json({ message: "Member not found" });
  }

  if (req.workspace.ownerUserId === userId) {
    return res.status(403).json({
      message:
        "Forbidden. The workspace owner cannot be removed; transfer ownership first.",
    });
  }

  await workspaceRepository.removeMember(membership.id);

  return res.status(200).json({ message: "Member removed successfully" });
};

const transferOwnership = async (req, res) => {
  const { userId } = req.body;
  const previousOwnerId = req.workspace.ownerUserId;

  if (userId === previousOwnerId) {
    return res.status(400).json({
      message: "The user already owns this workspace",
    });
  }

  const targetMembership = await workspaceRepository.getMembership(
    req.workspace.id,
    userId
  );

  if (!targetMembership) {
    return res.status(404).json({
      message: "The new owner must be an existing member of the workspace",
    });
  }

  const workspace = await workspaceRepository.transferOwnership(
    req.workspace.id,
    previousOwnerId,
    userId
  );

  return res.status(200).json({
    message: "Workspace ownership transferred successfully",
    workspace,
  });
};

// ---------- Roles ----------

const listRoles = async (req, res) => {
  const roles = await workspaceRepository.listRoles(req.workspace.id);

  return res.status(200).json({ roles });
};

const createRole = async (req, res) => {
  const role = await workspaceRepository.createCustomRole(
    req.workspace.id,
    req.body.name
  );

  return res.status(201).json({ message: "Role created successfully", role });
};

const updateRole = async (req, res) => {
  const { roleId } = req.params;
  const role = await workspaceRepository.getRole(req.workspace.id, roleId);

  if (!role) {
    return res.status(404).json({ message: "Role not found" });
  }

  if (role.isSystem) {
    return res.status(403).json({
      message: "Forbidden. System roles (OWNER, ADMIN, USER) cannot be modified.",
    });
  }

  const updated = await workspaceRepository.renameRole(roleId, req.body.name);

  return res.status(200).json({ message: "Role updated successfully", role: updated });
};

const setRolePermissions = async (req, res) => {
  const { roleId } = req.params;
  const role = await workspaceRepository.getRole(req.workspace.id, roleId);

  if (!role) {
    return res.status(404).json({ message: "Role not found" });
  }

  if (role.isSystem) {
    return res.status(403).json({
      message:
        "Forbidden. System roles (OWNER, ADMIN, USER) cannot be modified.",
    });
  }

  const updated = await workspaceRepository.setRolePermissions(
    roleId,
    req.body.permissionCodes
  );

  return res
    .status(200)
    .json({ message: "Role permissions updated successfully", role: updated });
};

const deleteRole = async (req, res) => {
  const { roleId } = req.params;
  const role = await workspaceRepository.getRole(req.workspace.id, roleId);

  if (!role) {
    return res.status(404).json({ message: "Role not found" });
  }

  if (role.isSystem) {
    return res.status(403).json({
      message: "Forbidden. System roles (OWNER, ADMIN, USER) cannot be deleted.",
    });
  }

  const memberCount = await workspaceRepository.countRoleMemberships(roleId);
  if (memberCount > 0) {
    return res.status(409).json({
      message: "Role is still assigned to members. Reassign them first.",
    });
  }

  const pendingInvites =
    await workspaceRepository.countPendingInvitesForRole(roleId);
  if (pendingInvites > 0) {
    return res.status(409).json({
      message: "Role has pending invites. Cancel them first.",
    });
  }

  await workspaceRepository.deleteRole(roleId);

  return res.status(200).json({ message: "Role deleted successfully" });
};

// ---------- Invites ----------

const createInvite = async (req, res) => {
  const { email, roleId } = req.body;

  // Invites record who sent them — a platform admin in sudo mode has no user
  // account to attach, so they cannot send invites.
  if (req.isPlatformAdmin && !req.member) {
    return res.status(403).json({
      message:
        "Forbidden. Only workspace members can invite; platform admins cannot send invites.",
    });
  }

  const role = await workspaceRepository.getRole(req.workspace.id, roleId);

  if (!role) {
    return res.status(404).json({ message: "Role not found" });
  }

  if (role.name === "OWNER") {
    return res.status(400).json({
      message: "Cannot invite someone as OWNER; transfer ownership instead.",
    });
  }

  const existingUser = await authRepository.findByEmail(email);
  if (existingUser) {
    const membership = await workspaceRepository.getMembership(
      req.workspace.id,
      existingUser.id
    );

    if (membership) {
      return res.status(409).json({
        message: "This user is already a member of the workspace",
      });
    }
  }

  const pending = await workspaceRepository.pendingInviteByEmail(
    req.workspace.id,
    email
  );
  if (pending) {
    return res.status(409).json({
      message: "A pending invite already exists for this email",
      invite: pending,
    });
  }

  const invite = await workspaceRepository.createInvite({
    workspaceId: req.workspace.id,
    email,
    roleId,
    invitedById: req.user.id,
  });

  return res.status(201).json({
    message: "Invite created successfully. Share the token with the invitee.",
    invite: { ...invite, token: undefined },
    token: invite.token,
    expiresAt: invite.expiresAt,
  });
};

const listInvites = async (req, res) => {
  const invites = await workspaceRepository.listPendingInvites(req.workspace.id);

  return res.status(200).json({ invites });
};

const cancelInvite = async (req, res) => {
  const invite = await workspaceRepository.getInviteInWorkspace(
    req.workspace.id,
    req.params.inviteId
  );

  if (!invite) {
    return res.status(404).json({ message: "Invite not found" });
  }

  if (invite.acceptedAt) {
    return res.status(400).json({ message: "Invite was already accepted" });
  }

  await workspaceRepository.cancelInvite(invite.id);

  return res.status(200).json({ message: "Invite cancelled successfully" });
};

// Redeems an invite token for the signed-in user (the invitee joins with the
// invited role; the email on the invite must match the account email).
const redeemInvite = async (req, res) => {
  const invite = await workspaceRepository.getInviteByToken(req.body.token);

  if (!invite) {
    return res.status(404).json({ message: "Invite not found" });
  }

  if (invite.acceptedAt) {
    return res.status(400).json({ message: "Invite has already been used" });
  }

  if (new Date(invite.expiresAt) < new Date()) {
    return res.status(400).json({ message: "Invite has expired" });
  }

  if (invite.email.toLowerCase() !== req.user.email.toLowerCase()) {
    return res.status(403).json({
      message:
        "Forbidden. This invite was sent to a different email address.",
    });
  }

  const { membership, role, workspace } = await workspaceRepository.acceptInvite(
    { invite, userId: req.user.id }
  );

  return res.status(200).json({
    message: "Invite redeemed successfully",
    workspace,
    role: { id: role.id, name: role.name },
    membership: { id: membership.id },
  });
};

module.exports = {
  createWorkspace,
  listWorkspaces,
  updateWorkspace,
  deleteWorkspace,
  listMembers,
  updateMemberRole,
  removeMember,
  transferOwnership,
  listRoles,
  createRole,
  updateRole,
  setRolePermissions,
  deleteRole,
  createInvite,
  listInvites,
  cancelInvite,
  redeemInvite,
};
