jest.mock("../prismaClient", () => ({
  status: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const prisma = require("../prismaClient");
const statusRepository = require("../repository/Status/statusRepository");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getStatuses", () => {
  it("lists statuses ordered by label", async () => {
    prisma.status.findMany.mockResolvedValue([{ id: "s1" }]);

    const result = await statusRepository.getStatuses();

    expect(prisma.status.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { label: "asc" },
    });
    expect(result).toEqual([{ id: "s1" }]);
  });
});

describe("getStatusById", () => {
  it("finds a status by id", async () => {
    prisma.status.findUnique.mockResolvedValue({ id: "s1" });

    const result = await statusRepository.getStatusById("s1");

    expect(prisma.status.findUnique).toHaveBeenCalledWith({
      where: { id: "s1" },
    });
    expect(result).toEqual({ id: "s1" });
  });
});

describe("getStatusByCode", () => {
  it("finds a status by its unique code for live rows only", async () => {
    prisma.status.findFirst.mockResolvedValue({ id: "s1", code: "PENDING" });

    const result = await statusRepository.getStatusByCode("PENDING");

    expect(prisma.status.findFirst).toHaveBeenCalledWith({
      where: { code: "PENDING", deletedAt: null },
    });
    expect(result).toEqual({ id: "s1", code: "PENDING" });
  });
});

describe("createStatus", () => {
  it("creates a status", async () => {
    prisma.status.create.mockResolvedValue({ id: "s1" });

    const result = await statusRepository.createStatus({
      code: "PENDING",
      label: "Pending",
    });

    expect(prisma.status.create).toHaveBeenCalledWith({
      data: { code: "PENDING", label: "Pending" },
    });
    expect(result).toEqual({ id: "s1" });
  });
});

describe("updateStatus", () => {
  it("updates a status by id", async () => {
    prisma.status.update.mockResolvedValue({ id: "s1" });

    await statusRepository.updateStatus("s1", { label: "New" });

    expect(prisma.status.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { label: "New" },
    });
  });
});

describe("deleteStatus", () => {
  it("deletes a status by id", async () => {
    prisma.status.delete.mockResolvedValue({ id: "s1" });

    await statusRepository.deleteStatus("s1");

    expect(prisma.status.delete).toHaveBeenCalledWith({
      where: { id: "s1" },
    });
  });
});
