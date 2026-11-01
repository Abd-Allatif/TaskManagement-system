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
const categoryRepository = require("../repository/Category/categoryRepository");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createCategory", () => {
  it("passes the payload wrapped in { data }", async () => {
    prisma.category.create.mockResolvedValue({ id: "c1" });

    const result = await categoryRepository.createCategory({
      workspaceId: "w1",
      name: "Work",
      color: "#fff",
    });

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { workspaceId: "w1", name: "Work", color: "#fff" },
    });
    expect(result).toEqual({ id: "c1" });
  });
});

describe("getCategories", () => {
  it("lists categories newest first", async () => {
    prisma.category.findMany.mockResolvedValue([]);

    await categoryRepository.getCategories("w1");

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "w1", deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("getCategoryById", () => {
  it("finds by id", async () => {
    prisma.category.findFirst.mockResolvedValue({ id: "c1" });

    const result = await categoryRepository.getCategoryById("w1", "c1");

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: "c1", workspaceId: "w1", deletedAt: null },
    });
    expect(result).toEqual({ id: "c1" });
  });
});

describe("updateCategory", () => {
  it("updates by id with the given data", async () => {
    prisma.category.update.mockResolvedValue({ id: "c1", name: "New" });

    await categoryRepository.updateCategory("c1", { name: "New" });

    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { name: "New" },
    });
  });
});

describe("deleteCategory", () => {
  it("hard-deletes by id", async () => {
    prisma.category.delete.mockResolvedValue({ id: "c1" });

    await categoryRepository.deleteCategory("c1");

    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: "c1" },
    });
  });
});
