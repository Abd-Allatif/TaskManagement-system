const express = require("express");
const verifyToken = require("../../middleware/auth");
const {
  resolveParamWorkspace,
} = require("../../middleware/workspace");
const {
  requirePermission,
  requireWorkspaceOwner,
} = require("../../middleware/permissions");
const {
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
} = require("../../controllers/Workspace/workspaceController");
const {
  validateCreate,
  validateUpdate,
  validateTransfer,
  validateCreateRole,
  validateUpdateRole,
  validateSetRolePermissions,
  validateInvite,
  validateRedeem,
} = require("../../middleware/validators/workspaceValidators");

const router = express.Router();

// All workspace routes require authentication.
router.use(verifyToken);

// Redeem an invite token (any signed-in user; the token carries the email
// match requirement). Registered before the /:id routes so it is not
// captured as a workspace id.
router.post("/invites/redeem", validateRedeem, redeemInvite);

// Create — the creator becomes OWNER (workspace + system roles + membership
// are created atomically).
router.post("/", validateCreate, createWorkspace);

// List my memberships (platform admins get every workspace).
router.get("/", listWorkspaces);

// Everything below is scoped to the workspace id param.
router.use("/:id", resolveParamWorkspace);

router.patch(
  "/:id",
  requirePermission("workspace.update"),
  validateUpdate,
  updateWorkspace
);

// Owner-only (or platform admin).
router.delete("/:id", requireWorkspaceOwner, deleteWorkspace);

router.post(
  "/:id/transfer-ownership",
  requireWorkspaceOwner,
  validateTransfer,
  transferOwnership
);

// Members
router.get("/:id/members", listMembers);

router.patch(
  "/:id/members/:userId",
  requirePermission("member.role.assign"),
  updateMemberRole
);

router.delete(
  "/:id/members/:userId",
  requirePermission("member.remove"),
  removeMember
);

// Roles (READ open to every member; writes need role.* permissions)
router.get("/:id/roles", listRoles);

router.post(
  "/:id/roles",
  requirePermission("role.create"),
  validateCreateRole,
  createRole
);

router.patch(
  "/:id/roles/:roleId",
  requirePermission("role.update"),
  validateUpdateRole,
  updateRole
);

router.put(
  "/:id/roles/:roleId/permissions",
  requirePermission("role.update"),
  validateSetRolePermissions,
  setRolePermissions
);

router.delete(
  "/:id/roles/:roleId",
  requirePermission("role.delete"),
  deleteRole
);

// Invites
router.post(
  "/:id/invites",
  requirePermission("member.invite"),
  validateInvite,
  createInvite
);

router.get("/:id/invites", requirePermission("member.invite"), listInvites);

router.delete(
  "/:id/invites/:inviteId",
  requirePermission("member.invite"),
  cancelInvite
);

module.exports = router;
