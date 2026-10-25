const prisma = require("../../prismaClient");

// this ensures evert task fetch returns its relatkionships consistently
const taskInclude = {
  status: true,
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

// Builds the shared `where` clause for listing tasks.
const buildTaskWhere = (filters = {}) => ({
  deletedAt: null,
  ...(filters.statusId && { statusId: filters.statusId }),
  ...(filters.createdById && {
    createdById: filters.createdById,
    createdByType: filters.createdByType,
  }),
  ...(filters.endFlag !== undefined && { endFlag: filters.endFlag }),
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

const getTaskById = async (id) => {
  return prisma.task.findFirst({
    where: { id, deletedAt: null },
    include: taskInclude,
  });
};

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

const getStatusByCode = (code) => prisma.status.findUnique({ where: { code } });

const findExistingCategoryIds = async (ids) => {
  if (!ids?.length) return [];

  const found = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });

  return found.map((c) => c.id);
};

const findExistingAssignables = async (assignments) => {
  if(!assignments?.length) return [];

  const users = await prisma.user.findMany({
    where: {id: {in: assignments.map((a) => a.assignableId)}},
    select: {id: true}
  });
  const admins = await prisma.admin.findMany({
    where: {id: {in: assignments.map((a) => a.assignableId)}},
    select: {id: true}
  });

  return [...users, ...admins].map((a) => a.id);
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
  updateTask,
  deleteTask,
  taskInclude,
};
