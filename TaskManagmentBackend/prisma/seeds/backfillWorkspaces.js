// ONE-TIME data migration for the workspace transition. Run after
// `prisma migrate deploy` and BEFORE 20261031000001_workspace_scoping_required
// (which flips task/workspace_id and category/workspace_id to NOT NULL).
//
// What it does (idempotent — re-running skips anything already assigned):
//   1. Seeds the permission catalog.
//   2. Creates a default workspace ("<name>'s Workspace") for every user,
//      with the OWNER/ADMIN/USER system roles and the OWNER membership.
//   3. Moves every legacy task/category into a workspace:
//        - USER-created task  -> creator's default workspace
//        - ADMIN-created task -> the workspace of its first assigned user,
//          falling back to the oldest user's workspace
//        - subtask            -> inherits its parent's workspace
//        - category           -> the workspace of the first task that uses it,
//          falling back to the oldest user's workspace
require("dotenv").config();
const prisma = require("../../prismaClient");
const { seedPermissions, createWorkspace } = require("../../repository/Workspace/workspaceRepository");

const ensureDefaultWorkspace = async (user) => {
  const existing = await prisma.workspace.findFirst({
    where: { ownerUserId: user.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  const { workspace } = await createWorkspace({
    name: `${user.name}'s Workspace`,
    ownerUserId: user.id,
  });

  return workspace;
};

const run = async () => {
  await seedPermissions();

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const workspacesByUserId = {};

  for (const user of users) {
    const workspace = await ensureDefaultWorkspace(user);
    workspacesByUserId[user.id] = workspace.id;
  }

  if (users.length === 0) {
    console.log("No users to migrate.");
  }

  // For orphan admin-created tasks: the oldest user's workspace is the
  // deterministic fallback.
  const fallbackWorkspaceId = users[0]
    ? workspacesByUserId[users[0].id]
    : null;

  // Move top-level tasks (including soft-deleted ones — every row must get a
  // workspace before the NOT NULL migration runs).
  const orphanTasks = await prisma.task.findMany({
    where: { workspaceId: null, parentTaskId: null },
    include: { assignments: true },
  });

  for (const task of orphanTasks) {
    let workspaceId = workspacesByUserId[
      task.createdByType === "USER" ? task.createdById : null
    ];

    if (!workspaceId) {
      // ADMIN-created: prefer the workspace of the first assigned user.
      const firstUserAssignment = task.assignments.find(
        (a) => a.assignableType === "USER" && workspacesByUserId[a.assignableId]
      );

      workspaceId = firstUserAssignment
        ? workspacesByUserId[firstUserAssignment.assignableId]
        : fallbackWorkspaceId;
    }

    if (!workspaceId) continue;

    await prisma.task.update({
      where: { id: task.id },
      data: { workspaceId },
    });
  }

  // Subtasks inherit their parent's workspace
  const orphanSubtasks = await prisma.task.findMany({
    where: { workspaceId: null, parentTaskId: { not: null } },
  });

  for (const subtask of orphanSubtasks) {
    const parent = await prisma.task.findUnique({
      where: { id: subtask.parentTaskId },
      select: { workspaceId: true },
    });

    if (!parent?.workspaceId) continue;

    await prisma.task.update({
      where: { id: subtask.id },
      data: { workspaceId: parent.workspaceId },
    });
  }

  // Categories go to the workspace of their first referencing task
  const orphanCategories = await prisma.category.findMany({
    where: { workspaceId: null },
    include: { tasks: { include: { task: { select: { workspaceId: true } } } } },
  });

  for (const category of orphanCategories) {
    const firstWorkspaceId = category.tasks
      .map((p) => p.task.workspaceId)
      .find(Boolean);

    const workspaceId = firstWorkspaceId || fallbackWorkspaceId;

    if (workspaceId) {
      await prisma.category.update({
        where: { id: category.id },
        data: { workspaceId },
      });
    }
  }

  const remaining =
    (await prisma.task.count({ where: { workspaceId: null } })) +
    (await prisma.category.count({ where: { workspaceId: null } }));

  console.log(
    `Backfill done. Rows still without a workspace: ${remaining} (should be 0).`
  );
};

run().finally(() => prisma.$disconnect());
