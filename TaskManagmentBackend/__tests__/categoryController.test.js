jest.mock("../prismaClient", () => ({
  category: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const prisma = require("../prismaClient");
const {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require("../controllers/Category/categoryController");

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
  user: { userId: "user-1", email: "test@example.com" },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createCategory", () => {
  it("returns 201 and creates a category with correct data", async () => {
    const category = { id: "cat-1", name: "Work", color: "#FF5733" };
    prisma.category.create.mockResolvedValue(category);

    const req = mockReq({ body: { name: "Work", color: "#FF5733" } });
    const res = mockRes();

    await createCategory(req, res);

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { name: "Work", color: "#FF5733" },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "Category created successfully",
      category,
    });
  });

  it("sets color to null when not provided", async () => {
    prisma.category.create.mockResolvedValue({ id: "cat-1", name: "Work" });

    const req = mockReq({ body: { name: "Work" } });
    const res = mockRes();

    await createCategory(req, res);

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { name: "Work", color: null },
    });
  });
});

describe("getCategories", () => {
  it("returns 200 with all categories ordered by createdAt desc", async () => {
    const categories = [{ id: "c1" }, { id: "c2" }];
    prisma.category.findMany.mockResolvedValue(categories);

    const req = mockReq();
    const res = mockRes();

    await getCategories(req, res);

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ categories });
  });
});

describe("getCategoryById", () => {
  it("returns 200 with the category when found", async () => {
    const category = { id: "cat-1", name: "Work" };
    prisma.category.findFirst.mockResolvedValue(category);

    const req = mockReq({ params: { id: "cat-1" } });
    const res = mockRes();

    await getCategoryById(req, res);

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: "cat-1" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ category });
  });

  it("returns 404 when category is not found", async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    const req = mockReq({ params: { id: "missing" } });
    const res = mockRes();

    await getCategoryById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Category not found" });
  });
});

describe("updateCategory", () => {
  it("returns 200 with updated category and forwards fields", async () => {
    const updated = { id: "cat-1", name: "Personal", color: "#000000" };
    prisma.category.update.mockResolvedValue(updated);

    const req = mockReq({
      params: { id: "cat-1" },
      body: { name: "Personal", color: "#000000" },
    });
    const res = mockRes();

    await updateCategory(req, res);

    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: { name: "Personal", color: "#000000" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Category updated successfully",
      category: updated,
    });
  });

  it("propagates P2025 rejection (handled by errorHandler as 404)", async () => {
    const err = new Error("Record not found");
    err.code = "P2025";
    prisma.category.update.mockRejectedValue(err);

    const req = mockReq({
      params: { id: "missing" },
      body: { name: "X" },
    });
    const res = mockRes();

    await expect(updateCategory(req, res)).rejects.toMatchObject({ code: "P2025" });
  });
});

describe("deleteCategory", () => {
  it("deletes the category and returns 200", async () => {
    prisma.category.delete.mockResolvedValue({ id: "cat-1" });

    const req = mockReq({ params: { id: "cat-1" } });
    const res = mockRes();

    await deleteCategory(req, res);

    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: "cat-1" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Category deleted successfully",
    });
  });

  it("propagates P2025 rejection (handled by errorHandler as 404)", async () => {
    const err = new Error("Record not found");
    err.code = "P2025";
    prisma.category.delete.mockRejectedValue(err);

    const req = mockReq({ params: { id: "missing" } });
    const res = mockRes();

    await expect(deleteCategory(req, res)).rejects.toMatchObject({ code: "P2025" });
  });
});
