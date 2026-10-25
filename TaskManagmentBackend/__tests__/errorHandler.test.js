const errorHandler = require("../middleware/errorHandler");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("errorHandler", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("defaults to 500 with the error message", () => {
    const err = new Error("boom");
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "boom" })
    );
  });

  it("respects a custom statusCode", () => {
    const err = Object.assign(new Error("teapot"), { statusCode: 418 });
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(418);
  });

  it("maps P2002 (unique violation) to 409", () => {
    const err = Object.assign(new Error("dup"), { code: "P2002" });
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "A record with this value already exists." })
    );
  });

  it("maps P2025 (record not found) to 404", () => {
    const err = Object.assign(new Error("missing"), { code: "P2025" });
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("maps P2003 (foreign key) to 400", () => {
    const err = Object.assign(new Error("fk"), { code: "P2003" });
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("maps JsonWebTokenError to 401", () => {
    const err = Object.assign(new Error("bad jwt"), { name: "JsonWebTokenError" });
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("maps TokenExpiredError to 401", () => {
    const err = Object.assign(new Error("expired"), { name: "TokenExpiredError" });
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("includes the stack only in development", () => {
    process.env.NODE_ENV = "development";
    const err = new Error("stack me");
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ stack: expect.any(String) })
    );
  });

  it("omits the stack outside development", () => {
    process.env.NODE_ENV = "test";
    const err = new Error("no stack");
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ stack: undefined })
    );
  });
});
