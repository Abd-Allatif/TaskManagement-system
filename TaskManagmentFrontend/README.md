# Task Operations Console

Frontend for the Task Management backend (Express + Prisma). Vite + React 19,
styled with a hand-built design system ("Blueprint Console") — no UI library,
no CSS-in-JS, no runtime font downloads.

The console is fully **workspace-aware**: every screen operates inside exactly
one workspace, and every request scoped to that workspace carries an
`X-Workspace-Id` header that the backend validates.

## Running

```bash
npm install            # offline-friendly: uses the npm cache + the vendored Rollup binding
npm run dev            # http://localhost:3000
```

Requirements:

- The backend must be running on `:5000` (see the parent TaskManagmentBackend
  project). The Vite dev server proxies `/api` to it and binds to `:3000`, which
  is the origin the backend allows via `CLIENT_URL` in CORS.
- The backend must have seeds applied: `npm run seed`, then
  `node prisma/seeds/statusSeed.js` (statuses are needed for the lifecycle
  display and task filters), then `npm run seed:permissions` (the permission
  catalog needed by the Roles page and role pickers).

### Why `:3000` is hard-coded (strict port)

The backend sets `origin: process.env.CLIENT_URL || "http://localhost:3000"`, so
bumping the port without swapping `CLIENT_URL` yields CORS failures on
development builds. If you need a different port, change both — or set
`VITE_PROXY_TARGET` if only the backend port moved (`vite.config.js`).

## Scripts

| Script        | Purpose                                               |
| ------------- | ----------------------------------------------------- |
| `dev`         | Vite dev server on `:3000` with `/api` proxy           |
| `build`       | Production bundle into `dist/`                        |
| `preview`     | Serve the built bundle on `:3000`                     |
| `postinstall` | Restore the vendored Rollup native binding (see below) |

## Offline/vendored dependency note

This machine has no package-registry access, so install was done from the npm
cache with pinned versions:

- `vite@7.3.x`, `esbuild@0.27.7` (overridden to match the cached platform binary)
- `rollup@4.61.0` (overridden) together with its optional native binding
  `@rollup/rollup-linux-x64-gnu@4.61.0`, vendored into `vendor/rollup/linux-x64/`
  and re-installed by `scripts/install-rollup-native.mjs` after every install.
- `@vitejs/plugin-react` is **not** used: its Babel peer
  (`@babel/plugin-transform-react-jsx*`) was unresolvable offline. React 19 is
  compiled through Vite's own esbuild transform with `jsx: "automatic"`, which
  means there is no Fast Refresh — a change triggers a full reload. This is a
  purely cosmetic development-experience difference; the build output is not
  affected. There is also **no ESLint config here** — the build is the
  validation gate.

## Workspace model (what the console does and why)

### Data flow

```
main.jsx
  └─ AuthProvider          (token + principal, /me replay)
      └─ WorkspaceProvider (workspace list, active workspace, permissions)
          └─ App routes    (WorkspaceBoot gate around protected screens)
```

- `lib/workspaceStore.js` keeps the chosen workspace id in
  `localStorage` under `tms.workspace.v1`, so a reload or a re-login restores
  the same workspace context.
- `lib/workspace.jsx` (WorkspaceProvider) fetches `GET /api/workspaces` at
  boot, exposes `{ workspaces, active, workspaceId, setActiveWorkspace,
  hasPermission }`, and treats platform admins specially: they may run in
  "sudo" mode without an active workspace.
- `lib/api.js` threads an optional `workspaceId` argument through every
  workspace-scoped endpoint function and converts it into the
  `X-Workspace-Id` request header.

### Rules

- Because there is **exactly one role per user per workspace**, switching the
  workspace in the topbar select changes everything: nav content, UI gating,
  task lists, categories, member management.
- The switcher empowers **permission gating**: role permissions (a `codes`
  array per role, delivered with the workspaces list) drive `hasPermission`,
  which hides controls it cannot exercise. The backend re-checks everything;
  the UI gating is friendliness, not security.
- Routing to a protected screen before the workspace context resolved is
  handled by the `WorkspaceBoot` guard (App.jsx): it holds on
  `BootScreen` until the provider finished, including for admins (who may
  proceed without a workspace).

### Route table

| Path               | Guard            | Screen                                              |
| ------------------ | ---------------- | --------------------------------------------------- |
| `/login` `/register` `/verify` | none | Member auth (register accepts an `inviteToken`)      |
| `/admin/login` `/admin/register` `/admin/verify` | none | Administrator auth |
| `/`                | signed in        | Dashboard (admin sees global telemetry)             |
| `/tasks`           | signed in        | Task directory with URL-synced filters              |
| `/tasks/:id`       | signed in        | Task detail + quick status/close + edit             |
| `/categories`      | signed in        | Read for anyone; writes gated by `category.*` perms |
| `/statuses`        | signed in        | Read-only catalog (managed by platform admins)      |
| `/workspace/members` | signed in      | Member console (see below)                          |
| `/workspace/roles` | signed in        | Role studio (see below)                             |
| `/profile`         | signed in        | Identity and session                                |
| `/admin/overview`  | administrator    | System counts + directory                           |

### MembersPage (`/workspace/members`)

- Role change per member (`member.role.assign`) via inline select.
- Invite a member by email (`member.invite`): tokens are returned **once** in
  a panel above the table and are shared manually — the backend never emails
  them. Invitees redeem on the Profile page or at registration.
- Pending invite table with cancel (7-day expiry, enforced server-side).
- Remove member (`member.remove`) with confirm dialog.
- **Make owner** (`workspace.transfer`): shown only when the current principal
  is the workspace owner (`active.isOwner`). The backend demotes the previous
  owner to ADMIN and the OWNER role can never be granted through the role
  picker — ownership moves only by transfer.

### RolesPage (`/workspace/roles`)

- Lists all workspace roles: system roles (`OWNER`/`ADMIN`/`USER`) marked
  immutable reference, custom roles listed with their permission codes and
  member counts.
- Edit expanded into a permission editor (`ChipMultiSelect` over the catalog)
  for custom roles, gated on `role.update`; permission save is a **full
  replacement** (`PUT …/permissions`), mirroring the API.
- Role deletion only offered when the role has zero members (the backend
  refuses otherwise with 409); gated on `role.delete`.
- Creating a custom role (`role.create`) starts it with no permissions —
  edit them right after creation.

## Architecture

```
src/
├── main.jsx               # entry: router → AuthProvider → WorkspaceProvider
├── App.jsx                # route table (public / protected / admin-only) + WorkspaceBoot
├── router/router.jsx      # History-API router (Link, Navigate, matchPath)
├── lib/
│   ├── api.js             # fetch client; one function per endpoint, workspaceId → header
│   ├── auth.jsx           # session context: boot-time /me replay, signIn, signOut
│   ├── session.js         # localStorage session + JWT role decoding (UI hint only)
│   ├── workspace.jsx      # WorkspaceProvider: workspaces, active, hasPermission
│   ├── workspaceStore.js  # localStorage persistence for the active workspace id
│   ├── useReference.js    # statuses/categories + usePrincipals (members + admins)
│   ├── format.js          # dates, relative deadlines, status colours
│   └── useResource.js     # useResource (loader + abort) and useMutation
├── components/            # shell (with workspace switcher), task card/form, ui primitives, toasts
├── pages/
│   ├── auth/              # login, register, verify (member + admin variants)
│   ├── DashboardPage.jsx  TasksPage.jsx  TaskDetailPage.jsx
│   ├── CategoriesPage.jsx StatusesPage.jsx ProfilePage.jsx
│   ├── MembersPage.jsx    RolesPage.jsx            # workspace administration
│   └── AdminOverviewPage.jsx  StatusPages.jsx     # 404 / 403 / boot
└── styles/                # tokens → base → ui → app (CSS layers, no preprocessor)
```

### Assignable principals

`usePrincipals` (lib/useReference.js) feeds task forms:

- USER assignees come from the **active workspace's member list**
  (`GET /workspaces/:id/members`) — the server rejects any assignee who is not
  a workspace member, so the form cannot offer them anyway.
- ADMIN assignees come from `/api/admin/admins` and are only listed to
  admin-typed principals.

## API contract coverage

Every endpoint mounted by the backend is wired:

- `/api/auth/*` — register (with optional `inviteToken` redemption), verify-email, resend-code, login, logout, me
- `/api/admin/auth/*` — same six for the admin realm
- `/api/workspaces` — list (with role permissions), create, update, delete,
  transfer-ownership
- `/api/workspaces/:id/members` — list, change role, remove
- `/api/workspaces/:id/roles` — list, create, rename, delete,
  replace permissions
- `/api/workspaces/:id/invites` — create (token shown once), list, cancel;
  redemption via `POST /api/workspaces/invites/redeem` (Profile page)
- `/api/permissions` — full catalog (role editor)
- `/api/tasks` — list (search/status/endFlag/creator/sort/page), detail, create,
  update (status, endFlag, categories, assignments, parent), delete
- `/api/categories` — list, detail, create/update/delete
  (gated by `category.*` permissions rather than admin status)
- `/api/statuses` — list, detail (reads only)
- `/api/admin/users|admins|overview` — directory + dashboard aggregates
- `/api/admin/statuses` — create/update/delete

Field-level validation errors returned by express-validator
(`{ errors: [{ field, message }] }`) are surfaced next to the triggering input.

## Things to keep in mind

- **Rate limits**: the backend allows 500 requests / 15 min globally and only
  20 on `/api/auth*` and `/api/admin/auth*`. Filter changes and searches are
  debounced (380 ms) rather than firing per keystroke, but heavy automated
  testing of an auth form can lock you out for the window.
- **Deadlines must be in the future** on create; updates send the field only
  when changed.
- **Task updates replace relations**: sending `categories` or `assignments`
  swaps the full list (the API does not merge), which is why editors always
  submit the complete selection.
- **Assignments**: USER assignees must be members of the active workspace;
  a USER id pointing at an admin row is rejected.
- **Admins in sudo mode** browse without a workspace header on reads but
  still must select one for writes (task/category creation needs
  `X-Workspace-Id`).
- Categories page: mutability is driven by `category.update` / `category.delete`
  and creation by `category.create`, supplanting the old admin-only behavior.

## Contract check script

```bash
# backend on :5000 and `npx vite` on :3000 must be running
node scripts/e2e-contract.cjs
```

Walks the member flow through the Vite proxy (`:3000`) exactly as the browser
does: health → register (returns the default workspace) → verify (code read
from the DB since SMTP is not reachable here) → login → `/me` → workspace list
(OWNER role with permission codes) → task list/categories CRUD with
`X-Workspace-Id` → tasks CRUD incl. workspace scoping assertions →
`/workspaces/:id/members` → member-forbidden admin route → logout → cleanup.
It creates and removes a throwaway account (`e2e-console@local.test`) and is
idempotent — safe to re-run.

The script installs nothing: its runtime dependencies (dotenv, prisma) are
resolved with absolute paths from the backend's `node_modules`, so it can be
run from the frontend directory as-is.
