const hasPermission = (req, code) => {
  if (req.isPlatformAdmin) return true;
  return Boolean(req.permissions && req.permissions.has(code));
};

// Checks a permission code against the caller's resolved workspace role.
// MUST be mounted after resolveWorkspace/resolveParamWorkspace — a missing
// context is an app bug, not a user error.
const requirePermission = (code) => (req, res, next) => {
  if (!req.workspace) {
    return next(
      new Error(
        "Workspace context missing: mount resolveWorkspace before requirePermission"
      )
    );
  }

  if (hasPermission(req, code)) {
    return next();
  }

  return res.status(403).json({
    message: `Forbidden. Missing permission: ${code}`,
  });
};

const isWorkspaceOwner = (req) =>
  Boolean(
    req.workspace &&
      req.user &&
      req.workspace.ownerUserId === req.user.id
  );

// Owner-only actions (delete, transfer). Platform admins count as owners.
const requireWorkspaceOwner = (req, res, next) => {
  if (!req.workspace) {
    return next(
      new Error(
        "Workspace context missing: mount resolveParamWorkspace before requireWorkspaceOwner"
      )
    );
  }

  if (req.isPlatformAdmin || isWorkspaceOwner(req)) {
    return next();
  }

  return res.status(403).json({
    message: "Forbidden. Only the workspace owner can perform this action.",
  });
};

module.exports = {
  hasPermission,
  requirePermission,
  requireWorkspaceOwner,
  isWorkspaceOwner,
};
