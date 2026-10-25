jest.mock("jsonwebtoken", () => ({
  verify: jest.fn(),
}));

const jwt = require("jsonwebtoken");
const verifyToken = require("../middleware/auth");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "test-secret";
  // verifyToken logs bad tokens; keep the output clean.
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("verifyToken", () => {
  it("returns 401 when the Authorization header is missing", () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the header has no token part", () => {
    const req = { headers: { authorization: "Bearer" } };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when jwt.verify throws", () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const req = { headers: { authorization: "Bearer bad" } };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("sets req.user with id/type for a user token and calls next", () => {
    jwt.verify.mockReturnValue({ userId: "u1", email: "user@example.com" });
    const req = { headers: { authorization: "Bearer user-token" } };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({
      userId: "u1",
      email: "user@example.com",
      id: "u1",
      type: "USER",
    });
  });

  it("normalizes an admin token to id=adminId and type=ADMIN", () => {
    jwt.verify.mockReturnValue({
      adminId: "a1",
      email: "admin@example.com",
      type: "ADMIN",
    });
    const req = { headers: { authorization: "Bearer admin-token" } };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({
      adminId: "a1",
      id: "a1",
      type: "ADMIN",
    });
  });
});
