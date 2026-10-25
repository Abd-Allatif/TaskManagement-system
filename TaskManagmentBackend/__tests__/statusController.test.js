jest.mock("../prismaClient", () => ({
  status: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
}));

const prisma = require("../prismaClient");
const {
  getStatuses,
  getStatusById,
} = require("../controllers/Status/statusController");

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

describe("getStatuses", () => {
  it("returns 200 with all statuses", async () => {
    const statuses = [{ id: "s1" }, { id: "s2" }];
    prisma.status.findMany.mockResolvedValue(statuses);

    const req = mockReq();
    const res = mockRes();

    await getStatuses(req, res);

    expect(prisma.status.findMany).toHaveBeenCalledWith({
      orderBy: { label: "asc" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ statuses });
  });
});

describe("getStatusById", () => {
  it("returns 200 with the status when found", async () => {
    const status = { id: "s1", code: "PENDING" };
    prisma.status.findUnique.mockResolvedValue(status);

    const req = mockReq({ params: { id: "s1" } });
    const res = mockRes();

    await getStatusById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status });
  });

  it("returns 404 when the status is not found", async () => {
    prisma.status.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: "missing" } });
    const res = mockRes();

    await getStatusById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Status not found" });
  });
});
