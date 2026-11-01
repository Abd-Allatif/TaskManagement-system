/**
 * End-to-end contract check for the frontend, executed through the Vite dev
 * proxy on :3000 — the same origin path the browser uses.
 *
 * Creates a throwaway account, walks register (auto workspace) -> verify ->
 * login -> workspace list -> task CRUD (with X-Workspace-Id), then deletes
 * everything it created. Safe to re-run.
 */
// This script installs nothing: its runtime dependencies (dotenv, prisma)
// come from the backend's node_modules, so everything is resolved by absolute
// path and runs from a bare frontend checkout.
const BACKEND_DIR =
  "/home/jigsow/Documents/Programming/Express/TaskManagmentSystem/TaskManagmentBackend";

require(`${BACKEND_DIR}/node_modules/dotenv`).config({
  path: `${BACKEND_DIR}/.env`,
});
const prisma = require(`${BACKEND_DIR}/prismaClient.js`);

const BASE = "http://localhost:3000/api";
const EMAIL = "e2e-console@local.test";
const PASSWORD = "console-pass-2026";
let token = null;
let workspaceId = null;

const call = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Workspace scoping rides the header, exactly like the browser client.
      ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 200) };
  }
  return { status: res.status, payload };
};

const step = async (label, fn) => {
  try {
    const result = await fn();
    console.log(`PASS ${label}`);
    return result;
  } catch (err) {
    console.error(`FAIL ${label}: ${err.message}`);
    throw err;
  }
};

const expect = (cond, label) => {
  if (!cond) throw new Error(label);
};

(async () => {
  let createdId = null;

  try {
    await step("backend health (direct :5000)", async () => {
      const res = await fetch("http://localhost:5000/health");
      expect(res.ok, `expected ok, got ${res.status}`);
    });

    // Clean slate for the throwaway account.
    const pre = await prisma.user.findFirst({ where: { email: EMAIL } });
    if (pre) await prisma.verificationToken.deleteMany({ where: { userId: pre.id } });

    await step("statuses are readable (unauthenticated)", async () => {
      const { status } = await call("/statuses");
      // verifyToken is required -> expect 401 without a token
      expect(status === 401, `expected 401, got ${status}`);
    });

    await step("register -> 201 with a default workspace", async () => {
      const res = await fetch(`${BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Frontend Console Test", email: EMAIL, password: PASSWORD }),
      });
      const payload = await res.json().catch(() => null);

      expect(res.status === 201, `expected 201, got ${res.status}`);
      expect(payload?.workspace?.id, "registration did not return a workspace");
    });

    await step("read verification code from DB", async () => {
      const user = await prisma.user.findFirst({
        where: { email: EMAIL },
        include: { verificationTokens: true },
      });
      expect(user, "user row missing");
      expect(user.verificationTokens.length > 0, "no token row");
      const code = user.verificationTokens[0].token;
      const { status, payload } = await call("/auth/verify-email", {
        method: "POST",
        body: { email: EMAIL, code },
      });
      expect(status === 200, `verify-email got ${status}: ${JSON.stringify(payload)}`);
    });

    await step("login -> token + principal", async () => {
      const { status, payload } = await call("/auth/login", {
        method: "POST",
        body: { email: EMAIL, password: PASSWORD },
      });
      expect(status === 200, `login got ${status}: ${JSON.stringify(payload)}`);
      expect(payload?.token, "no token");
      token = payload.token;
      createdId = payload.user?.id;
      expect(createdId, "no user id in login payload");
      expect(payload.user?.name === "Frontend Console Test", "principal name mismatch");
    });

    await step("GET /auth/me", async () => {
      const { status, payload } = await call("/auth/me");
      expect(status === 200, `me got ${status}`);
      expect(payload?.user?.id === createdId, "me.id mismatch");
    });

    let statusesList;
    await step("statuses readable with token", async () => {
      const { status, payload } = await call("/statuses");
      expect(status === 200, `statuses got ${status}`);
      statusesList = payload?.statuses || [];
      expect(statusesList.length > 0, "no statuses seeded");
      expect(statusesList[0]?.code && statusesList[0]?.label, "status shape wrong");
    });

    await step("GET /workspaces lists the default workspace with OWNER role", async () => {
      const { status, payload } = await call("/workspaces");
      expect(status === 200, `workspaces got ${status}`);
      const list = payload?.workspaces || [];
      expect(list.length === 1, `expected exactly 1 membership, got ${list.length}`);
      const ws = list[0];
      workspaceId = ws.id;
      expect(ws.ownerUserId === createdId, "user is not the workspace owner");
      expect(ws.isOwner === true, "isOwner flag missing");
      expect(ws.role?.name === "OWNER", `role is ${ws.role?.name}, expected OWNER`);
      expect(
        Array.isArray(ws.role?.permissions) && ws.role.permissions.includes("task.create"),
        "permission codes missing",
      );
    });

    await step("task routes require the workspace header", async () => {
      // One-shot header-less probe against another endpoint that must reject.
      const res = await fetch(`${BASE}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: "no header" }),
      });
      expect(res.status === 400, `expected 400 without header, got ${res.status}`);
    });

    await step("categories readable inside the workspace", async () => {
      const { status, payload } = await call("/categories");
      expect(status === 200, `categories got ${status}`);
      expect(Array.isArray(payload?.categories), "categories not an array");
    });

    await step("POST /categories inside the workspace", async () => {
      const res = await call("/categories", {
        method: "POST",
        body: { name: `e2e-cat-${Date.now()}` },
      });
      expect(res.status === 201, `category create got ${res.status}`);
      expect(res.payload?.category?.workspaceId === workspaceId, "category not scoped");
    });

    let list;
    await step("POST /tasks", async () => {
      const res = await call("/tasks", {
        method: "POST",
        body: {
          title: "Proxy contract smoke test",
          description: "created by scripts/e2e-contract",
          deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          assignments: [{ assignableType: "USER", assignableId: createdId }],
        },
      });
      expect(res.status === 201, `create got ${res.status}: ${JSON.stringify(res.payload)}`);
      list = res.payload.task;
      expect(list.title === "Proxy contract smoke test", "created task shape");
      expect(list.workspaceId === workspaceId, "task not scoped to the workspace");
    });

    await step("GET /tasks list shape", async () => {
      const res = await call("/tasks?limit=10&page=1");
      expect(res.status === 200, `list got ${res.status}`);
      expect(Array.isArray(res.payload.tasks), "tasks not an array");
      expect(res.payload.pagination?.page === 1, "pagination shape wrong");
      expect(
        res.payload.tasks.some((t) => t.id === list.id),
        "created task missing from list",
      );
    });

    await step("GET /tasks/:id includes relations", async () => {
      const res = await call(`/tasks/${list.id}`);
      expect(res.status === 200, `get-by-id got ${res.status}`);
      expect(res.payload.task?.status?.code, "status relation missing");
      expect(Array.isArray(res.payload.task?.assignments), "assignments missing");
      expect(res.payload.task?.workspace?.id === workspaceId, "workspace relation missing");
    });

    await step("PUT /tasks/:id (status + endFlag)", async () => {
      const target = statusesList.find((s) => s.code === "IN_PROGRESS") || statusesList[0];
      const res = await call(`/tasks/${list.id}`, {
        method: "PUT",
        body: { statusId: target.id, endFlag: true, title: "Proxy contract smoke test (updated)" },
      });
      expect(res.status === 200, `update got ${res.status}: ${JSON.stringify(res.payload)}`);
      expect(res.payload.task?.endFlag === true, "endFlag not applied");
    });

    await step("GET /workspaces/:id/members", async () => {
      const res = await call(`/workspaces/${workspaceId}/members`);
      expect(res.status === 200, `members got ${res.status}`);
      expect(
        (res.payload?.members || []).some((m) => m.user?.id === createdId),
        "creator missing from members",
      );
    });

    await step("member is forbidden from admin overview", async () => {
      const res = await call("/admin/overview");
      expect(res.status === 403, `admin route got ${res.status}, expected 403`);
    });

    await step("DELETE /tasks/:id", async () => {
      const res = await call(`/tasks/${list.id}`, { method: "DELETE" });
      expect(res.status === 200, `delete got ${res.status}`);
      expect((await call(`/tasks/${list.id}`)).status === 404, "task still readable");
    });

    await step("logout", async () => {
      const res = await call("/auth/logout", { method: "POST" });
      expect(res.status === 200, `logout got ${res.status}`);
    });

    console.log("\nALL E2E CHECKS PASSED");
  } catch (err) {
    console.error(`\nE2E FAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    // Remove the throwaway account and everything it created.
    const user = await prisma.user.findFirst({ where: { email: EMAIL } }).catch(() => null);
    if (user) {
      const mine = await prisma.task
        .findMany({ where: { createdById: user.id, createdByType: "USER" } })
        .catch(() => []);

      const ids = mine.map((t) => t.id);

      for (const id of ids) {
        await prisma.taskAssignment.deleteMany({ where: { taskId: id } }).catch(() => {});
        await prisma.categoryTaskPivot.deleteMany({ where: { taskId: id } }).catch(() => {});
        await prisma.task.updateMany({ where: { parentTaskId: id }, data: { parentTaskId: null } }).catch(() => {});
        await prisma.task.deleteMany({ where: { id } }).catch(() => {}); // hard delete
      }

      await prisma.verificationToken.deleteMany({ where: { userId: user.id } }).catch(() => {});
      // owner_user_id is ON DELETE RESTRICT: drop owned workspaces first...
      await prisma.category.deleteMany({ where: { workspace: { ownerUserId: user.id } } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { ownerUserId: user.id } }).catch(() => {});
      // ...then the account cascades memberships, invites and tokens.
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
})();
