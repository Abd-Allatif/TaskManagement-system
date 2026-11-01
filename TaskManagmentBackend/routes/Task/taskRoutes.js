const express = require("express");
const verifyToken = require("../../middleware/auth");
const {
  resolveWorkspace,
  resolveWorkspaceOptional,
} = require("../../middleware/workspace");
const { requirePermission } = require("../../middleware/permissions");
const {
  loadWorkspaceTask,
  taskInWorkspaceGuard,
  assertTaskUpdateAccess,
  assertTaskDeleteAccess,
} = require("../../middleware/authorization");
const {
  createTask,
  getTaskById,
  getTasks,
  updateTask,
  deleteTask,
} = require("../../controllers/Task/taskController");
const {
  createTaskRules,
  updateTaskRules,
  validate,
} = require("../../middleware/validators/taskValidators");

const router = express.Router();

// All task routes require authentication.
router.use(verifyToken);

// Listing: members must send X-Workspace-Id; a platform admin may omit it to
// see tasks across every workspace.
router.get("/", resolveWorkspaceOptional, getTasks);

// Sees any task cross-workspace in sudo mode; members only within theirs.
router.get("/:id", resolveWorkspaceOptional, loadWorkspaceTask, getTaskById);

// Creation always targets a workspace — the header is mandatory.
router.post(
  "/",
  resolveWorkspace,
  requirePermission("task.create"),
  createTaskRules,
  validate,
  createTask
);

// Update (workspace member with the right permission, or the task's creator)
router.put(
  "/:id",
  updateTaskRules,
  validate,
  resolveWorkspaceOptional,
  loadWorkspaceTask,
  taskInWorkspaceGuard,
  assertTaskUpdateAccess,
  updateTask
);

// Delete (soft) — same hybrid as update with its own permission codes
router.delete(
  "/:id",
  resolveWorkspaceOptional,
  loadWorkspaceTask,
  taskInWorkspaceGuard,
  assertTaskDeleteAccess,
  deleteTask
);

module.exports = router;
