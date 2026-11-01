# Task Management System

A small monorepo of two applications sharing one API contract:

| Directory                | What it is                                                                 |
|--------------------------|----------------------------------------------------------------------------|
| `TaskManagmentBackend/`  | Express 5 + Prisma 7 (MariaDB) REST API with workspace-based multi-tenancy and RBAC |
| `TaskManagmentFrontend/` | Vite + React 19 console ("Blueprint Console" design system, no UI library)  |

The API contract is documented in full in
[`TaskManagmentBackend/README.md`](./TaskManagmentBackend/README.md); the
frontend mirror lives in
[`TaskManagmentFrontend/README.md`](./TaskManagmentFrontend/README.md).

## What the system does

- **Users & administrators**: two principal realms with the same lifecycle —
  register, 6-digit email verification code (10-minute expiry), verify, login
  (JWT). Administrators are a platform-side superuser realm independent of any
  workspace.
- **Workspaces**: every user gets a default workspace at registration
  (`"<name>'s Workspace"`, them as OWNER). All tasks and categories belong to
  exactly one workspace — there is no cross-workspace sharing.
- **Roles & permissions (RBAC)**: three immutable system roles per workspace
  (`OWNER`, `ADMIN`, `USER`) plus custom roles composed from an 18-code
  permission catalog. One role per user per workspace; ownership is
  transferable; membership is by invite token (shared manually, 7-day expiry).
- **Tasks**: create/update/soft-delete with status, future deadline, one level
  of subtasks, category pivots, and USER/ADMIN assignments (assignees must be
  workspace members).
- **Categories & statuses**: per-workspace categories; global status catalog
  (`PENDING`, `IN_PROGRESS`, `COMPLETED`) managed by platform admins.
- **Platform admin console**: system-wide overview, directories, status
  catalog management. Admin tokens sweep across all workspaces for reads
  without a workspace header.

## Quickstart

Prerequisites: Node ≥ 20, a MariaDB/MySQL server.

```bash
# 1. Backend
cd TaskManagmentBackend
npm install
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, SMTP creds
npx prisma migrate deploy   # applies all 4 migrations
npm run seed                # admin accounts
node prisma/seeds/statusSeed.js   # status catalog (not wired to npm)
npm run seed:permissions    # permission catalog
npm run dev                 # http://localhost:5000  (PORT from .env)

# 2. Frontend (in a second terminal)
cd ../TaskManagmentFrontend
npm install
npm run dev                 # http://localhost:3000, proxies /api → :5000
```

Then open http://localhost:3000 — register a user (their default workspace is
created automatically) and you are an OWNER with full permissions.

Verify the whole contract: with both servers running:

```bash
cd TaskManagmentFrontend && node scripts/e2e-contract.cjs
```

### Pre-existing data (pre-workspace installs)

If the database predates the workspace release, tasks/categories may still be
unscooped. Run the one-time backfill in the backend before applying the last
migration:

```bash
npm run backfill:workspaces   # creates default workspaces + moves legacy rows
npx prisma migrate deploy     # then the NOT NULL migration applies cleanly
```

## Ports & configuration

| Side     | Setting        | Default / file                                   |
|----------|----------------|--------------------------------------------------|
| Backend  | `PORT`         | `.env` → 5000 (app-level default is 3000)        |
| Backend  | `CLIENT_URL`   | CORS origin; must match the frontend origin — `http://localhost:3000` |
| Backend  | `DATABASE_URL` | MariaDB DSN in `.env` (handed to the CLI via `prisma.config.ts`) |
| Backend  | `JWT_SECRET`   | required; `JWT_EXPIRES_IN` optional (default 7d) |
| Frontend | dev port       | strict `:3000` (must equal `CLIENT_URL`)         |
| Frontend | proxy          | `/api` → `http://localhost:5000` (override with `VITE_PROXY_TARGET`) |

## Documentation map

- [`TaskManagmentBackend/README.md`](./TaskManagmentBackend/README.md) —
  architecture, authorization model (RBAC + permission catalog), full API
  reference, data model & migrations, testing, operational gotchas.
- [`TaskManagmentFrontend/README.md`](./TaskManagmentFrontend/README.md) —
  workspace data flow, permission-gated UI, Members & Roles screens, build
  notes, contract-check script.
- `node AGENTS.md` files in each project capture working conventions for
  agents: run the **backend one** for backend work; the workspace root has no
  AGENTS.md.

## Tests & validation

| Where               | Command                        | Expectation                          |
|---------------------|--------------------------------|--------------------------------------|
| Backend             | `npm test`                     | 20 Jest suites / 325 tests (DB+SMTP mocked) |
| Backend             | `npx eslint . --ignore-pattern ".opencode/**"` | clean                |
| Frontend            | `npm run build`                | green (no ESLint config in the frontend) |
| Full stack          | backend + vite running, then `node scripts/e2e-contract.cjs` (in the frontend) | ALL E2E CHECKS PASSED |

## Rate limits (both)

Global 500 requests / 15 min per IP; `/api/auth*` and `/api/admin/auth*` only
20 / 15 min.
