const prisma = require("../../prismaClient");

// this ensures evert task fetch returns its relatkionships consistently
const taskInclude = {
  status: true,
  workspace: { select: { id: true, name: true } },
  assignments: true,
  categories: { include: { category: true } },
  subTasks: true,
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// Only these columns may be used for ordering — prevents arbitrary keys from
// reaching Prisma's `orderBy`.
const SORTABLE_FIELDS = [
  "createDate",
  "deadline",
  "title",
  "createdAt",
  "endFlag",
];

// Normalizes `page`/`limit` query strings, clamping them to sane bounds.
const parsePagination = (filters = {}) => {
  const page = Math.max(1, parseInt(filters.page, 10) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(filters.limit, 10) || DEFAULT_LIMIT)
  );

  return { page, limit, skip: (page - 1) * limit };
};

// Builds the shared `where` clause for listing tasks. `workspaceId` is the
// workspace-isolation filter — the caller (controller) always supplies it
// for members and leaves it undefined only for a platform admin sweeping
// across workspaces in sudo mode.
const buildTaskWhere = (filters = {}) => ({
  deletedAt: null,
  ...(filters.workspaceId !== undefined && {
    workspaceId: filters.workspaceId,
  }),
  ...(filters.statusId && { statusId: filters.statusId }),
  ...(filters.createdById && {
    createdById: filters.createdById,
    createdByType: filters.createdByType,
  }),
  ...(filters.endFlag !== undefined && { endFlag: filters.endFlag }),
  ...(filters.parentTaskId !== undefined && {
    parentTaskId: filters.parentTaskId,
  }),
  ...(filters.search && {
    OR: [
      { title: { contains: filters.search } },
      { description: { contains: filters.search } },
    ],
  }),
});

// CRUD

// Create
const createTask = async (data) => {
  // destructure the data to separate out the relationships from the task data
  // Where taskData is the column that lives dricetly on the task table, and the rest are relationships that need to be created separately
  // CreatedBy -- {type, id}
  const { categories = [], assignments = [], createdBy, ...taskData } = data;

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        ...taskData,
        createdByType: createdBy.type,
        createdById: createdBy.id,
        categories: {
          create: categories.map((categoryId) => ({ categoryId })),
        },
        assignments: {
          create: assignments.map(({ assignableType, assignableId }) => ({
            assignableType,
            assignableId,
          })),
        },
      },
      include: taskInclude,
    });
    return task;
  });
};

// Read

const getTaskById = (id, workspaceId) =>
  prisma.task.findFirst({
    where: {
      id,
      deletedAt: null,
      // undefined = platform admin sweep; a concrete id = member scoping
      ...(workspaceId !== undefined && { workspaceId }),
    },
    include: taskInclude,
  });

const getTasks = async (filters = {}) => {
  const { page, limit, skip } = parsePagination(filters);
  const where = buildTaskWhere(filters);
  const sortBy = SORTABLE_FIELDS.includes(filters.sortBy)
    ? filters.sortBy
    : "createDate";
  const sortOrder = filters.sortOrder === "asc" ? "asc" : "desc";

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
    }),
    prisma.task.count({ where }),
  ]);

  return {
    tasks,
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
};

const getStatusByCode = (code) =>
  prisma.status.findFirst({ where: { code, deletedAt: null } });

const findExistingCategoryIds = (workspaceId, ids) => {
  if (!ids?.length) return Promise.resolve([]);

  // Categories are workspace-scoped: a category from another workspace must
  // not validate as "existing" for a task in here.
  return prisma.category
    .findMany({
      where: { id: { in: ids }, workspaceId, deletedAt: null },
      select: { id: true },
    })
    .then((found) => found.map((c) => c.id));
};

const findExistingAssignables = (assignments, workspaceId) => {
  if (!assignments?.length) return Promise.resolve([]);

  // Group the requested IDs by type, so each table is only queried with the
  // IDs that are supposed to live in it (`assignableType` picks the table).
  const idsByType = { USER: new Set(), ADMIN: new Set() };
  for (const { assignableType, assignableId } of assignments) {
    if (idsByType[assignableType]) idsByType[assignableType].add(assignableId);
  }

  const userLookup = () => {
    const userIds = [...idsByType.USER];
    if (userIds.length === 0) return Promise.resolve([]);

    // Assignees must be members of the task's workspace. The membership
    // filter also rejects users from other workspaces even when the id
    // exists globally.
    return prisma.membership
      .findMany({
        where: { workspaceId, userId: { in: userIds } },
        select: { userId: true },
      })
      .then((m) => m.map((m) => m.userId));
  };

  const adminLookup = () => {
    const adminIds = [...idsByType.ADMIN];
    if (adminIds.length === 0) return Promise.resolve([]);

    return prisma.admin
      .findMany({
        where: { id: { in: adminIds }, deletedAt: null },
        select: { id: true },
      })
      .then((a) => a.map((a) => a.id));
  };

  return Promise.all([userLookup(), adminLookup()]).then(([users, admins]) => [
    ...users.map((u) => `USER:${u}`),
    ...admins.map((a) => `ADMIN:${a}`),
  ]);
};

// A valid parent must exist, not be soft-deleted, live in the same workspace
// (isolation), and be a root task itself (subtasks cannot have children —
// nesting stays one level deep).
const findExistingParentTask = (workspaceId, id) => {
  if (!id) return Promise.resolve(null);

  return prisma.task.findFirst({
    where: { id, deletedAt: null, parentTaskId: null, workspaceId },
    select: { id: true },
  });
};

// Update
// A scalar-only update keeps the original behaviour. When categories or
// assignments are supplied the relations are replaced inside a transaction so
// the task and its relations stay consistent.
const updateTask = async (id, data) => {
  const { categories, assignments, ...taskData } = data;

  if (categories === undefined && assignments === undefined) {
    return prisma.task.update({
      where: { id },
      data: taskData,
      include: taskInclude,
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: taskData,
    });

    if (categories !== undefined) {
      await tx.categoryTaskPivot.deleteMany({ where: { taskId: id } });
      if (categories.length > 0) {
        await tx.categoryTaskPivot.createMany({
          data: categories.map((categoryId) => ({ taskId: id, categoryId })),
        });
      }
    }

    if (assignments !== undefined) {
      await tx.taskAssignment.deleteMany({ where: { taskId: id } });
      if (assignments.length > 0) {
        await tx.taskAssignment.createMany({
          data: assignments.map(({ assignableType, assignableId }) => ({
            taskId: id,
            assignableType,
            assignableId,
          })),
        });
      }
    }

    return tx.task.findFirst({
      where: { id, deletedAt: null },
      include: taskInclude,
    });
  });
};

// Soft Delete
const deleteTask = async (id) => {
  return prisma.task.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
};

module.exports = {
  createTask,
  getTaskById,
  getTasks,
  getStatusByCode,
  findExistingCategoryIds,
  findExistingAssignables,
  findExistingParentTask,
  updateTask,
  deleteTask,
  taskInclude,
};
