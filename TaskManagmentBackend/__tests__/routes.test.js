// Integration tests: boot the real Express app on an ephemeral port and hit it
// over HTTP. Prisma, bcrypt and the email service are mocked so no database or
// SMTP connection is needed.

jest.mock("dotenv", () => ({ config: jest.fn() }));

jest.mock("../prismaClient", () => ({
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  admin: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  verificationToken: { create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
  adminVerificationToken: { create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
  task: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  status: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  category: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
}));

jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock("../services/emailService", () => ({
  sendVerificationEmail: jest.fn(),
}));

const jwt = require("jsonwebtoken");
const prisma = require("../prismaClient");
const bcrypt = require("bcrypt");
const { sendVerificationEmail } = require("../services/emailService");
const app = require("../server");

let server;
let baseUrl;

beforeAll((done) => {
  process.env.JWT_SECRET = "test-secret";
  server = app.listen(0, "127.0.0.1", () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (arg) => {
    if (typeof arg === "function") return arg(prisma);
    return Promise.all(arg);
  });
  bcrypt.hash.mockResolvedValue("hashed");
  bcrypt.compare.mockResolvedValue(true);
  sendVerificationEmail.mockResolvedValue(true);

  // Sensible defaults so authz guards and paginated lists resolve.
  prisma.task.findFirst.mockResolvedValue({
    id: "t1",
    createdById: "u1",
    createdByType: "USER",
  });
  prisma.task.count.mockResolvedValue(0);
  prisma.user.count.mockResolvedValue(0);
  prisma.admin.count.mockResolvedValue(0);
  prisma.category.count.mockResolvedValue(0);
  prisma.status.count.mockResolvedValue(0);
  prisma.task.groupBy.mockResolvedValue([]);
  prisma.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  prisma.adminVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
});

const request = (method, path, { body, token } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(baseUrl + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
};

const post = (path, body, token) => request("POST", path, { body, token });
const put = (path, body, token) => request("PUT", path, { body, token });
const del = (path, token) => request("DELETE", path, { token });

const userToken = () =>
  jwt.sign({ userId: "u1", email: "user@example.com" }, "test-secret");
const adminToken = () =>
  jwt.sign({ adminId: "a1", email: "admin@example.com", type: "ADMIN" }, "test-secret");

const verifiedUser = {
  id: "u1",
  name: "Abd",
  email: "user@example.com",
  password: "hashed",
  emailVerifiedAt: new Date(),
};

describe("auth routes", () => {
  it("POST /api/auth/register returns 400 when fields are missing", async () => {
    const res = await post("/api/auth/register", { name: "Abd" });

    expect(res.status).toBe(400);
  });

  it("POST /api/auth/register returns 201 and sends a verification email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "u1" });
    prisma.verificationToken.create.mockResolvedValue({});

    const res = await post("/api/auth/register", {
      name: "Abda",
      email: "user@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(201);
    expect(sendVerificationEmail).toHaveBeenCalled();
  });

  it("POST /api/auth/register rejects a duplicate email with 400", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "existing" });

    const res = await post("/api/auth/register", {
      name: "Abda",
      email: "user@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("POST /api/auth/login returns 401 for an unknown email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await post("/api/auth/login", {
      email: "nobody@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(401);
  });

  it("POST /api/auth/login returns 403 when the email is not verified", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...verifiedUser, emailVerifiedAt: null });

    const res = await post("/api/auth/login", {
      email: "user@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(403);
  });

  it("POST /api/auth/login returns 200 with a token for a verified user", async () => {
    prisma.user.findUnique.mockResolvedValue(verifiedUser);

    const res = await post("/api/auth/login", {
      email: "user@example.com",
      password: "secret123",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.token).toBeTruthy();
  });
});

describe("task routes", () => {
  it("POST /api/tasks returns 401 without a token", async () => {
    const res = await post("/api/tasks", { title: "My task" });

    expect(res.status).toBe(401);
  });

  it("POST /api/tasks returns 400 when title is missing", async () => {
    const res = await post("/api/tasks", {}, userToken());

    expect(res.status).toBe(400);
  });

  it("POST /api/tasks returns 201 with a valid token and body", async () => {
    prisma.status.findUnique.mockResolvedValue({ id: "s1" });
    prisma.task.create.mockResolvedValue({ id: "t1" });

    const res = await post("/api/tasks", { title: "My task" }, userToken());

    expect(res.status).toBe(201);
    expect(prisma.task.create).toHaveBeenCalled();
  });

  it("GET /api/tasks/:id returns 404 when the task is missing", async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    const res = await request("GET", "/api/tasks/missing", { token: userToken() });

    expect(res.status).toBe(404);
  });

  it("GET /api/tasks/:id returns 200 when the task exists", async () => {
    prisma.task.findFirst.mockResolvedValue({ id: "t1" });

    const res = await request("GET", "/api/tasks/t1", { token: userToken() });

    expect(res.status).toBe(200);
  });

  it("PUT /api/tasks/:id returns 200 for a partial update", async () => {
    prisma.task.update.mockResolvedValue({ id: "t1" });

    const res = await put("/api/tasks/t1", { endFlag: true }, userToken());

    expect(res.status).toBe(200);
  });

  it("DELETE /api/tasks/:id returns 200", async () => {
    prisma.task.update.mockResolvedValue({ id: "t1" });

    const res = await del("/api/tasks/t1", userToken());

    expect(res.status).toBe(200);
  });

  it("accepts a valid admin token (role normalization)", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    const res = await request("GET", "/api/tasks", { token: adminToken() });

    expect(res.status).toBe(200);
  });
});

describe("category routes", () => {
  it("POST /api/categories returns 401 without a token", async () => {
    const res = await post("/api/categories", { name: "Work" });

    expect(res.status).toBe(401);
  });

  it("POST /api/categories returns 201 for a (non-admin) user", async () => {
    prisma.category.create.mockResolvedValue({ id: "c1", name: "Work" });

    const res = await post("/api/categories", { name: "Work" }, userToken());

    expect(res.status).toBe(201);
  });

  it("POST /api/categories returns 400 when name is missing", async () => {
    const res = await post("/api/categories", {}, adminToken());

    expect(res.status).toBe(400);
  });

  it("POST /api/categories returns 201 for an admin", async () => {
    prisma.category.create.mockResolvedValue({ id: "c1", name: "Work" });

    const res = await post("/api/categories", { name: "Work" }, adminToken());

    expect(res.status).toBe(201);
  });

  it("GET /api/categories returns 200", async () => {
    prisma.category.findMany.mockResolvedValue([{ id: "c1" }]);

    const res = await request("GET", "/api/categories", { token: userToken() });

    expect(res.status).toBe(200);
  });

  it("DELETE /api/categories/:id returns 200 for an admin", async () => {
    prisma.category.delete.mockResolvedValue({ id: "c1" });

    const res = await del("/api/categories/c1", adminToken());

    expect(res.status).toBe(200);
  });

  it("PUT /api/categories/:id returns 403 for a non-admin token", async () => {
    const res = await put("/api/categories/c1", { name: "Work" }, userToken());

    expect(res.status).toBe(403);
  });
});

describe("admin auth routes", () => {
  it("POST /api/admin/auth/register returns 201", async () => {
    prisma.admin.findUnique.mockResolvedValue(null);
    prisma.admin.create.mockResolvedValue({ id: "a1" });
    prisma.adminVerificationToken.create.mockResolvedValue({});

    const res = await post("/api/admin/auth/register", {
      name: "Abda",
      email: "admin@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(201);
  });

  it("POST /api/admin/auth/login returns 200 with a token", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1",
      name: "Abd",
      email: "admin@example.com",
      password: "hashed",
      emailVerifiedAt: new Date(),
    });

    const res = await post("/api/admin/auth/login", {
      email: "admin@example.com",
      password: "secret123",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.token).toBeTruthy();
  });
});

describe("auth profile & resend", () => {
  it("POST /api/auth/resend-code returns 400 without an email", async () => {
    const res = await post("/api/auth/resend-code", {});
    expect(res.status).toBe(400);
  });

  it("POST /api/auth/resend-code returns 404 for an unknown email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await post("/api/auth/resend-code", { email: "nobody@example.com" });
    expect(res.status).toBe(404);
  });

  it("POST /api/auth/resend-code returns 400 when already verified", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", emailVerifiedAt: new Date() });
    const res = await post("/api/auth/resend-code", { email: "user@example.com" });
    expect(res.status).toBe(400);
  });

  it("POST /api/auth/resend-code returns 200 and sends a fresh code", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", name: "Abd", emailVerifiedAt: null });
    prisma.verificationToken.create.mockResolvedValue({});

    const res = await post("/api/auth/resend-code", { email: "user@example.com" });

    expect(res.status).toBe(200);
    expect(sendVerificationEmail).toHaveBeenCalled();
  });

  it("GET /api/auth/me returns 401 without a token", async () => {
    const res = await request("GET", "/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me returns 200 with the profile", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1", name: "Abd", email: "user@example.com", emailVerifiedAt: new Date(),
    });

    const res = await request("GET", "/api/auth/me", { token: userToken() });

    expect(res.status).toBe(200);
  });
});

describe("admin profile & resend", () => {
  it("POST /api/admin/auth/resend-code returns 200 and sends a fresh code", async () => {
    prisma.admin.findUnique.mockResolvedValue({ id: "a1", name: "Abd", emailVerifiedAt: null });
    prisma.adminVerificationToken.create.mockResolvedValue({});

    const res = await post("/api/admin/auth/resend-code", { email: "admin@example.com" });

    expect(res.status).toBe(200);
    expect(sendVerificationEmail).toHaveBeenCalled();
  });

  it("GET /api/admin/auth/me returns 403 for a user token", async () => {
    const res = await request("GET", "/api/admin/auth/me", { token: userToken() });
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/auth/me returns 200 for an admin", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1", name: "Abd", email: "admin@example.com", emailVerifiedAt: new Date(),
    });

    const res = await request("GET", "/api/admin/auth/me", { token: adminToken() });

    expect(res.status).toBe(200);
  });
});

describe("status routes", () => {
  it("GET /api/statuses returns 401 without a token", async () => {
    const res = await request("GET", "/api/statuses");
    expect(res.status).toBe(401);
  });

  it("GET /api/statuses returns 200 with the list", async () => {
    prisma.status.findMany.mockResolvedValue([{ id: "s1", code: "PENDING" }]);

    const res = await request("GET", "/api/statuses", { token: userToken() });

    expect(res.status).toBe(200);
  });

  it("GET /api/statuses/:id returns 404 when missing", async () => {
    prisma.status.findUnique.mockResolvedValue(null);

    const res = await request("GET", "/api/statuses/missing", { token: userToken() });

    expect(res.status).toBe(404);
  });
});

describe("admin management routes", () => {
  it("GET /api/admin/users returns 403 for a user token", async () => {
    const res = await request("GET", "/api/admin/users", { token: userToken() });
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/users returns 200 for an admin", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    const res = await request("GET", "/api/admin/users", { token: adminToken() });
    expect(res.status).toBe(200);
  });

  it("GET /api/admin/admins returns 200 for an admin", async () => {
    prisma.admin.findMany.mockResolvedValue([]);
    const res = await request("GET", "/api/admin/admins", { token: adminToken() });
    expect(res.status).toBe(200);
  });

  it("GET /api/admin/overview returns 200 for an admin", async () => {
    const res = await request("GET", "/api/admin/overview", { token: adminToken() });
    expect(res.status).toBe(200);
  });

  it("POST /api/admin/statuses returns 400 when the code is missing", async () => {
    const res = await post("/api/admin/statuses", { label: "New" }, adminToken());
    expect(res.status).toBe(400);
  });

  it("POST /api/admin/statuses returns 400 for a duplicate code", async () => {
    prisma.status.findUnique.mockResolvedValue({ id: "s1" });

    const res = await post(
      "/api/admin/statuses",
      { code: "PENDING", label: "Pending" },
      adminToken()
    );

    expect(res.status).toBe(400);
  });

  it("POST /api/admin/statuses returns 201 for a new status", async () => {
    prisma.status.findUnique.mockResolvedValue(null);
    prisma.status.create.mockResolvedValue({ id: "s9", code: "REVIEW", label: "Review" });

    const res = await post(
      "/api/admin/statuses",
      { code: "REVIEW", label: "Review" },
      adminToken()
    );

    expect(res.status).toBe(201);
  });

  it("PUT /api/admin/statuses/:id returns 200", async () => {
    prisma.status.update.mockResolvedValue({ id: "s1" });

    const res = await put(
      "/api/admin/statuses/s1",
      { code: "PENDING", label: "Pending" },
      adminToken()
    );

    expect(res.status).toBe(200);
  });

  it("DELETE /api/admin/statuses/:id returns 200", async () => {
    prisma.status.delete.mockResolvedValue({ id: "s1" });

    const res = await del("/api/admin/statuses/s1", adminToken());

    expect(res.status).toBe(200);
  });
});

describe("task authorization & pagination", () => {
  it("GET /api/tasks supports pagination", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);

    const res = await request("GET", "/api/tasks?page=2&limit=5", { token: userToken() });

    expect(res.status).toBe(200);
  });

  it("PUT /api/tasks/:id returns 403 for a task owned by someone else", async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: "t1", createdById: "someone-else", createdByType: "USER",
    });

    const res = await put("/api/tasks/t1", { endFlag: true }, userToken());

    expect(res.status).toBe(403);
  });

  it("PUT /api/tasks/:id returns 404 when the task does not exist", async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    const res = await put("/api/tasks/missing", { endFlag: true }, userToken());

    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id returns 403 for a task owned by someone else", async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: "t1", createdById: "someone-else", createdByType: "USER",
    });

    const res = await del("/api/tasks/t1", userToken());

    expect(res.status).toBe(403);
  });

  it("an admin may update any task", async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: "t1", createdById: "someone-else", createdByType: "USER",
    });
    prisma.task.update.mockResolvedValue({ id: "t1" });

    const res = await put("/api/tasks/t1", { endFlag: true }, adminToken());

    expect(res.status).toBe(200);
  });
});

describe("health", () => {
  it("GET /health returns 200", async () => {
    const res = await request("GET", "/health");
    expect(res.status).toBe(200);
  });
});

describe("404 handling", () => {
  it("returns 404 for an unknown API route", async () => {
    const res = await request("GET", "/api/does-not-exist", { token: userToken() });

    expect(res.status).toBe(404);
  });
});
