const prisma = require("../prismaClient");

// Resolves the active workspace from the `X-Workspace-Id` header and attaches
// it (plus the caller's membership and permission set) to the request:
//
//   req.workspace       — the non-deleted workspace row
//   req.member          — the membership with role + permissions (users only)
//   req.permissions     — Set of permission codes (users only)
//   req.isPlatformAdmin — true for ADMIN-typed tokens (they bypass membership)
//
// Platform admins never need a membership, but they still must pass a valid
// workspace id when a request requires one.
const resolveWorkspace = async (req, res, next) => {
  try {
    const workspaceId = req.headers["x-workspace-id"];

    if (!workspaceId) {
      return res.status(400).json({
        message:
          "X-Workspace-Id header is required. Send the id of the workspace you are operating in.",
      });
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    req.workspace = workspace;

    if (req.user && req.user.type === "ADMIN") {
      req.isPlatformAdmin = true;
      return next();
    }

    const membership = await prisma.membership.findFirst({
      where: { workspaceId: workspace.id, userId: req.user.id },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!membership) {
      return res.status(403).json({
        message: "Forbidden. You are not a member of this workspace.",
      });
    }

    req.member = membership;
    req.permissions = new Set(
      membership.role.rolePermissions.map((rp) => rp.permission.code)
    );

    return next();
  } catch (err) {
    return next(err);
  }
};

// Same as resolveWorkspace but tolerant of a missing header — used on read
// endpoints where a platform admin may omit the header to see data across
// all workspaces. Non-admin users must still supply the header.
const resolveWorkspaceOptional = async (req, res, next) => {
  try {
    const isPlatformAdmin = req.user && req.user.type === "ADMIN";

    if (!req.headers["x-workspace-id"]) {
      if (!isPlatformAdmin) {
        return res.status(400).json({
          message:
            "X-Workspace-Id header is required. Send the id of the workspace you are operating in.",
        });
      }

      // Sudo mode: no workspace context, service sees everything.
      req.isPlatformAdmin = true;
      return next();
    }

    return resolveWorkspace(req, res, next);
  } catch (err) {
    return next(err);
  }
};

// For routes embedded under /api/workspaces/:id — the workspace is identified
// by the id param instead of the header.
const resolveParamWorkspace = async (req, res, next) => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    req.workspace = workspace;

    if (req.user && req.user.type === "ADMIN") {
      req.isPlatformAdmin = true;
      return next();
    }

    const membership = await prisma.membership.findFirst({
      where: { workspaceId: workspace.id, userId: req.user.id },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!membership) {
      return res.status(403).json({
        message: "Forbidden. You are not a member of this workspace.",
      });
    }

    req.member = membership;
    req.permissions = new Set(
      membership.role.rolePermissions.map((rp) => rp.permission.code)
    );

    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = { resolveWorkspace, resolveWorkspaceOptional, resolveParamWorkspace };
