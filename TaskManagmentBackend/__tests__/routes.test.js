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
    updateMany: jest.fn(),
  },
  status: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
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
    deleteMany: jest.fn(),
  },
  // workspace / RBAC models
  workspace: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  membership: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  role: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  rolePermission: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  permission: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  workspaceInvite: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
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
    workspaceId: "ws-1",
  });
  prisma.task.count.mockResolvedValue(0);
  prisma.user.count.mockResolvedValue(0);
  prisma.admin.count.mockResolvedValue(0);
  prisma.category.count.mockResolvedValue(0);
  prisma.status.count.mockResolvedValue(0);
  prisma.task.groupBy.mockResolvedValue([]);
  prisma.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  prisma.adminVerificationToken.deleteMany.mockResolvedValue({ count: 0 });

  // Workspace context: a workspace + a USER-role membership for "u1".
  prisma.workspace.findFirst.mockResolvedValue({
    id: "ws-1",
    name: "WS",
    ownerUserId: "u1",
  });
  prisma.membership.findFirst.mockResolvedValue({
    id: "m1",
    workspaceId: "ws-1",
    userId: "u1",
    role: {
      id: "r-user",
      name: "USER",
      rolePermissions: [
        { permission: { code: "task.create" } },
        { permission: { code: "task.update.own" } },
        { permission: { code: "task.delete.own" } },
        { permission: { code: "task.assign" } },
        { permission: { code: "category.create" } },
      ],
    },
  });

  // Registration creates the default workspace transactionally.
  prisma.workspace.create.mockResolvedValue({ id: "ws-new", name: "Abda's Workspace" });
  prisma.role.create.mockResolvedValue({ id: "r1", name: "OWNER" });
  prisma.membership.create.mockResolvedValue({});
});

const request = (method, path, { body, token, headers } = {}) => {
  const hdrs = { ...(headers || {}) };
  if (body !== undefined) hdrs["Content-Type"] = "application/json";
  if (token) hdrs.Authorization = `Bearer ${token}`;

  return fetch(baseUrl + path, {
    method,
    headers: hdrs,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
};

const post = (path, body, token, extra) =>
  request("POST", path, { body, token, headers: extra });
const put = (path, body, token, extra) =>
  request("PUT", path, { body, token, headers: extra });
const del = (path, token, extra) => request("DELETE", path, { token, headers: extra });
const get = (path, token, extra) => request("GET", path, { token, headers: extra });

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

  it("POST /api/auth/register returns 201 with a default workspace", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "u1" });
    prisma.verificationToken.create.mockResolvedValue({});

    const res = await post("/api/auth/register", {
      name: "Abda",
      email: "user@example.com",
      password: "secret123",
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(sendVerificationEmail).toHaveBeenCalled();
    expect(body.workspace).toEqual({ id: "ws-new", name: "Abda's Workspace" });
    expect(prisma.membership.create).toHaveBeenCalled();
  });

  it("POST /api/auth/register rejects a duplicate email with 400", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "existing" });

    const res = await post("/api/auth/register", {
      name: "Abda",
      email: "user@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("POST /api/auth/login returns 401 for an unknown email", async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await post("/api/auth/login", {
      email: "nobody@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(401);
  });

  it("POST /api/auth/login returns 403 when the email is not verified", async () => {
    prisma.user.findFirst.mockResolvedValue({ ...verifiedUser, emailVerifiedAt: null });

    const res = await post("/api/auth/login", {
      email: "user@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(403);
  });

  it("POST /api/auth/login returns 200 with a token for a verified user", async () => {
    prisma.user.findFirst.mockResolvedValue(verifiedUser);

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

  it("POST /api/tasks returns 400 when the workspace header is missing", async () => {
    const res = await post("/api/tasks", { title: "My task" }, userToken());

    expect(res.status).toBe(400);
  });

  it("POST /api/tasks returns 400 when title is missing", async () => {
    const res = await post("/api/tasks", {}, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(400);
  });

  it("POST /api/tasks returns 201 with a valid token, header and body", async () => {
    prisma.status.findFirst.mockResolvedValue({ id: "s1" });
    prisma.task.create.mockResolvedValue({ id: "t1" });

    const res = await post("/api/tasks", { title: "My task" }, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(201);
    const createData = prisma.task.create.mock.calls[0][0].data;
    expect(createData.workspaceId).toBe("ws-1");
  });

  it("POST /api/tasks returns 403 for a member without task.create", async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: "m1",
      role: { rolePermissions: [] },
    });

    const res = await post("/api/tasks", { title: "My task" }, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(403);
  });

  it("POST /api/tasks returns 403 when the user is not a member", async () => {
    prisma.membership.findFirst.mockResolvedValue(null);

    const res = await post("/api/tasks", { title: "My task" }, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(403);
  });

  it("GET /api/tasks/:id returns 404 when the task is missing", async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    const res = await request("GET", "/api/tasks/missing", { token: userToken(), headers: { "X-Workspace-Id": "ws-1" } });

    expect(res.status).toBe(404);
  });

  it("GET /api/tasks/:id returns 200 when the task exists", async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: "t1",
      workspaceId: "ws-1",
      createdById: "u1",
      createdByType: "USER",
    });

    const res = await request("GET", "/api/tasks/t1", { token: userToken(), headers: { "X-Workspace-Id": "ws-1" } });

    expect(res.status).toBe(200);
  });

  it("PUT /api/tasks/:id returns 200 for a partial update by the creator", async () => {
    prisma.task.update.mockResolvedValue({ id: "t1" });

    const res = await put("/api/tasks/t1", { endFlag: true }, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(200);
  });

  it("DELETE /api/tasks/:id returns 200", async () => {
    prisma.task.update.mockResolvedValue({ id: "t1" });

    const res = await del("/api/tasks/t1", userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(200);
  });

  it("accepts a valid admin token and lists across workspaces without header", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);

    const res = await request("GET", "/api/tasks", { token: adminToken() });

    expect(res.status).toBe(200);
    // sudo mode: no workspace filter at all
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect("workspaceId" in where).toBe(false);
  });
});

describe("category routes", () => {
  it("POST /api/categories returns 401 without a token", async () => {
    const res = await post("/api/categories", { name: "Work" });

    expect(res.status).toBe(401);
  });

  it("POST /api/categories returns 400 when the workspace header is missing", async () => {
    const res = await post("/api/categories", { name: "Work" }, userToken());

    expect(res.status).toBe(400);
  });

  it("POST /api/categories returns 201 for a (non-admin) member", async () => {
    prisma.category.create.mockResolvedValue({ id: "c1", name: "Work" });

    const res = await post("/api/categories", { name: "Work" }, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(201);
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { workspaceId: "ws-1", name: "Work", color: null },
    });
  });

  it("POST /api/categories returns 400 when name is missing", async () => {
    const res = await post("/api/categories", {}, adminToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(400);
  });

  it("GET /api/categories returns 200", async () => {
    prisma.category.findMany.mockResolvedValue([{ id: "c1" }]);

    const res = await get("/api/categories", userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(200);
  });

  it("PUT /api/categories/:id returns 403 for a member without category.update", async () => {
    const res = await put("/api/categories/c1", { name: "Work" }, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(403);
  });

  it("PUT /api/categories/:id returns 200 for a member with category.update", async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: "m1",
      role: {
        rolePermissions: [{ permission: { code: "category.update" } }],
      },
    });
    prisma.category.findFirst.mockResolvedValue({ id: "c1", workspaceId: "ws-1" });
    prisma.category.update.mockResolvedValue({ id: "c1", name: "New" });

    const res = await put("/api/categories/c1", { name: "New" }, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(200);
  });

  it("DELETE /api/categories/:id returns 200 for a platform admin", async () => {
    prisma.category.findFirst.mockResolvedValue({ id: "c1", workspaceId: "ws-1" });
    prisma.category.delete.mockResolvedValue({ id: "c1" });

    const res = await del("/api/categories/c1", adminToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(200);
  });
});

describe("admin auth routes", () => {
  it("POST /api/admin/auth/register returns 201", async () => {
    prisma.admin.findFirst.mockResolvedValue(null);
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
    prisma.admin.findFirst.mockResolvedValue({
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
    prisma.user.findFirst.mockResolvedValue(null);
    const res = await post("/api/auth/resend-code", { email: "nobody@example.com" });
    expect(res.status).toBe(404);
  });

  it("POST /api/auth/resend-code returns 400 when already verified", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "u1", emailVerifiedAt: new Date() });
    const res = await post("/api/auth/resend-code", { email: "user@example.com" });
    expect(res.status).toBe(400);
  });

  it("POST /api/auth/resend-code returns 200 and sends a fresh code", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "u1", name: "Abd", emailVerifiedAt: null });
    prisma.verificationToken.create.mockResolvedValue({});

    const res = await post("/api/auth/resend-code", { email: "user@example.com" });

    expect(res.status).toBe(200);
    expect(sendVerificationEmail).toHaveBeenCalled();
  });

  it("GET /api/auth/me returns 401 without a token", async () => {
    const res = await get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me returns 200 with the profile", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1", name: "Abd", email: "user@example.com", emailVerifiedAt: new Date(),
    });

    const res = await get("/api/auth/me", userToken());

    expect(res.status).toBe(200);
  });
});

describe("admin profile & resend", () => {
  it("POST /api/admin/auth/resend-code returns 200 and sends a fresh code", async () => {
    prisma.admin.findFirst.mockResolvedValue({ id: "a1", name: "Abd", emailVerifiedAt: null });
    prisma.adminVerificationToken.create.mockResolvedValue({});

    const res = await post("/api/admin/auth/resend-code", { email: "admin@example.com" });

    expect(res.status).toBe(200);
    expect(sendVerificationEmail).toHaveBeenCalled();
  });

  it("GET /api/admin/auth/me returns 403 for a user token", async () => {
    const res = await get("/api/admin/auth/me", userToken());
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/auth/me returns 200 for an admin", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1", name: "Abd", email: "admin@example.com", emailVerifiedAt: new Date(),
    });

    const res = await get("/api/admin/auth/me", adminToken());

    expect(res.status).toBe(200);
  });
});

describe("status routes", () => {
  it("GET /api/statuses returns 401 without a token", async () => {
    const res = await get("/api/statuses");
    expect(res.status).toBe(401);
  });

  it("GET /api/statuses returns 200 with the list", async () => {
    prisma.status.findMany.mockResolvedValue([{ id: "s1", code: "PENDING" }]);

    const res = await get("/api/statuses", userToken());

    expect(res.status).toBe(200);
  });

  it("GET /api/statuses/:id returns 404 when missing", async () => {
    prisma.status.findUnique.mockResolvedValue(null);

    const res = await get("/api/statuses/missing", userToken());

    expect(res.status).toBe(404);
  });
});

describe("admin management routes", () => {
  it("GET /api/admin/users returns 403 for a user token", async () => {
    const res = await get("/api/admin/users", userToken());
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/users returns 200 for an admin", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    const res = await get("/api/admin/users", adminToken());
    expect(res.status).toBe(200);
  });

  it("GET /api/admin/admins returns 200 for an admin", async () => {
    prisma.admin.findMany.mockResolvedValue([]);
    const res = await get("/api/admin/admins", adminToken());
    expect(res.status).toBe(200);
  });

  it("GET /api/admin/overview returns 200 for an admin", async () => {
    const res = await get("/api/admin/overview", adminToken());
    expect(res.status).toBe(200);
  });

  it("POST /api/admin/statuses returns 400 when the code is missing", async () => {
    const res = await post("/api/admin/statuses", { label: "New" }, adminToken());
    expect(res.status).toBe(400);
  });

  it("POST /api/admin/statuses returns 400 for a duplicate code", async () => {
    prisma.status.findFirst.mockResolvedValue({ id: "s1" });

    const res = await post(
      "/api/admin/statuses",
      { code: "PENDING", label: "Pending" },
      adminToken()
    );

    expect(res.status).toBe(400);
  });

  it("POST /api/admin/statuses returns 201 for a new status", async () => {
    prisma.status.findFirst.mockResolvedValue(null);
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
  it("GET /api/tasks supports pagination inside the workspace", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);

    const res = await get("/api/tasks?page=2&limit=5", userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(200);
    expect(prisma.task.findMany.mock.calls[0][0].where.workspaceId).toBe("ws-1");
  });

  it("GET /api/tasks returns 400 for a member without the workspace header", async () => {
    const res = await get("/api/tasks", userToken());
    expect(res.status).toBe(400);
  });

  it("PUT /api/tasks/:id returns 403 for a task owned by someone else", async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: "t1", createdById: "someone-else", createdByType: "USER", workspaceId: "ws-1",
    });

    const res = await put("/api/tasks/t1", { endFlag: true }, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(403);
  });

  it("PUT /api/tasks/:id returns 200 for a member with task.update.any", async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: "m1",
      role: { rolePermissions: [{ permission: { code: "task.update.any" } }] },
    });
    prisma.task.findFirst.mockResolvedValue({
      id: "t1", createdById: "someone-else", createdByType: "USER", workspaceId: "ws-1",
    });
    prisma.task.update.mockResolvedValue({ id: "t1" });

    const res = await put("/api/tasks/t1", { endFlag: true }, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(200);
  });

  it("PUT /api/tasks/:id returns 404 when the task does not exist", async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    const res = await put("/api/tasks/missing", { endFlag: true }, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(404);
  });

  it("PUT /api/tasks/:id returns 404 for a task outside the workspace", async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: "t1", createdById: "u1", createdByType: "USER", workspaceId: "other-ws",
    });

    const res = await put("/api/tasks/t1", { endFlag: true }, userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id returns 403 for a task owned by someone else", async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: "t1", createdById: "someone-else", createdByType: "USER", workspaceId: "ws-1",
    });

    const res = await del("/api/tasks/t1", userToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(403);
  });

  it("an admin may update any task", async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: "t1", createdById: "someone-else", createdByType: "USER", workspaceId: "ws-1",
    });
    prisma.task.update.mockResolvedValue({ id: "t1" });

    const res = await put("/api/tasks/t1", { endFlag: true }, adminToken(), {
      "X-Workspace-Id": "ws-1",
    });

    expect(res.status).toBe(200);
  });
});

describe("workspace routes", () => {
  // Param route validators require UUID-shaped workspace ids.
  const WS_PARAM = "11111111-1111-4111-8111-111111111111";

  it("POST /api/workspaces creates a workspace and makes the caller OWNER", async () => {
    prisma.workspace.create
      .mockResolvedValueOnce({ id: "ws-9", name: "New WS", ownerUserId: "u1" })
      .mockResolvedValueOnce({ id: "ws-9", name: "New WS", ownerUserId: "u1" });

    const res = await post("/api/workspaces", { name: "New WS" }, userToken());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.workspace.ownerUserId).toBe("u1");
    // 3 system roles are seeded for the new workspace (owner call: workspace + roles)
    expect(prisma.role.create).toHaveBeenCalledTimes(3);
    expect(prisma.membership.create).toHaveBeenCalled();
  });

  it("GET /api/workspaces lists my memberships with roles", async () => {
    prisma.membership.findMany.mockResolvedValue([
      {
        workspace: { id: "ws-1", name: "WS", ownerUserId: "u1" },
        role: { id: "r-user", name: "USER" },
      },
    ]);

    const res = await get("/api/workspaces", userToken());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.workspaces[0].id).toBe("ws-1");
    expect(body.workspaces[0].role.name).toBe("USER");
  });

  it("Workspace-scoped sub-resources resolve via the id param", async () => {
    prisma.membership.findMany.mockResolvedValue([
      {
        id: "m1",
        user: { id: "u1", name: "Abd", email: "user@example.com" },
        role: { id: "r-user", name: "USER" },
      },
    ]);

    const res = await get(`/api/workspaces/${WS_PARAM}/members`, userToken());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.members[0].role.name).toBe("USER");
  });

  it("PATCH /api/workspaces/:id renames with the workspace.update permission", async () => {
    prisma.workspace.findFirst.mockResolvedValue({
      id: WS_PARAM,
      name: "WS",
      ownerUserId: "u1",
    });
    prisma.membership.findFirst.mockResolvedValue({
      id: "m1",
      role: { rolePermissions: [{ permission: { code: "workspace.update" } }] },
    });
    prisma.workspace.update.mockResolvedValue({ id: WS_PARAM, name: "Renamed" });

    const res = await request("PATCH", `/api/workspaces/${WS_PARAM}`, {
      token: userToken(),
      body: { name: "Renamed" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.workspace.name).toBe("Renamed");
  });

  it("PATCH /api/workspaces/:id returns 403 without workspace.update", async () => {
    const res = await request("PATCH", `/api/workspaces/${WS_PARAM}`, {
      token: userToken(),
      body: { name: "Renamed" },
    });

    expect(res.status).toBe(403);
  });
});

describe("health", () => {
  it("GET /health returns 200", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
  });
});

describe("404 handling", () => {
  it("returns 404 for an unknown API route", async () => {
    const res = await get("/api/does-not-exist", userToken());

    expect(res.status).toBe(404);
  });
});
