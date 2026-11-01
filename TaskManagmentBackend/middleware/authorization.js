const taskRepository = require("../repository/Task/taskRepository");
const { hasPermission } = require("./permissions");

// Loads the task addressed by `req.params.id`, enforces workspace isolation
// and attaches it to `req.task`. Soft-deleted tasks are treated as missing.
//
// - Members see tasks inside their resolved workspace only (other-workspace
//   ids 404 instead of leaking existence).
// - Platform admins in sudo mode (no X-Workspace-Id header) can load any
//   task; with a header they are scoped like members.
const loadWorkspaceTask = async (req, res, next) => {
  try {
    const task = await taskRepository.getTaskById(
      req.params.id,
      req.workspace ? req.workspace.id : undefined
    );

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    req.task = task;
    return next();
  } catch (err) {
    return next(err);
  }
};

// ensure the loaded task belongs to the resolved workspace (or the caller is
// a platform admin) before any write proceeds.
const taskInWorkspaceGuard = (req, res, next) => {
  if (!req.task) {
    return next(new Error("taskInWorkspaceGuard must run after loadWorkspaceTask"));
  }

  if (req.workspace && req.task.workspaceId !== req.workspace.id) {
    return res.status(404).json({ message: "Task not found" });
  }

  if (!req.workspace && !req.isPlatformAdmin) {
    return next(
      new Error(
        "Workspace context missing: mount resolveWorkspace(Optional) before task guards"
      )
    );
  }

  return next();
};

// Ownership/permission hybrid for writes. Platform admins always pass;
// members need `task.update.any` / `task.delete.any`, or the matching
// `.own` permission when the task is their own.
const createTaskWriteGuard = (action) => (req, res, next) => {
  if (!req.task) {
    return next(new Error(`Task not loaded: mount loadWorkspaceTask first (${action})`));
  }

  if (req.isPlatformAdmin) {
    return next();
  }

  const isOwnTask =
    req.task.createdById === req.user.id && req.task.createdByType === "USER";

  if (hasPermission(req, `task.${action}.any`)) {
    return next();
  }

  if (isOwnTask && hasPermission(req, `task.${action}.own`)) {
    return next();
  }

  return res.status(403).json({
    message: `Forbidden. You can only ${action} your own tasks.`,
  });
};

const assertTaskUpdateAccess = createTaskWriteGuard("update");
const assertTaskDeleteAccess = createTaskWriteGuard("delete");

module.exports = {
  loadWorkspaceTask,
  taskInWorkspaceGuard,
  assertTaskUpdateAccess,
  assertTaskDeleteAccess,
};
