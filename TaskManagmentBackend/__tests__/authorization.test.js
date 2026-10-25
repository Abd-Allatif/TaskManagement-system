jest.mock("../prismaClient", () => ({
  task: { findFirst: jest.fn() },
}));

const prisma = require("../prismaClient");
const { taskOwnerOrAdmin } = require("../middleware/authorization");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "test-secret";
});

describe("taskOwnerOrAdmin", () => {
  it("returns 404 when the task does not exist (or is soft-deleted)", async () => {
    prisma.task.findFirst.mockResolvedValue(null);
    const req = { params: { id: "missing" }, user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await taskOwnerOrAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows the owner and attaches req.task", async () => {
    const task = { id: "t1", createdById: "u1", createdByType: "USER" };
    prisma.task.findFirst.mockResolvedValue(task);
    const req = { params: { id: "t1" }, user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await taskOwnerOrAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.task).toBe(task);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows an admin even when they are not the owner", async () => {
    const task = { id: "t1", createdById: "u1", createdByType: "USER" };
    prisma.task.findFirst.mockResolvedValue(task);
    const req = { params: { id: "t1" }, user: { id: "a1", type: "ADMIN" } };
    const res = mockRes();
    const next = jest.fn();

    await taskOwnerOrAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("returns 403 for a non-owner non-admin", async () => {
    const task = { id: "t1", createdById: "u1", createdByType: "USER" };
    prisma.task.findFirst.mockResolvedValue(task);
    const req = { params: { id: "t1" }, user: { id: "u2", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await taskOwnerOrAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Forbidden. You can only modify your own tasks.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards repository errors to next", async () => {
    prisma.task.findFirst.mockRejectedValue(new Error("db down"));
    const req = { params: { id: "t1" }, user: { id: "u1", type: "USER" } };
    const res = mockRes();
    const next = jest.fn();

    await taskOwnerOrAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});
