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
const {
  createTask,
  getTaskById,
  getTasks,
  updateTask,
  deleteTask,
} = require("../controllers/Task/taskController");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  user: { userId: "user-1", email: "test@example.com", type: "USER", id: "user-1" },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "test-secret";
  // $transaction receives a callback function, not an array
  prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
  prisma.task.count.mockResolvedValue(0);
  prisma.task.findFirst.mockResolvedValue({ id: "task-1" });
});

describe("createTask", () => {
  const validBody = {
    title: "Test Task",
    description: "A test task",
    deadline: new Date(Date.now() + 86400000).toISOString(),
    categories: [],
    assignments: [],
  };

  it("returns 201 and creates a task with correct data", async () => {
    const createdTask = {
      id: "task-1",
      title: "Test Task",
      createdByType: "USER",
      createdById: "user-1",
    };
    prisma.task.create.mockResolvedValue(createdTask);
    prisma.status.findUnique.mockResolvedValue({ id: "status-1", code: "PENDING" });

    const req = mockReq({ body: validBody });
    const res = mockRes();

    await createTask(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "Task created successfully",
      task: createdTask,
    });
  });

  it("sets createdBy from req.user", async () => {
    prisma.task.create.mockResolvedValue({ id: "task-1" });
    prisma.status.findUnique.mockResolvedValue({ id: "status-1", code: "PENDING" });

    const req = mockReq({ body: validBody });
    const res = mockRes();

    await createTask(req, res);

    const createData = prisma.task.create.mock.calls[0][0].data;
    expect(createData.createdByType).toBe("USER");
    expect(createData.createdById).toBe("user-1");
  });

  it("records an ADMIN creator when the token belongs to an admin", async () => {
    prisma.task.create.mockResolvedValue({ id: "task-1" });
    prisma.status.findUnique.mockResolvedValue({ id: "status-1", code: "PENDING" });

    const req = mockReq({
      body: validBody,
      user: { adminId: "admin-1", email: "admin@example.com", type: "ADMIN", id: "admin-1" },
    });
    const res = mockRes();

    await createTask(req, res);

    const createData = prisma.task.create.mock.calls[0][0].data;
    expect(createData.createdByType).toBe("ADMIN");
    expect(createData.createdById).toBe("admin-1");
  });

  it("defaults statusId to PENDING when not provided", async () => {
    prisma.task.create.mockResolvedValue({ id: "task-1" });
    prisma.status.findUnique.mockResolvedValue({ id: "status-1", code: "PENDING" });

    const req = mockReq({ body: validBody });
    const res = mockRes();

    await createTask(req, res);

    expect(prisma.status.findUnique).toHaveBeenCalledWith({ where: { code: "PENDING" } });
    const createData = prisma.task.create.mock.calls[0][0].data;
    expect(createData.statusId).toBe("status-1");
  });

  it("uses provided statusId when given", async () => {
    prisma.task.create.mockResolvedValue({ id: "task-1" });

    const bodyWithStatus = { ...validBody, statusId: "custom-status" };
    const req = mockReq({ body: bodyWithStatus });
    const res = mockRes();

    await createTask(req, res);

    expect(prisma.status.findUnique).not.toHaveBeenCalled();
    const createData = prisma.task.create.mock.calls[0][0].data;
    expect(createData.statusId).toBe("custom-status");
  });

  it("returns 500 when PENDING status is not seeded", async () => {
    prisma.status.findUnique.mockResolvedValue(null);

    const req = mockReq({ body: validBody });
    const res = mockRes();

    await createTask(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Default status not found. Please run the seed script.",
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("returns 400 listing invalid category IDs", async () => {
    prisma.status.findUnique.mockResolvedValue({ id: "status-1", code: "PENDING" });
    prisma.category.findMany.mockResolvedValue([{ id: "cat-1" }]);

    const bodyWithCategories = { ...validBody, categories: ["cat-1", "bad-cat"] };
    const req = mockReq({ body: bodyWithCategories });
    const res = mockRes();

    await createTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid category IDs: bad-cat",
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("returns 400 listing invalid assignment IDs", async () => {
    prisma.status.findUnique.mockResolvedValue({ id: "status-1", code: "PENDING" });
    prisma.user.findMany.mockResolvedValue([{ id: "user-99" }]);
    prisma.admin.findMany.mockResolvedValue([]);

    const bodyWithAssignments = {
      ...validBody,
      assignments: [
        { assignableType: "USER", assignableId: "user-99" },
        { assignableType: "USER", assignableId: "ghost" },
      ],
    };
    const req = mockReq({ body: bodyWithAssignments });
    const res = mockRes();

    await createTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid assignable IDs: ghost",
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("passes deadline and parentTaskId into taskData", async () => {
    const deadline = new Date(Date.now() + 86400000);
    prisma.task.create.mockResolvedValue({ id: "task-1" });
    prisma.status.findUnique.mockResolvedValue({ id: "status-1", code: "PENDING" });

    const bodyWithExtras = {
      ...validBody,
      deadline,
      parentTaskId: "parent-1",
    };
    const req = mockReq({ body: bodyWithExtras });
    const res = mockRes();

    await createTask(req, res);

    const createData = prisma.task.create.mock.calls[0][0].data;
    expect(createData.deadline).toEqual(deadline);
    expect(createData.parentTaskId).toBe("parent-1");
  });

  it("creates a subtask when the parent exists, is alive and is a root task", async () => {
    prisma.task.create.mockResolvedValue({ id: "task-1" });
    prisma.status.findUnique.mockResolvedValue({ id: "status-1", code: "PENDING" });
    prisma.task.findFirst.mockResolvedValue({ id: "parent-1" });

    const req = mockReq({ body: { ...validBody, parentTaskId: "parent-1" } });
    const res = mockRes();

    await createTask(req, res);

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: "parent-1", deletedAt: null, parentTaskId: null },
      select: { id: true },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    const createData = prisma.task.create.mock.calls[0][0].data;
    expect(createData.parentTaskId).toBe("parent-1");
  });

  it("returns 400 when the subtask parent is missing, deleted or itself a subtask", async () => {
    prisma.status.findUnique.mockResolvedValue({ id: "status-1", code: "PENDING" });
    prisma.task.findFirst.mockResolvedValue(null);

    const req = mockReq({ body: { ...validBody, parentTaskId: "ghost" } });
    const res = mockRes();

    await createTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message:
        "Invalid parentTaskId: parent not found, is deleted, or is itself a subtask",
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("rejects type/id mismatches in assignments (USER type pointing at an admin record)", async () => {
    prisma.status.findUnique.mockResolvedValue({ id: "status-1", code: "PENDING" });
    // The ID only exists as an ADMIN; the USER table has nothing
    prisma.user.findMany.mockResolvedValue([]);
    prisma.admin.findMany.mockResolvedValue([]);

    const req = mockReq({
      body: {
        ...validBody,
        assignments: [{ assignableType: "USER", assignableId: "admin-123" }],
      },
    });
    const res = mockRes();

    await createTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid assignable IDs: admin-123",
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("defaults categories and assignments to empty arrays", async () => {
    prisma.task.create.mockResolvedValue({ id: "task-1" });
    prisma.status.findUnique.mockResolvedValue({ id: "status-1", code: "PENDING" });

    const req = mockReq({ body: { title: "No relations" } });
    const res = mockRes();

    await createTask(req, res);

    const call = prisma.task.create.mock.calls[0][0];
    expect(call.data.categories).toEqual({ create: [] });
    expect(call.data.assignments).toEqual({ create: [] });
  });
});

describe("getTaskById", () => {
  it("returns 200 with the task when found", async () => {
    const task = { id: "task-1", title: "Test" };
    prisma.task.findFirst.mockResolvedValue(task);

    const req = mockReq({ params: { id: "task-1" } });
    const res = mockRes();

    await getTaskById(req, res);

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: "task-1", deletedAt: null },
      include: expect.any(Object),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ task });
  });

  it("returns 404 when task is not found (or soft-deleted)", async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    const req = mockReq({ params: { id: "missing" } });
    const res = mockRes();

    await getTaskById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Task not found" });
  });
});

describe("getTasks", () => {
  it("returns 200 with all tasks when no filters", async () => {
    const tasks = [{ id: "t1" }, { id: "t2" }];
    prisma.task.findMany.mockResolvedValue(tasks);

    const req = mockReq();
    const res = mockRes();

    await getTasks(req, res);

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ tasks, pagination: expect.any(Object) })
    );
  });

  it("returns pagination metadata alongside the tasks", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(25);

    const req = mockReq({ query: { page: "3", limit: "10" } });
    const res = mockRes();

    await getTasks(req, res);

    expect(res.json).toHaveBeenCalledWith({
      tasks: [],
      pagination: { page: 3, limit: 10, total: 25, totalPages: 3 },
    });
  });

  it("forwards search, sortBy and sortOrder to the repository", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    const req = mockReq({
      query: { search: "urgent", sortBy: "deadline", sortOrder: "asc" },
    });
    const res = mockRes();

    await getTasks(req, res);

    const arg = prisma.task.findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { title: { contains: "urgent" } },
      { description: { contains: "urgent" } },
    ]);
    expect(arg.orderBy).toEqual({ deadline: "asc" });
  });

  it("passes statusId filter from query", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    const req = mockReq({ query: { statusId: "status-1" } });
    const res = mockRes();

    await getTasks(req, res);

    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.statusId).toBe("status-1");
  });

  it("parses endFlag query string to boolean", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    const req = mockReq({ query: { endFlag: "true" } });
    const res = mockRes();

    await getTasks(req, res);

    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.endFlag).toBe(true);
  });

  it("passes createdById and createdByType filter from query", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    const req = mockReq({
      query: { createdById: "user-1", createdByType: "USER" },
    });
    const res = mockRes();

    await getTasks(req, res);

    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.createdById).toBe("user-1");
    expect(where.createdByType).toBe("USER");
  });

  it("forwards parentTaskId to list a task's subtasks", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    const req = mockReq({ query: { parentTaskId: "p1" } });
    const res = mockRes();

    await getTasks(req, res);

    expect(prisma.task.findMany.mock.calls[0][0].where.parentTaskId).toBe("p1");
  });
});

describe("updateTask", () => {
  it("returns 200 with updated task and forwards fields", async () => {
    const updated = { id: "task-1", title: "Updated" };
    prisma.task.update.mockResolvedValue(updated);

    const req = mockReq({
      params: { id: "task-1" },
      body: { title: "Updated", description: "New desc" },
    });
    const res = mockRes();

    await updateTask(req, res);

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          title: "Updated",
          description: "New desc",
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Task updated successfully",
      task: updated,
    });
  });

  it("propagates P2025 rejection (handled by errorHandler as 404)", async () => {
    const err = new Error("Record not found");
    err.code = "P2025";
    prisma.task.update.mockRejectedValue(err);

    const req = mockReq({
      params: { id: "missing" },
      body: { title: "X" },
    });
    const res = mockRes();

    await expect(updateTask(req, res)).rejects.toMatchObject({ code: "P2025" });
  });

  it("rejects invalid category IDs when categories are provided", async () => {
    prisma.category.findMany.mockResolvedValue([{ id: "cat-1" }]);

    const req = mockReq({
      params: { id: "task-1" },
      body: { categories: ["cat-1", "bad-cat"] },
    });
    const res = mockRes();

    await updateTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid category IDs: bad-cat" });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("rejects invalid assignable IDs when assignments are provided", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "user-99" }]);
    prisma.admin.findMany.mockResolvedValue([]);

    const req = mockReq({
      params: { id: "task-1" },
      body: {
        assignments: [
          { assignableType: "USER", assignableId: "user-99" },
          { assignableType: "USER", assignableId: "ghost" },
        ],
      },
    });
    const res = mockRes();

    await updateTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid assignable IDs: ghost" });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("returns 400 when a task is made its own parent", async () => {
    const req = mockReq({
      params: { id: "task-1" },
      body: { parentTaskId: "task-1" },
    });
    const res = mockRes();

    await updateTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "A task cannot be its own parent",
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the new subtree parent is missing, deleted or itself a subtask", async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    const req = mockReq({
      params: { id: "task-1" },
      body: { parentTaskId: "ghost" },
    });
    const res = mockRes();

    await updateTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message:
        "Invalid parentTaskId: parent not found, is deleted, or is itself a subtask",
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("re-parents onto a valid root task", async () => {
    prisma.task.update.mockResolvedValue({ id: "task-1", parentTaskId: "parent-1" });
    prisma.task.findFirst.mockResolvedValue({ id: "parent-1" });

    const req = mockReq({
      params: { id: "task-1" },
      body: { parentTaskId: "parent-1" },
    });
    const res = mockRes();

    await updateTask(req, res);

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({ parentTaskId: "parent-1" }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("forwards categories and assignments for relation replacement", async () => {
    const updated = { id: "task-1" };
    prisma.task.update.mockResolvedValue(updated);
    prisma.task.findFirst.mockResolvedValue(updated);
    prisma.category.findMany.mockResolvedValue([{ id: "cat-1" }]);
    prisma.user.findMany.mockResolvedValue([{ id: "user-1" }]);
    prisma.admin.findMany.mockResolvedValue([]);

    const req = mockReq({
      params: { id: "task-1" },
      body: {
        title: "Updated",
        categories: ["cat-1"],
        assignments: [{ assignableType: "USER", assignableId: "user-1" }],
      },
    });
    const res = mockRes();

    await updateTask(req, res);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Task updated successfully",
      task: updated,
    });
  });

  it("rejects a USER assignment whose ID exists only in the ADMIN table", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.admin.findMany.mockResolvedValue([{ id: "admin-1" }]);

    const req = mockReq({
      params: { id: "task-1" },
      body: {
        assignments: [{ assignableType: "USER", assignableId: "admin-1" }],
      },
    });
    const res = mockRes();

    await updateTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid assignable IDs: admin-1",
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});

describe("deleteTask", () => {
  it("soft-deletes by setting deletedAt and returns 200", async () => {
    prisma.task.update.mockResolvedValue({ id: "task-1", deletedAt: new Date() });

    const req = mockReq({ params: { id: "task-1" } });
    const res = mockRes();

    await deleteTask(req, res);

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Task deleted successfully",
    });
  });

  it("propagates P2025 rejection (handled by errorHandler as 404)", async () => {
    const err = new Error("Record not found");
    err.code = "P2025";
    prisma.task.update.mockRejectedValue(err);

    const req = mockReq({ params: { id: "missing" } });
    const res = mockRes();

    await expect(deleteTask(req, res)).rejects.toMatchObject({ code: "P2025" });
  });
});
