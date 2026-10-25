jest.mock("../prismaClient", () => ({
  user: { findMany: jest.fn(), count: jest.fn() },
  admin: { findMany: jest.fn(), count: jest.fn() },
  task: { count: jest.fn(), groupBy: jest.fn() },
  category: { count: jest.fn() },
  status: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
}));

const prisma = require("../prismaClient");
const {
  getUsers,
  getAdmins,
  getOverview,
  createStatus,
  updateStatus,
  deleteStatus,
} = require("../controllers/Admin/adminManagementController");

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
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getUsers", () => {
  it("returns 200 with all users newest first", async () => {
    const users = [{ id: "u1" }];
    prisma.user.findMany.mockResolvedValue(users);

    const res = mockRes();
    await getUsers(mockReq(), res);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ users });
  });
});

describe("getAdmins", () => {
  it("returns 200 with all admins newest first", async () => {
    const admins = [{ id: "a1" }];
    prisma.admin.findMany.mockResolvedValue(admins);

    const res = mockRes();
    await getAdmins(mockReq(), res);

    expect(prisma.admin.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ admins });
  });
});

describe("getOverview", () => {
  it("returns aggregated counts", async () => {
    prisma.user.count.mockResolvedValue(2);
    prisma.admin.count.mockResolvedValue(1);
    prisma.task.count.mockResolvedValue(5);
    prisma.category.count.mockResolvedValue(3);
    prisma.status.count.mockResolvedValue(3);
    const tasksByStatus = [{ statusId: "s1", _count: { _all: 5 } }];
    prisma.task.groupBy.mockResolvedValue(tasksByStatus);

    const res = mockRes();
    await getOverview(mockReq(), res);

    expect(prisma.task.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      overview: {
        users: 2,
        admins: 1,
        tasks: 5,
        categories: 3,
        statuses: 3,
        tasksByStatus,
      },
    });
  });
});

describe("createStatus", () => {
  it("returns 400 when the code already exists", async () => {
    prisma.status.findUnique.mockResolvedValue({ id: "s1" });

    const res = mockRes();
    await createStatus(
      mockReq({ body: { code: "PENDING", label: "Pending" } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.status.create).not.toHaveBeenCalled();
  });

  it("returns 201 and creates a new status", async () => {
    prisma.status.findUnique.mockResolvedValue(null);
    const created = { id: "s9", code: "REVIEW", label: "Review" };
    prisma.status.create.mockResolvedValue(created);

    const res = mockRes();
    await createStatus(
      mockReq({ body: { code: "REVIEW", label: "Review" } }),
      res
    );

    expect(prisma.status.create).toHaveBeenCalledWith({
      data: { code: "REVIEW", label: "Review" },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "Status created successfully",
      status: created,
    });
  });
});

describe("updateStatus", () => {
  it("returns 200 with the updated status", async () => {
    const updated = { id: "s1", code: "PENDING", label: "Pending" };
    prisma.status.update.mockResolvedValue(updated);

    const res = mockRes();
    await updateStatus(
      mockReq({ params: { id: "s1" }, body: { code: "PENDING", label: "Pending" } }),
      res
    );

    expect(prisma.status.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { code: "PENDING", label: "Pending" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Status updated successfully",
      status: updated,
    });
  });
});

describe("deleteStatus", () => {
  it("deletes the status and returns 200", async () => {
    prisma.status.delete.mockResolvedValue({ id: "s1" });

    const res = mockRes();
    await deleteStatus(mockReq({ params: { id: "s1" } }), res);

    expect(prisma.status.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Status deleted successfully",
    });
  });
});
