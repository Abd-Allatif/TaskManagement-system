jest.mock("../prismaClient", () => ({
  task: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  status: {
    findUnique: jest.fn(),
  },
  category: {
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  admin: {
    findMany: jest.fn(),
  },
  categoryTaskPivot: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  taskAssignment: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
}));

const prisma = require("../prismaClient");
const taskRepository = require("../repository/Task/taskRepository");

beforeEach(() => {
  jest.clearAllMocks();
  // createTask passes a callback to $transaction, so invoke it with prisma as `tx`.
  prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
  prisma.task.count.mockResolvedValue(0);
  prisma.task.findFirst.mockResolvedValue({ id: "t1" });
});

describe("createTask", () => {
  it("creates the task in a transaction with createdBy and nested relations", async () => {
    const created = { id: "t1" };
    prisma.task.create.mockResolvedValue(created);

    const result = await taskRepository.createTask({
      title: "Task",
      statusId: "s1",
      categories: ["c1", "c2"],
      assignments: [{ assignableType: "USER", assignableId: "u1" }],
      createdBy: { type: "USER", id: "u1" },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: {
        title: "Task",
        statusId: "s1",
        createdByType: "USER",
        createdById: "u1",
        categories: { create: [{ categoryId: "c1" }, { categoryId: "c2" }] },
        assignments: {
          create: [{ assignableType: "USER", assignableId: "u1" }],
        },
      },
      include: expect.any(Object),
    });
    expect(result).toBe(created);
  });

  it("defaults categories and assignments to empty arrays", async () => {
    prisma.task.create.mockResolvedValue({});

    await taskRepository.createTask({
      title: "T",
      statusId: "s1",
      createdBy: { type: "USER", id: "u1" },
    });

    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data.categories).toEqual({ create: [] });
    expect(data.assignments).toEqual({ create: [] });
  });
});

describe("getTaskById", () => {
  it("excludes soft-deleted tasks and includes relations", async () => {
    prisma.task.findFirst.mockResolvedValue({ id: "t1" });

    await taskRepository.getTaskById("t1");

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", deletedAt: null },
      include: expect.any(Object),
    });
  });
});

describe("getTasks", () => {
  it("always filters out soft-deleted tasks and orders newest first", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    await taskRepository.getTasks();

    const arg = prisma.task.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ deletedAt: null });
    expect(arg.orderBy).toEqual({ createDate: "desc" });
    expect(arg.include).toEqual(expect.any(Object));
  });

  it("applies a statusId filter", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    await taskRepository.getTasks({ statusId: "s1" });

    expect(prisma.task.findMany.mock.calls[0][0].where.statusId).toBe("s1");
  });

  it("applies a creator filter as a pair", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    await taskRepository.getTasks({ createdById: "u1", createdByType: "USER" });

    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.createdById).toBe("u1");
    expect(where.createdByType).toBe("USER");
  });

  it("applies an endFlag filter", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    await taskRepository.getTasks({ endFlag: true });

    expect(prisma.task.findMany.mock.calls[0][0].where.endFlag).toBe(true);
  });

  it("filters subtasks by parentTaskId", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    await taskRepository.getTasks({ parentTaskId: "p1" });

    expect(prisma.task.findMany.mock.calls[0][0].where.parentTaskId).toBe("p1");
  });

  it("can list only root tasks with parentTaskId: null", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    await taskRepository.getTasks({ parentTaskId: null });

    expect(prisma.task.findMany.mock.calls[0][0].where.parentTaskId).toBeNull();
  });

  it("searches title and description and returns pagination metadata", async () => {
    prisma.task.findMany.mockResolvedValue([{ id: "t1" }]);
    prisma.task.count.mockResolvedValue(1);

    const result = await taskRepository.getTasks({ search: "deploy", page: 2, limit: 5 });

    const arg = prisma.task.findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { title: { contains: "deploy" } },
      { description: { contains: "deploy" } },
    ]);
    expect(arg.skip).toBe(5);
    expect(arg.take).toBe(5);
    expect(result).toEqual({
      tasks: [{ id: "t1" }],
      total: 1,
      page: 2,
      limit: 5,
      totalPages: 1,
    });
  });

  it("defaults to page 1, limit 10 and clamps oversized limits", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);

    const result = await taskRepository.getTasks({ limit: 500 });

    const arg = prisma.task.findMany.mock.calls[0][0];
    expect(arg.skip).toBe(0);
    expect(arg.take).toBe(100);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
    expect(result.totalPages).toBe(0);
  });

  it("honours sortBy and sortOrder", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    await taskRepository.getTasks({ sortBy: "deadline", sortOrder: "asc" });

    expect(prisma.task.findMany.mock.calls[0][0].orderBy).toEqual({
      deadline: "asc",
    });
  });

  it("falls back to createDate desc for an unknown sort field", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    await taskRepository.getTasks({ sortBy: "hacked", sortOrder: "sideways" });

    expect(prisma.task.findMany.mock.calls[0][0].orderBy).toEqual({
      createDate: "desc",
    });
  });
});

describe("getStatusByCode", () => {
  it("finds a status by its unique code", async () => {
    prisma.status.findUnique.mockResolvedValue({ id: "s1", code: "PENDING" });

    const result = await taskRepository.getStatusByCode("PENDING");

    expect(prisma.status.findUnique).toHaveBeenCalledWith({
      where: { code: "PENDING" },
    });
    expect(result).toEqual({ id: "s1", code: "PENDING" });
  });
});

describe("findExistingCategoryIds", () => {
  it("returns [] without querying when there is nothing to check", async () => {
    const result = await taskRepository.findExistingCategoryIds([]);

    expect(result).toEqual([]);
    expect(prisma.category.findMany).not.toHaveBeenCalled();
  });

  it("returns only the IDs that exist", async () => {
    prisma.category.findMany.mockResolvedValue([{ id: "c1" }]);

    const result = await taskRepository.findExistingCategoryIds(["c1", "c2"]);

    expect(result).toEqual(["c1"]);
  });
});

describe("findExistingAssignables", () => {
  it("returns [] without querying when there is nothing to check", async () => {
    const result = await taskRepository.findExistingAssignables([]);

    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.admin.findMany).not.toHaveBeenCalled();
  });

  it("checks each ID only in the table matching its assignableType", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "u1" }]);
    prisma.admin.findMany.mockResolvedValue([{ id: "a1" }]);

    const result = await taskRepository.findExistingAssignables([
      { assignableType: "USER", assignableId: "u1" },
      { assignableType: "ADMIN", assignableId: "a1" },
    ]);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["u1"] } },
      select: { id: true },
    });
    expect(prisma.admin.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["a1"] } },
      select: { id: true },
    });
    expect(result).toEqual(["USER:u1", "ADMIN:a1"]);
  });

  it("does not query a table when no ID is declared for that type", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "u1" }]);

    const result = await taskRepository.findExistingAssignables([
      { assignableType: "USER", assignableId: "u1" },
    ]);

    expect(prisma.admin.findMany).not.toHaveBeenCalled();
    expect(result).toEqual(["USER:u1"]);
  });

  it("omits unknown assignableTypes from validity", async () => {
    const result = await taskRepository.findExistingAssignables([
      { assignableType: "GHOST", assignableId: "g1" },
    ]);

    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.admin.findMany).not.toHaveBeenCalled();
  });
});

describe("findExistingParentTask", () => {
  it("returns null without querying when no id is given", async () => {
    const result = await taskRepository.findExistingParentTask("");

    expect(result).toBeNull();
    expect(prisma.task.findFirst).not.toHaveBeenCalled();
  });

  it("only accepts an existing, non-deleted root task as parent", async () => {
    prisma.task.findFirst.mockResolvedValue({ id: "p1" });

    const result = await taskRepository.findExistingParentTask("p1");

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: "p1", deletedAt: null, parentTaskId: null },
      select: { id: true },
    });
    expect(result).toEqual({ id: "p1" });
  });
});

describe("updateTask", () => {
  it("updates by id and includes relations", async () => {
    prisma.task.update.mockResolvedValue({ id: "t1" });

    await taskRepository.updateTask("t1", { title: "New" });

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { title: "New" },
      include: expect.any(Object),
    });
  });

  it("skips the transaction for a scalar-only update", async () => {
    prisma.task.update.mockResolvedValue({ id: "t1" });

    await taskRepository.updateTask("t1", { title: "New" });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.categoryTaskPivot.deleteMany).not.toHaveBeenCalled();
    expect(prisma.taskAssignment.deleteMany).not.toHaveBeenCalled();
  });

  it("replaces categories and assignments in a transaction when provided", async () => {
    const result = await taskRepository.updateTask("t1", {
      title: "New",
      categories: ["c1"],
      assignments: [{ assignableType: "USER", assignableId: "u1" }],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.categoryTaskPivot.deleteMany).toHaveBeenCalledWith({
      where: { taskId: "t1" },
    });
    expect(prisma.categoryTaskPivot.createMany).toHaveBeenCalledWith({
      data: [{ taskId: "t1", categoryId: "c1" }],
    });
    expect(prisma.taskAssignment.deleteMany).toHaveBeenCalledWith({
      where: { taskId: "t1" },
    });
    expect(prisma.taskAssignment.createMany).toHaveBeenCalledWith({
      data: [{ taskId: "t1", assignableType: "USER", assignableId: "u1" }],
    });
    expect(prisma.task.findFirst).toHaveBeenCalled();
    expect(result).toEqual({ id: "t1" });
  });

  it("clears relations when an empty array is supplied", async () => {
    await taskRepository.updateTask("t1", { categories: [], assignments: [] });

    expect(prisma.categoryTaskPivot.deleteMany).toHaveBeenCalledWith({
      where: { taskId: "t1" },
    });
    expect(prisma.categoryTaskPivot.createMany).not.toHaveBeenCalled();
    expect(prisma.taskAssignment.deleteMany).toHaveBeenCalledWith({
      where: { taskId: "t1" },
    });
    expect(prisma.taskAssignment.createMany).not.toHaveBeenCalled();
  });
});

describe("deleteTask", () => {
  it("soft-deletes by stamping deletedAt", async () => {
    prisma.task.update.mockResolvedValue({});

    await taskRepository.deleteTask("t1");

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
