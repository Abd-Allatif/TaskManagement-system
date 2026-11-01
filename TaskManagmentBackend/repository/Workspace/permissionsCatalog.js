// The permission catalog and the permission sets of the three per-workspace
// system roles. This file is the single source of truth: the
// permissionSeed.js script and workspace creation (which seeds OWNER/ADMIN/
// USER roles for every new workspace) both read from it.

const ALL_PERMISSIONS = [
  { code: "workspace.update", label: "Rename and update the workspace" },
  { code: "workspace.delete", label: "Delete the workspace (owner only by default)" },
  { code: "workspace.transfer", label: "Transfer workspace ownership to another member" },
  { code: "member.invite", label: "Invite new members to the workspace" },
  { code: "member.remove", label: "Remove members from the workspace" },
  { code: "member.role.assign", label: "Change the role of another member" },
  { code: "role.create", label: "Create custom roles in the workspace" },
  { code: "role.update", label: "Rename custom roles and change their permissions" },
  { code: "role.delete", label: "Delete custom roles in the workspace" },
  { code: "task.create", label: "Create tasks in the workspace" },
  { code: "task.update.own", label: "Update tasks they created" },
  { code: "task.update.any", label: "Update any task in the workspace" },
  { code: "task.delete.own", label: "Soft-delete tasks they created" },
  { code: "task.delete.any", label: "Soft-delete any task in the workspace" },
  { code: "task.assign", label: "Assign tasks to members in the workspace" },
  { code: "category.create", label: "Create categories in the workspace" },
  { code: "category.update", label: "Update categories in the workspace" },
  { code: "category.delete", label: "Delete categories in the workspace" },
];

const ALL_CODES = ALL_PERMISSIONS.map((p) => p.code);

// System roles seeded for every workspace. Permissions are looked up by
// `code` at creation time, so new workspaces always reflect this catalog.
const SYSTEM_ROLES = {
  OWNER: ALL_CODES,
  ADMIN: ALL_CODES.filter(
    (code) => code !== "workspace.delete" && code !== "workspace.transfer"
  ),
  USER: [
    "task.create",
    "task.update.own",
    "task.delete.own",
    "task.assign",
    "category.create",
  ],
};

module.exports = { ALL_PERMISSIONS, SYSTEM_ROLES };
