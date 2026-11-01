# Task Management Backend

Express 5 REST API for a multi-tenant task management system. It combines
email-verified authentication, platform-side administration, and — since the
workspaces release — full workspace isolation with role-based access control
(RBAC).

Everything below documents the API as it is today: the architecture, the
authorization model, every endpoint, the data model, configuration, scripts,
testing and the operational gotchas learned running it.

---

## Table of contents

1. [Stack](#stack)
2. [Architecture](#architecture)
3. [Authorization model](#authorization-model)
   - [Principals](#principals)
   - [Workspaces & RBAC](#workspaces--rbac)
   - [Permission catalog](#permission-catalog)
   - [System roles](#system-roles)
   - [Workspace scoping on the wire](#workspace-scoping-on-the-wire)
4. [API reference](#api-reference)
5. [Data model](#data-model)
6. [Authentication lifecycle](#authentication-lifecycle)
7. [Error handling](#error-handling)
8. [Rate limits](#rate-limits)
9. [Getting started](#getting-started)
10. [npm scripts](#npm-scripts)
11. [Seeds, permissions & data migration](#seeds-permissions--data-migration)
12. [Testing](#testing)
13. [Project layout](#project-layout)
14. [Gotchas & operational notes](#gotchas--operational-notes)

---

## Stack

| Layer      | Choice                                              |
|------------|-----------------------------------------------------|
| Runtime    | Node.js ≥ 20, CommonJS modules                      |
| Framework  | Express 5                                           |
| Database   | MariaDB / MySQL via Prisma 7                        |
| Prisma I/O | Driver adapter `@prisma/adapter-mariadb` (no `url` in the datasource block — `prisma.config.ts` feeds `DATABASE_URL` to the CLI) |
| Auth       | JWT (`jsonwebtoken`) + bcrypt(10)                   |
| Email      | Nodemailer SMTP (verification codes)                |
| Validation | express-validator per-route rule arrays             |
| Docs       | none generated — this file is the contract          |

---

## Architecture

Layered, per domain. Every domain reads the same way:

```
routes/<Domain>/      → HTTP wiring, middleware chain, validators
controllers/<Domain>/ → request/response handling only (no Prisma)
repository/<Domain>/  → all Prisma access
middleware/           → auth, adminAuth, authorization, permissions, workspace, validators
```

Current domains: `Authentication`, `Task`, `Category`, `Status`, `Admin`,
`Workspace`.

Entry point `server.js`:

1. `require("dotenv").config()` — **must stay the first line**.
2. `helmet()` → `cors({ origin: CLIENT_URL, credentials: true })` →
   global rate limiter → `express.json()`.
3. Mounts (exact casing matters, see gotchas):
   - `/api/auth` → `routes/Authentication/authRoutes.js`
   - `/api/tasks` → `routes/Task/taskRoutes.js`
   - `/api/categories` → `routes/Category/categoryRoutes.js`
   - `/api/statuses` → `routes/Status/statusRoutes.js`
   - `/api/workspaces` → `routes/Workspace/workspaceRoutes.js`
   - `/api/permissions` → `routes/Workspace/permissionRoutes.js`
   - `/api/admin/auth` → `routes/Admin/adminRoutes.js`
   - `/api/admin` → `routes/Admin/adminManagementRoutes.js`
4. 404 catch-all → `errorHandler` (last).
5. `GET /health` (no auth) returns `{ status, uptime, timestamp }`.
6. `GET /` serves `public/index.html` (a minimal landing page).
7. Exports the `app`; `app.listen(PORT)` only runs when the file is executed
   directly (`require.main === module`), so integration tests can boot it on
   an ephemeral port.
8. `PORT` defaults to **3000** (note: `.env.example` and the development
   `.env` use 5000; the frontend dev proxy targets 5000).

`prismaClient.js` is a singleton that instantiates `PrismaClient` with the
MariaDB driver adapter. **Always `require` it — never instantiate a second
client**, otherwise you get two connection pools and inconsistent state.

---

## Authorization model

### Principals

There are two top-level principals sharing an almost identical lifecycle
(register → 6-digit email code → verify → login):

| Principal | Table    | Login route        | JWT payload                                  |
|-----------|----------|--------------------|----------------------------------------------|
| User      | `users`  | `POST /api/auth/login`   | `{ userId, email, iat, exp }` — no `type` field |
| Platform Admin | `admins` | `POST /api/admin/auth/login` | `{ adminId, email, type: "ADMIN", iat, exp }` |

`middleware/auth.js` (`verifyToken`) verifies the JWT and normalizes
`req.user = { id, type: "USER" | "ADMIN", … }` — user tokens have no `type`,
so `verifyToken` fills in `USER`. `middleware/adminAuth.js` (`verifyAdmin`)
composes `verifyToken` and additionally requires `type === "ADMIN"`.

**Platform admins are superusers.** They bypass every workspace membership
and permission check (`req.isPlatformAdmin = true`), can read across all
workspaces and still must supply `X-Workspace-Id` for writes (see below).
They cannot, however, create workspace invites — there is no user account to
attach as `invitedById`.

### Workspaces & RBAC

- Every task and category lives in **exactly one workspace**; there is no
  cross-workspace sharing (v1 invariant).
- Every user owns a **default workspace** created atomically at registration
  (`"<Name>'s Workspace"`, the user as OWNER).
- **System roles** (`OWNER`, `ADMIN`, `USER`) are seeded per workspace and are
  immutable. **Custom roles** may be created from the permission catalog.
- One active role per user per workspace (`Membership` has a unique
  `(userId, workspaceId)`); being ADMIN in workspace A grants nothing in
  workspace B.
- Ownership transfer swaps the OWNER membership for ADMIN and warns off the
  `PATCH …/members/:userId` route (the owner's role is fixed there).
- Workspace deletion is a soft delete that cascades:
  live tasks → soft-deleted, invites → hard-deleted, categories →
  hard-deleted (their pivots cascade). Memberships stay attached to the
  hidden workspace row.

### Permission catalog

16 codes in `repository/Workspace/permissionsCatalog.js` (single source of
truth for both the seed and workspace creation):

| Code                | Label                                                    |
|---------------------|----------------------------------------------------------|
| `workspace.update`  | Rename and update the workspace                           |
| `workspace.delete`  | Delete the workspace (owner only by default)              |
| `workspace.transfer`| Transfer workspace ownership to another member            |
| `member.invite`     | Invite new members to the workspace                       |
| `member.remove`     | Remove members from the workspace                         |
| `member.role.assign`| Change the role of another member                         |
| `role.create`       | Create custom roles in the workspace                      |
| `role.update`       | Rename custom roles and change their permissions          |
| `role.delete`       | Delete custom roles in the workspace                      |
| `task.create`       | Create tasks in the workspace                             |
| `task.update.own`   | Update tasks they created                                 |
| `task.update.any`   | Update any task in the workspace                          |
| `task.delete.own`   | Soft-delete tasks they created                            |
| `task.delete.any`   | Soft-delete any task in the workspace                     |
| `task.assign`       | Assign tasks to members in the workspace                  |
| `category.create`   | Create categories in the workspace                        |
| `category.update`   | Update categories in the workspace                        |
| `category.delete`   | Delete categories in the workspace                        |

(18 codes — the table above lists all of them.)

### System roles

| Role  | Permissions                                                            |
|-------|------------------------------------------------------------------------|
| OWNER | all codes                                                              |
| ADMIN | all except `workspace.delete` and `workspace.transfer`                 |
| USER  | `task.create`, `task.update.own`, `task.delete.own`, `task.assign`, `category.create` |

### Workspace scoping on the wire

`middleware/workspace.js` resolves context from the `X-Workspace-Id` header
(or the `:id` route param under nested routes) and attaches:

- `req.workspace` — the non-deleted workspace row
- `req.member` — the membership incl. role + permissions (users only)
- `req.permissions` — `Set` of permission codes (users only)
- `req.isPlatformAdmin` — `true` for ADMIN-typed tokens

Three middlewares:

| Middleware                | Header behavior                                                       |
|---------------------------|------------------------------------------------------------------------|
| `resolveWorkspace`        | header mandatory — 400 if missing, 404 unknown workspace, 403 non-member |
| `resolveWorkspaceOptional`| header optional **for platform admins only** (they sweep across workspaces); members still 400 |
| `resolveParamWorkspace`   | workspace id from `req.params.id` (used by `/api/workspaces/:id/*`)     |

`middleware/permissions.js` provides:

- `requirePermission(code)` — 403 unless the caller holds the code (admins pass).
- `requireWorkspaceOwner` — 403 unless `workspace.ownerUserId === req.user.id`
  or the caller is a platform admin.
- `hasPermission`, `isWorkspaceOwner` — helpers.

`middleware/authorization.js` (tasks):

- `loadWorkspaceTask` — loads the task by `req.params.id` through the task
  repository (workspace-scoped unless a platform admin sweeps), soft-deleted
  tasks 404, attaches `req.task` **with relations included**.
- `taskInWorkspaceGuard` — 404 when the loaded task's `workspaceId` differs
  from the resolved workspace (a safety net when the header was optional).
- `assertTaskUpdateAccess` / `assertTaskDeleteAccess` — platform admins pass;
  members need `task.update.any`/`task.delete.any`, or the matching `.own`
  code when `req.task.createdById === req.user.id` **and**
  `createdByType === "USER"`.

---

## API reference

Legend: 🔓 no auth · 🔒 any authenticated principal · 👑 admin token
(`type: ADMIN`) required · `WS` = the request resolves a workspace context
(`X-Workspace-Id` header unless otherwise noted).

### Public & health

| Method | Path      | Access | Notes                    |
|--------|-----------|--------|--------------------------|
| GET    | `/`       | 🔓     | serves `public/index.html` |
| GET    | `/health` | 🔓     | `{ status, uptime, timestamp }` |

### User authentication — `/api/auth`

| Method | Path             | Access | Body / notes                                      |
|--------|------------------|--------|---------------------------------------------------|
| POST   | `/register`      | 🔓     | `{ name, email, password }`; also creates the user's default workspace + system roles + OWNER membership atomically. Optional `inviteToken` initialises a pending invite for the same email. Returns `{ userId, workspace: { id, name }, inviteRedeemed }`. |
| POST   | `/verify-email`  | 🔓     | `{ email, code }` (6-digit, 10-minute expiry)     |
| POST   | `/resend-code`   | 🔓     | `{ email }`; invalidates previous tokens          |
| POST   | `/login`         | 🔓     | `{ email, password }` — gated on `emailVerifiedAt`; returns `{ token, user }` |
| POST   | `/logout`        | 🔓     | stateless — returns 200                           |
| GET    | `/me`            | 🔒     | returns the principal from the token              |

### Platform admin authentication — `/api/admin/auth`

Same shape as `/api/auth` against the `admins` table (register, verify-email,
resend-code, login, logout, `/me`). Admin tokens carry `type: "ADMIN"` and
are rejected by all user-scoped and workspace-member routes, and vice versa.

### Tasks — `/api/tasks` (all 🔒)

Every request resolves a workspace context first; creation always targets a
workspace and requires the header even from admins.

| Method | Path        | Access             | Notes                                                          |
|--------|-------------|--------------------|----------------------------------------------------------------|
| GET    | `/`         | 🔒 + optional WS   | Members: header required, scoped to that workspace. Admin without header: every workspace (sudo). Query: `page`, `limit`, `sortBy` (`createDate`, `deadline`, `title`, `endFlag`), `sortOrder`, `statusId`, `parentTaskId`, `endFlag`, `search`, `createdById` + `createdByType`. Returns `{ tasks: [...with relations], pagination }`. |
| GET    | `/:id`      | 🔒 + optional WS   | Loads with relations (status, workspace, assignments, categories incl. pivots, subTasks). 404 for missing, soft-deleted or other-workspace ids. |
| POST   | `/`         | 🔒 + WS + `task.create` | `{ title (≤200), description?, deadline? (future), statusId? (defaults PENDING), parentTaskId? (same-workspace root task), categories?: [ids] (workspace members), assignments?: [{ assignableType: USER\|ADMIN, assignableId }] (USER ids must be workspace members) }` → 201 `{ task }`. Sets `createdById/type` from the token. |
| PUT    | `/:id`      | 🔒 + optional WS + update guard | Partial update; permission-driven (own/any). Relation replacement re-validates category ids (same workspace), assignables, and parent (same workspace, root, not itself). |
| DELETE | `/:id`      | 🔒 + optional WS + delete guard | Soft delete (`deletedAt`); same own/any permission logic. |

Assignments use `TYPE:id` pairs — a USER id pointing at an admin row is
rejected (and now rejected unless the user is a workspace member).

### Categories — `/api/categories` (all 🔒, all WS-scoped)

| Method | Path     | Access                       | Notes                                          |
|--------|----------|------------------------------|------------------------------------------------|
| GET    | `/`      | 🔒 + WS                      | lists this workspace's live categories          |
| GET    | `/:id`   | 🔒 + WS                      | 404 across workspaces (isolation)               |
| POST   | `/`      | 🔒 + WS + `category.create`  | `{ name, color? }`, unique per `(workspaceId, name)` |
| PUT    | `/:id`   | 🔒 + WS + `category.update`  | was admin-only; now permission-driven           |
| DELETE | `/:id`   | 🔒 + WS + `category.delete`  | hard delete; pivots cascade                     |

### Statuses — `/api/statuses`

| Method | Path     | Access | Notes                                            |
|--------|----------|--------|--------------------------------------------------|
| GET    | `/`      | 🔒     | global catalog, live rows, ordered by label       |
| GET    | `/:id`   | 🔒     | by uuid                                           |

Statuses are a **global catalog** (`PENDING`, `IN_PROGRESS`, `COMPLETED` by
seed) — they are not per-workspace.

### Workspaces — `/api/workspaces` (all 🔒)

| Method | Path                              | Access                     | Notes                                                                 |
|--------|-----------------------------------|----------------------------|-----------------------------------------------------------------------|
| POST   | `/`                               | 🔒                         | `{ name }` → creates workspace + OWNER/ADMIN/USER system roles + OWNER membership in one transaction. 201 `{ workspace }`. |
| GET    | `/`                               | 🔒                         | Users: memberships with role `{ id, name, isSystem, permissions: [codes] }` and `isOwner`. Admin: every workspace (`scope: "all"`). |
| POST   | `/invites/redeem`                 | 🔒                         | **registered before /:id**; `{ token }` → joins with the invited role. Requires: pending, unexpired, invite email matches account email (case-insensitive). |
| PATCH  | `/:id`                            | member w/ `workspace.update` or admin | `{ name }`                                                        |
| DELETE | `/:id`                            | workspace OWNER or admin   | soft-delete cascade (tasks soft-deleted, invites dropped, categories hard-deleted) |
| POST   | `/:id/transfer-ownership`         | workspace OWNER or admin   | `{ userId }` (target must be a member); previous owner reverts to ADMIN |
| GET    | `/:id/members`                    | any member of the ws or admin | list with user, role                                                |
| PATCH  | `/:id/members/:userId`            | `member.role.assign`       | `{ roleId }`; owner's role fixed; OWNER role grantable only via transfer |
| DELETE | `/:id/members/:userId`            | `member.remove`            | owner cannot be removed; users can also remove themselves via this route |
| GET    | `/:id/roles`                      | any member                 | roles with `rolePermissions[]` + membership counts                  |
| POST   | `/:id/roles`                      | `role.create`              | `{ name }`, unique per workspace                                     |
| PATCH  | `/:id/roles/:roleId`              | `role.update`              | rename; system roles immutable                                       |
| PUT    | `/:id/roles/:roleId/permissions`  | `role.update`              | `{ permissionCodes: [..] }` — full replacement, unknown codes → 400 |
| DELETE | `/:id/roles/:roleId`              | `role.delete`              | blocked while members exist or invites are pending (409)             |
| POST   | `/:id/invites`                    | `member.invite`            | `{ email, roleId }` → 201 with the one-time `token` (7-day TTL); OWNER role invites rejected; duplicate pending invite 409; the raw token is returned **once**, sharing is manual (no email) |
| GET    | `/:id/invites`                    | `member.invite`            | pending invites with role                                            |
| DELETE | `/:id/invites/:inviteId`          | `member.invite`            | cancel a pending invite                                              |

Param-route validators require UUID shapes for `:id` (`isUUID`).

### Permission catalog — `/api/permissions`

| Method | Path | Access | Notes                                     |
|--------|------|--------|-------------------------------------------|
| GET    | `/`  | 🔒     | the full catalog, ordered by code — what the UI offers when composing custom roles |

### Admin management — `/api/admin` (👑 all)

| Method | Path                    | Notes                                                     |
|--------|-------------------------|-----------------------------------------------------------|
| GET    | `/users`                | list all users (incl. soft-deleted flags)                 |
| GET    | `/admins`               | list all admins                                           |
| GET    | `/overview`             | counts + `tasksByStatus` groupBy (live tasks)             |
| POST   | `/statuses`             | `{ code, label }`; duplicates 400                          |
| PUT    | `/statuses/:id`         | update a catalog status                                    |
| DELETE | `/statuses/:id`         | delete a catalog status                                    |

### Typical flows

```
User registration:
  POST /api/auth/register → check email for code → POST /api/auth/verify-email
  → POST /api/auth/login → { token }
  → GET /api/workspaces              (default workspace, OWNER role)
  → POST /api/tasks  (X-Workspace-Id: <id>)

Inviting a member (as OWNER):
  POST /api/workspaces/:id/invites   → token returned in the response body
  → share the token → invitee: POST /api/workspaces/invites/redeem { token }
     (or registers with { inviteToken } to redeem automatically)
```

---

## Data model

Prisma 7 + MariaDB. All models live in `prisma/schema.prisma`; ids are
`@default(uuid(7))`; timestamps are `createdAt` (with `@default(now())`)
plus `deletedAt` on soft-deletable rows. `@map`s snake_case the columns.

### Soft deletes & composite uniques

`users`, `admins`, `statuses` and `categories` are soft-deleted. Because a
plain unique would resurrect a collision with a deleted row, uniqueness
became **composite with `deletedAt`**:

- `(email, deletedAt)` on users and admins
- `(code, deletedAt)` on statuses
- `(workspaceId, name, deletedAt)` on categories

**Consequence:** email/code lookups for live rows must use
`findFirst({ where: { email, deletedAt: null } })` — a plain
`findUnique({ where: { email } })` no longer compiles against the compound
key. Composite inputs for upserts use
`{ email_deletedAt: { email, deletedAt: null } }`.

### Tables

| Table                  | Purpose                                                              |
|------------------------|----------------------------------------------------------------------|
| `users`                | user principals; soft-deletable                                      |
| `admins`               | platform-admin principals; soft-deletable                            |
| `verification_tokens`  | 6-digit codes per user (10-min expiry, latest wins)                  |
| `admin_verification_tokens` | same for admins                                                 |
| `statuses`             | global catalog; composite `(code, deletedAt)`                        |
| `workspaces`           | the tenancy root; `ownerUserId` → users (ON DELETE RESTRICT)         |
| `permissions`          | global catalog, unique `code`                                        |
| `roles`                | per workspace, `(workspaceId, name)` unique, `isSystem` flag         |
| `role_permissions`     | join roles ↔ permissions, `(roleId, permissionId)` unique            |
| `memberships`          | `(userId, workspaceId)` unique — **exactly one role per member**     |
| `workspace_invites`    | email, role, one-time `token` (unique), 7-day TTL, acceptedAt        |
| `tasks`                | `workspaceId` **required**, `statusId` FK (RESTRICT), `parentTaskId` self-FK (one nesting level), `createdById/type` (USER or ADMIN), `endFlag`, soft delete |
| `task_assignments`     | `(taskId, assignableType, assignableId)` rows                        |
| `category_task_pivot`  | join tasks ↔ categories, both cascade                                |
| `categories`           | `workspaceId` **required**, composite unique `(workspaceId, name, deletedAt)` — two workspaces may share a name |
| `_prisma_migrations`   | migration bookkeeping                                                |

FK policy summary: workspace children cascade (roles, memberships, invites,
categories, pivots); tasks and workspace-owner references are **RESTRICT** so
history cannot be silently destroyed by deleting a user or workspace.
Membership.role is RESTRICT (roles are reassigned/deleted deliberately).

### Migrations

Applied in order (all required for a fresh environment):

1. `20261002135342_init_task_system_db` — base tables.
2. `20261013000000_add_soft_delete` — `deleted_at` columns + composite
   uniques. (File reconstructed from a lost original; see gotchas.)
3. `20261031000000_add_workspaces_rbac` — workspace/RBAC tables + nullable
   `workspace_id` on tasks/categories + category unique swap.
4. `20261031000001_workspace_scoping_required` — flips `workspace_id` to
   `NOT NULL`. **Run the backfill script first** (below) or it fails on
   legacy data.

Schema changes follow this workflow:

```
npx prisma migrate dev --name <x>      # interactive; auto-generates the client
# non-interactive alternative:
npx prisma migrate dev --name <x> --create-only   # needs a TTY; see gotchas
npx prisma migrate deploy              # applies pending migrations
npx prisma generate                    # regenerate the client after schema edits
# restart nodemon afterwards — the in-memory client does NOT hot-reload
```

---

## Authentication lifecycle

```
register → 6-digit code (VerificationToken, expires in 10 minutes — both the
           HTML and text email state this) → verify-email → login (JWT)
```

- Register checks the email first (`findFirst` on live rows) → 400 duplicates.
- Resend code deletes all previous tokens first, so only the newest works.
- Login is gated on `emailVerifiedAt` and compares with bcrypt.
- JWT secret: `JWT_SECRET` (required). `JWT_EXPIRES_IN` optional (default
  `7d`).
- Workspace creation for the user happens inside the same multi-step flow as
  the user row — a registered user is never workspace-less.

---

## Error handling

`middleware/errorHandler.js` maps:

| Input                                   | Response |
|-----------------------------------------|----------|
| Prisma `P2002` (unique violation)       | 409      |
| Prisma `P2025` (record not found)       | 404      |
| Prisma `P2003` (FK constraint)          | 400      |
| `JsonWebTokenError` / `TokenExpiredError` | 401    |

`verifyToken` itself: missing header → 401, bad/expired token → 403.
Stack traces are included only when `NODE_ENV === "development"`.
Workspace/permission middlewares add 400 (missing header), 404 (unknown
workspace, cross-workspace reads are masked as missing), 403 (not a member,
missing permission) with explicit messages.

---

## Rate limits

`express-rate-limit`:

- Global: 500 requests / 15 minutes / IP.
- `/api/auth` and `/api/admin/auth`: 20 requests / 15 minutes / IP.

---

## Getting started

```bash
# 1. install (postinstall runs `prisma skills sync || exit 0` — safe to ignore)
npm install

# 2. configure
cp .env.example .env        # then fill in DATABASE_URL + SMTP + JWT_SECRET

# 3. database
npx prisma migrate deploy   # apply all migrations
npm run seed                # upserts admin accounts
node prisma/seeds/statusSeed.js   # seeds PENDING/IN_PROGRESS/COMPLETED
npm run seed:permissions    # seeds the permission catalog

# 4. run
npm run dev                 # nodemon, http://localhost:<PORT>

# 5. check
curl http://localhost:5000/health
```

Required `.env` keys: `PORT`, `JWT_SECRET`, `NODE_ENV`, `CLIENT_URL`,
`DATABASE_URL`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`,
`EMAIL_FROM`.

Fresh installation in one path (new database, empty):

```
npx prisma migrate deploy   # 4 migrations create everything
npm run seed && node prisma/seeds/statusSeed.js && npm run seed:permissions
```

### Legacy data migration (pre-workspace installs)

If the database predates workspaces and after
`20261031000000_add_workspaces_rbac` your `tasks`/`categories` rows still
have `workspace_id = NULL`, run:

```bash
npm run backfill:workspaces   # see Seeds section for what it does
npx prisma migrate deploy     # then apply the NOT NULL migration
```

---

## npm scripts

| Script                 | What it does                                              |
|------------------------|-----------------------------------------------------------|
| `npm run dev`          | nodemon `server.js`                                        |
| `npm start`            | node `server.js`                                           |
| `npm test`             | Jest — Prisma/bcrypt/JWT/email are mocked; no DB/SMTP needed |
| `npm run lint`         | ESLint flat config. Exits 1 on 2 pre-existing errors inside the bundled `.opencode` plugin code; backend source is clean (see gotchas) |
| `npm run seed`         | upserts admin accounts (`prisma/seeds/seed.js → adminSeed.js`) |
| `npm run seed:permissions` | idempotent permission-catalog upsert                   |
| `npm run backfill:workspaces` | one-time legacy data migration (see below)          |
| `postinstall`          | `prisma skills sync \|\| exit 0` — never auto-generates the client |

---

## Seeds, permissions & data migration

All seeds live in `prisma/seeds/` and use the real `prismaClient.js`, so they
need a valid `DATABASE_URL`.

| File                       | Purpose                                                              |
|----------------------------|----------------------------------------------------------------------|
| `seed.js`                  | wires `adminSeed.js` — upserts admin accounts against the `(email, deletedAt)` composite |
| `adminSeed.js`             | the admin rows themselves                                            |
| `statusSeed.js`            | upserts `PENDING` / `IN_PROGRESS` / `COMPLETED` (`code_deletedAt` composite input). **Not wired to npm** — run `node prisma/seeds/statusSeed.js`; the frontend needs `/api/statuses` |
| `permissionSeed.js`        | idempotent `permission.upsert` over the whole catalog (`npm run seed:permissions`) |
| `backfillWorkspaces.js`    | one-time legacy migration (idempotent)                               |

### What backfillWorkspaces.js does

1. Seeds the permission catalog.
2. Creates a default workspace per user (`"<name>'s Workspace"`) with the
   three system roles and the OWNER membership — reusing an existing default
   workspace when one is already present.
3. Moves every legacy task/category into a workspace:
   user-created tasks → creator's workspace; admin-created → the first
   assigned user's workspace, else the oldest user's workspace; subtasks →
   inherit the parent's workspace; categories → workspace of the first task
   that references them. **Soft-deleted rows are included** — every row must
   get a workspace before the NOT NULL migration.
4. Ends with `Backfill done. Rows still without a workspace: 0 (should be 0).`

---

## Testing

```
npx jest                 # 20 suites / 325 tests, all green
npm test                 # same via npm
```

- Unit suites mock `../prismaClient` per model; integration
  (`__tests__/routes.test.js`) requires the real `server.js` app and issues
  HTTP requests through `fetch` on an ephemeral port.
- `__tests__/routes.test.js` declares an **inline `jest.mock("../prismaClient",
  …)` enumerating every model/method any covered route handler touches** —
  extend it whenever a route starts calling a new Prisma method or the
  integration suite fails at import.
- ⚠️ `jest.clearAllMocks()` does **not** reset `mockResolvedValue`
  implementations. Every test sets the responses it needs explicitly (the
  workspace middleware suites show this pattern).
- The `console.error … smtp down` noise in `npm test` output comes from a
  deliberate negative case in `emailService.test.js`; the suite still passes.
- Workspace-focused suites: `workspaceMiddleware.test.js`,
  `permissions.test.js`, `workspaceRepository.test.js`,
  `workspaceController.test.js` (plus workspace coverage inside
  `routes.test.js` and `authorization.test.js`).

---

## Project layout

```
server.js                       # entry: middleware chain + route mounting
prismaClient.js                 # PrismaClient singleton (MariaDB adapter)
prisma/
  schema.prisma                 # all models
  config? → prisma.config.ts    # feeds DATABASE_URL to the CLI (NO `url` in the datasource)
  migrations/<ts>_<name>/migration.sql
  seeds/                        # adminSeed, statusSeed, permissionSeed, backfillWorkspaces
public/index.html               # landing page for GET /
routes/Authentication|Task|Category|Status|Admin|Workspace/
controllers/<Domain>/           # same domain casing
repository/<Domain>/            # Prisma access; Workspace/permissionsCatalog.js
middleware/
  auth.js adminAuth.js          # verifyToken, verifyAdmin
  workspace.js                  # resolveWorkspace(Optional|Param)
  permissions.js                # requirePermission, requireWorkspaceOwner
  authorization.js              # loadWorkspaceTask, guards
  errorHandler.js               # P2002/P2025/P2003/JWT mapping
  validators/                   # express-validator rule arrays per domain
__tests__/                      # 20 Jest suites
.opencode/                      # imported agent-plugin bundle; NOT project conventions
```

---

## Gotchas & operational notes

- `require("dotenv").config()` is the first line of `server.js` — keep it.
- Controller/require paths use the exact directory casing (`Authentication`,
  `Admin`, `Task`, `Category`, `Status`, `Workspace`).
- `JWT_SECRET` is required; `JWT_EXPIRES_IN` optional (default `7d`).
- After **any** `prisma generate` you must restart the dev server: nodemon
  only watches source files and cannot reload the in-memory Prisma client.
  A stale client throws errors like
  `UserWhereUniqueInput … needs at least one of \`id\` or \`email_deletedAt\``
  while the schema file looks fine (tests stay green because they mock it).
- Prisma 7: the schema has **no `url` in the datasource block**. Do not add
  one — `prisma.config.ts` (importing `dotenv/config`) hands `DATABASE_URL`
  to the CLI. Also, `postinstall` runs `prisma skills sync`, **never**
  `prisma generate`. `migrate dev` auto-generates.
- Non-interactive shells cannot run `prisma migrate dev` (it requires a TTY).
  Use hand-written `migration.sql` + `npx prisma migrate deploy` — that is
  how the workspace/RBAC migrations were applied.
- The lost-migration story: `20261013000000_add_soft_delete/migration.sql`
  was once missing (its directory was empty) while the changes were already
  applied. It was reconstructed from the live schema (`SHOW COLUMNS/INDEX`)
  — if this ever drifts again, watch for Prisma error `P3015`/`P3006` on
  migrate and recheck migration checksums.
- Live-row email/code lookups are `findFirst({ where: { …, deletedAt: null } })`;
  upserts use the `email_deletedAt` / `code_deletedAt` composite inputs.
- `npm run lint` fails on 2 pre-existing errors in
  `.opencode/skills/ck/commands/shared.mjs` (bundled plugin code). Backend-only
  check: `npx eslint . --ignore-pattern ".opencode/**"` — green.
- The repo root is the **parent directory** (`TaskManagmentSystem/`); all
  tracked code lives in `TaskManagmentBackend/` and
  `TaskManagmentFrontend/`.
- One role per membership: `setMemberRole` accepts any role except making a
  second OWNER; the owner's membership is retired only through
  `transfer-ownership`.
- Platform admins in sudo mode may *read* without `X-Workspace-Id`, and task
  writes by admin still require the header — there is no implicit workspace
  for them.
