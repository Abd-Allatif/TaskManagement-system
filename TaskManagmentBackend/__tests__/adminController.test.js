jest.mock("../prismaClient", () => ({
  admin: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  adminVerificationToken: {
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
}));

jest.mock("../services/emailService", () => ({
  sendVerificationEmail: jest.fn(),
}));

jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(),
}));

const prisma = require("../prismaClient");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail } = require("../services/emailService");
const { register, verifyEmail, login, logout, resendCode, getMe } = require("../controllers/Admin/adminController");

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

describe("register", () => {
  const validBody = { name: "Abd", email: "abd@example.com", password: "secret123" };

  it("returns 400 and does NOT touch the DB when fields are missing", async () => {
    const res = mockRes();
    await register({ body: { name: "Abd" } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.admin.findUnique).not.toHaveBeenCalled();
    expect(prisma.admin.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the email already exists and does NOT create an admin", async () => {
    prisma.admin.findUnique.mockResolvedValue({ id: "existing" });
    const res = mockRes();

    await register({ body: validBody }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Admin email already exists" });
    expect(prisma.admin.create).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("stores a HASHED password, not the plaintext", async () => {
    prisma.admin.findUnique.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue("hashed-value");
    prisma.admin.create.mockResolvedValue({ id: "a1" });
    prisma.adminVerificationToken.create.mockResolvedValue({});
    const res = mockRes();

    await register({ body: validBody }, res);

    const createData = prisma.admin.create.mock.calls[0][0].data;
    expect(createData.password).toBe("hashed-value");
    expect(createData.password).not.toBe(validBody.password);
    expect(bcrypt.hash).toHaveBeenCalledWith(validBody.password, 10);
  });

  it("creates a 6-digit verification code expiring ~10 minutes out", async () => {
    prisma.admin.findUnique.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue("hashed");
    prisma.admin.create.mockResolvedValue({ id: "a1" });
    prisma.adminVerificationToken.create.mockResolvedValue({});
    const res = mockRes();

    const before = Date.now();
    await register({ body: validBody }, res);
    const after = Date.now();

    const tokenData = prisma.adminVerificationToken.create.mock.calls[0][0].data;
    expect(tokenData.token).toMatch(/^\d{6}$/);
    expect(tokenData.adminId).toBe("a1");

    const expiresInMs = tokenData.expiresAt.getTime() - before;
    expect(expiresInMs).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000);
    expect(expiresInMs).toBeLessThanOrEqual(10 * 60 * 1000 + (after - before) + 1000);
  });

  it("sends the verification email and returns 201 on success", async () => {
    prisma.admin.findUnique.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue("hashed");
    prisma.admin.create.mockResolvedValue({ id: "a1" });
    prisma.adminVerificationToken.create.mockResolvedValue({});
    const res = mockRes();

    await register({ body: validBody }, res);

    expect(sendVerificationEmail).toHaveBeenCalledWith(
      validBody.email,
      expect.any(String),
      validBody.name
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ adminId: "a1" }));
  });
});

describe("verifyEmail", () => {
  it("returns 400 when email or code is missing", async () => {
    const res = mockRes();
    await verifyEmail({ body: { email: "a@b.com" } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.admin.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown email", async () => {
    prisma.admin.findUnique.mockResolvedValue(null);
    const res = mockRes();

    await verifyEmail({ body: { email: "a@b.com", code: "123456" } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 400 when the email is already verified", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1",
      emailVerifiedAt: new Date(),
      adminVerificationTokens: [],
    });
    const res = mockRes();

    await verifyEmail({ body: { email: "a@b.com", code: "123456" } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a wrong code", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1",
      emailVerifiedAt: null,
      adminVerificationTokens: [{ token: "999999", expiresAt: new Date(Date.now() + 60000) }],
    });
    const res = mockRes();

    await verifyEmail({ body: { email: "a@b.com", code: "123456" } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an expired code even if it matches", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1",
      emailVerifiedAt: null,
      adminVerificationTokens: [{ token: "123456", expiresAt: new Date(Date.now() - 1000) }],
    });
    const res = mockRes();

    await verifyEmail({ body: { email: "a@b.com", code: "123456" } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("verifies the admin and consumes the token in a transaction", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1",
      emailVerifiedAt: null,
      adminVerificationTokens: [{ id: "t1", token: "123456", expiresAt: new Date(Date.now() + 60000) }],
    });
    prisma.admin.update.mockResolvedValue({});
    prisma.adminVerificationToken.delete.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));
    const res = mockRes();

    await verifyEmail({ body: { email: "a@b.com", code: "123456" } }, res);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.admin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: expect.objectContaining({ emailVerifiedAt: expect.any(Date), isVerified: true }),
      })
    );
    expect(prisma.adminVerificationToken.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("login", () => {
  it("returns 400 when credentials are missing", async () => {
    const res = mockRes();
    await login({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.admin.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 for an unknown email (same message as bad password)", async () => {
    prisma.admin.findUnique.mockResolvedValue(null);
    const res = mockRes();

    await login({ body: { email: "a@b.com", password: "x" } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid email or password." });
  });

  it("returns 401 on a wrong password", async () => {
    prisma.admin.findUnique.mockResolvedValue({ id: "a1", password: "hashed" });
    bcrypt.compare.mockResolvedValue(false);
    const res = mockRes();

    await login({ body: { email: "a@b.com", password: "wrong" } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it("blocks login with 403 when email is not verified, and issues NO token", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1", email: "a@b.com", password: "hashed", emailVerifiedAt: null,
    });
    bcrypt.compare.mockResolvedValue(true);
    const res = mockRes();

    await login({ body: { email: "a@b.com", password: "good" } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it("issues a JWT with adminId, email and type ADMIN on success", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1", name: "Abd", email: "a@b.com", password: "hashed", emailVerifiedAt: new Date(),
    });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue("signed-token");
    const res = mockRes();

    await login({ body: { email: "a@b.com", password: "good" } }, res);

    expect(jwt.sign).toHaveBeenCalledWith(
      { adminId: "a1", email: "a@b.com", type: "ADMIN" },
      "test-secret",
      { expiresIn: "7d" }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ token: "signed-token" })
    );
  });
});

describe("logout", () => {
  it("returns 200", async () => {
    const res = mockRes();
    await logout({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("resendCode", () => {
  it("returns 400 and does not touch the DB when the email is missing", async () => {
    const res = mockRes();
    await resendCode({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.admin.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown email", async () => {
    prisma.admin.findUnique.mockResolvedValue(null);
    const res = mockRes();

    await resendCode({ body: { email: "a@b.com" } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 400 when the email is already verified", async () => {
    prisma.admin.findUnique.mockResolvedValue({ id: "a1", emailVerifiedAt: new Date() });
    const res = mockRes();

    await resendCode({ body: { email: "a@b.com" } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("invalidates old tokens, issues a fresh code and emails it", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1", name: "Abd", emailVerifiedAt: null,
    });
    prisma.adminVerificationToken.deleteMany.mockResolvedValue({ count: 1 });
    prisma.adminVerificationToken.create.mockResolvedValue({});
    const res = mockRes();

    await resendCode({ body: { email: "a@b.com" } }, res);

    expect(prisma.adminVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { adminId: "a1" },
    });
    const tokenData = prisma.adminVerificationToken.create.mock.calls[0][0].data;
    expect(tokenData.token).toMatch(/^\d{6}$/);
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "a@b.com",
      expect.any(String),
      "Abd"
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("getMe", () => {
  it("returns 200 with the profile for the token's admin", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1", name: "Abd", email: "a@b.com", emailVerifiedAt: new Date(),
    });
    const res = mockRes();

    await getMe({ user: { id: "a1", type: "ADMIN" } }, res);

    expect(prisma.admin.findUnique).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: expect.objectContaining({ id: "a1", type: "ADMIN" }),
      })
    );
  });

  it("returns 404 when the admin no longer exists", async () => {
    prisma.admin.findUnique.mockResolvedValue(null);
    const res = mockRes();

    await getMe({ user: { id: "ghost", type: "ADMIN" } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
