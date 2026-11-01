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

// Every category route resolves req.workspace before the controller runs.
const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  user: { userId: "user-1", email: "test@example.com" },
  workspace: { id: "ws-1" },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createCategory", () => {
  it("returns 201 and scopes the category to the active workspace", async () => {
    const category = { id: "cat-1", name: "Work", color: "#FF5733" };
    prisma.category.create.mockResolvedValue(category);

    const req = mockReq({ body: { name: "Work", color: "#FF5733" } });
    const res = mockRes();

    await createCategory(req, res);

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { workspaceId: "ws-1", name: "Work", color: "#FF5733" },
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
      data: { workspaceId: "ws-1", name: "Work", color: null },
    });
  });
});

describe("getCategories", () => {
  it("returns 200 with the workspace's categories ordered by createdAt desc", async () => {
    const categories = [{ id: "c1" }, { id: "c2" }];
    prisma.category.findMany.mockResolvedValue(categories);

    const req = mockReq();
    const res = mockRes();

    await getCategories(req, res);

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ categories });
  });
});

describe("getCategoryById", () => {
  it("returns 200 with the category when found in the workspace", async () => {
    const category = { id: "cat-1", name: "Work" };
    prisma.category.findFirst.mockResolvedValue(category);

    const req = mockReq({ params: { id: "cat-1" } });
    const res = mockRes();

    await getCategoryById(req, res);

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: "cat-1", workspaceId: "ws-1", deletedAt: null },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ category });
  });

  it("returns 404 when the category is missing or belongs to another workspace", async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    const req = mockReq({ params: { id: "missing" } });
    const res = mockRes();

    await getCategoryById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Category not found" });
  });
});

describe("updateCategory", () => {
  it("loads through the workspace scope then updates", async () => {
    const existing = { id: "cat-1", workspaceId: "ws-1", name: "Work" };
    prisma.category.findFirst.mockResolvedValue(existing);
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

  it("returns 404 when the category is not in the workspace", async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    const req = mockReq({
      params: { id: "cat-other-workspace" },
      body: { name: "X" },
    });
    const res = mockRes();

    await updateCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});

describe("deleteCategory", () => {
  it("loads through the workspace scope then deletes", async () => {
    prisma.category.findFirst.mockResolvedValue({
      id: "cat-1",
      workspaceId: "ws-1",
    });
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

  it("returns 404 when the category is not in the workspace", async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    const req = mockReq({ params: { id: "foreign-cat" } });
    const res = mockRes();

    await deleteCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });
});
