jest.mock("jsonwebtoken", () => ({
  verify: jest.fn(),
}));

const jwt = require("jsonwebtoken");
const verifyAdmin = require("../middleware/adminAuth");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "test-secret";
  // The invalid-token test intentionally triggers the middleware's error logging;
  // silence it so the test output stays clean.
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("verifyAdmin", () => {
  it("returns 401 when no token is provided", () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    verifyAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when the token is invalid or expired", () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("invalid token");
    });
    const req = { headers: { authorization: "Bearer bad-token" } };
    const res = mockRes();
    const next = jest.fn();

    verifyAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for a valid USER token (not an admin)", () => {
    jwt.verify.mockReturnValue({ userId: "u1", email: "user@example.com" });
    const req = { headers: { authorization: "Bearer user-token" } };
    const res = mockRes();
    const next = jest.fn();

    verifyAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Access denied. Admin access required.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next and sets req.user for a valid ADMIN token", () => {
    jwt.verify.mockReturnValue({
      adminId: "a1",
      email: "admin@example.com",
      type: "ADMIN",
    });
    const req = { headers: { authorization: "Bearer admin-token" } };
    const res = mockRes();
    const next = jest.fn();

    verifyAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({ id: "a1", type: "ADMIN", adminId: "a1" });
  });

  it("treats a token with explicit type USER as non-admin", () => {
    jwt.verify.mockReturnValue({
      userId: "u1",
      email: "user@example.com",
      type: "USER",
    });
    const req = { headers: { authorization: "Bearer user-token" } };
    const res = mockRes();
    const next = jest.fn();

    verifyAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
