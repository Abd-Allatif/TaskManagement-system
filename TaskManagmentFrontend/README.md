# Task Operations Console

Frontend for the Task Management backend (Express + Prisma). Vite + React 19,
styled with a hand-built design system ("Blueprint Console") — no UI library,
no CSS-in-JS, no runtime font downloads.

## Running

```bash
npm install    # offline-friendly: uses the npm cache + the vendored Rollup binding
npm run dev    # http://localhost:3000
```

Requirements:

- The backend must be running on `:5000` (see the parent TaskManagmentBackend
  project). The Vite dev server proxies `/api` to it and binds to `:3000`, which
  is the origin the backend allows via `CLIENT_URL` in CORS.
- Statuses must be seeded in the backend: `npm run seed` there (the console reads
  `/api/statuses` for its lifecycle display and task filters).

### Why `:3000` is hard-coded (strict port)

The backend sets `origin: process.env.CLIENT_URL || "http://localhost:3000"`, so
bumping the port without swapping `CLIENT_URL` yields CORS failures on
development builds. If you need a different port, change both.

## Scripts

| Script       | Purpose                                              |
| ------------ | ---------------------------------------------------- |
| `dev`        | Vite dev server on `:3000` with `/api` proxy          |
| `build`      | Production bundle into `dist/`                       |
| `preview`    | Serve the built bundle on `:3000`                    |
| `postinstall`| Restore the vendored Rollup native binding (see below) |

## Offline/vendored dependency note

This machine has no package-registry access, so install was done from the npm
cache with pinned versions:

- `vite@7.3.6`, `esbuild@0.27.7` (overridden to match the cached platform binary)
- `rollup@4.61.0` (overridden) together with its optional native binding
  `@rollup/rollup-linux-x64-gnu@4.61.0`, vendored into `vendor/rollup/linux-x64/`
  and re-installed by `scripts/install-rollup-native.mjs` after every install.
- `@vitejs/plugin-react` is **not** used: its Babel peer
  (`@babel/plugin-transform-react-jsx*`) was unresolvable offline. React 19 is
  compiled through Vite's own esbuild transform with `jsx: "automatic"`, which
  means there is no HMR/React Refresh — a change triggers a full reload. This is
  a purely cosmetic development-experience difference; the build output is not
  affected. Add the plugin back when the registry is reachable if Fast Refresh
  is wanted.

## Architecture

```
src/
├── main.jsx               # entry: routers + auth provider + styles
├── App.jsx                # route table (public / protected / admin-only)
├── router/router.jsx      # 80-line History-API router (Link, Navigate, matchPath)
├── lib/
│   ├── api.js             # fetch client; one function per backend endpoint
│   ├── auth.jsx           # session context: boot-time /me replay, signIn, signOut
│   ├── session.js         # localStorage session + JWT role decoding (UI hint only)
│   ├── format.js          # dates, relative deadlines, status colours
│   ├── useResource.js     # useResource (loader + abort) and useMutation
│   └── useReference.js    # statuses/categories + admin principal directory
├── components/            # shell, task card/form, ui primitives, toasts
├── pages/
│   ├── auth/              # login, register, verify (member + admin variants)
│   ├── DashboardPage.jsx      … TasksPage.jsx … TaskDetailPage.jsx
│   ├── CategoriesPage.jsx     … StatusesPage.jsx … ProfilePage.jsx
│   └── AdminOverviewPage.jsx  … StatusPages.jsx (404 / 403 / boot)
└── styles/                # tokens → base → ui → app (CSS layers, no preprocessor)
```

### Route table

| Path                | Guard            | Screen                                        |
| ------------------- | ---------------- | --------------------------------------------- |
| `/login` `/register` `/verify` | none     | Member auth                                   |
| `/admin/login` `/admin/register` `/admin/verify` | none | Administrator auth |
| `/`                 | signed in        | Dashboard (admin sees global telemetry)       |
| `/tasks`            | signed in        | Task directory with URL-synced filters        |
| `/tasks/:id`        | signed in        | Task detail + quick status/close + edit       |
| `/categories`       | signed in        | Read for anyone; full CRUD for administrators |
| `/statuses`         | signed in        | Read for anyone; full CRUD for administrators |
| `/profile`          | signed in        | Identity and session                          |
| `/admin/overview`   | administrator    | System counts + directory                     |

## API contract coverage

Every endpoint mounted by the backend is wired:

- `/api/auth/*` — register, verify-email, resend-code, login, logout, me
- `/api/admin/auth/*` — same six for the admin realm
- `/api/tasks` — list (search/status/endFlag/creator/sort/page), detail, create,
  update (status, endFlag, categories, assignments, parent), delete
- `/api/categories` — list, detail, create/update/delete (admin-gated writes)
- `/api/statuses` — list, detail (reads only)
- `/api/admin/users|admins|overview` — directory + dashboard aggregates
- `/api/admin/statuses` — create/update/delete

Field-level validation errors returned by express-validator
(`{ errors: [{ field, message }] }`) are surfaced next to the triggering input.

## Things to keep in mind

- **Rate limits**: the backend allows 100 requests / 15 min globally and only 20
  on `/api/auth*` and `/api/admin/auth*`. Filter changes and searches are
  debounced (380 ms) rather than firing per keystroke, but heavy automated
  testing of an auth form can lock you out for the window.
- **Deadlines must be in the future**: both create and update validate this on
  the server, so clearing an existing deadline is not possible through the API.
- **Task updates replace relations**: sending `categories` or `assignments` swaps
  the full list (the API does not merge), which is why editors always submit the
  complete selection.
- **Assignments**: members may assign only themselves (the member directory is
  admin-only); administrators pick from `/api/admin/users` and `/api/admin/admins`.

## Backend findings this work surfaced

While wiring the console end-to-end, two backend issues became visible
(documented, not patched here):

1. **Auth is broken at runtime by Prisma client/schema drift.** The deployed
   tables still carry `deleted_at` columns with `(email, deleted_at)` unique
   keys, while `prisma/schema.prisma` declares a plain `email @unique` and no
   `deletedAt`. The generated client matches the *database*, so both
   `authRepository.findByEmail` and `adminRepository.findByEmail` fail when they
   call `findUnique({ where: { email } })` — `register`, `login` and
   `resend-code` return 500 for members and administrators alike.
   (`scripts/e2e-contract.cjs` detects this and reports it.) Align the schema
   with the database or `db push` the schema and re-run `prisma generate`.
2. **`GET /api/admin/users` and `/api/admin/admins` return password hashes.**
   The repositories call `findMany()` with no `select`, so `password`,
   `isVerified` and any future columns are shipped to the client. This console
   picks only `id/name/email/createdAt`, but the API should not be bequeathing
   hashes at all — pass an explicit `select`.

## Contract check script

```bash
node scripts/e2e-contract.cjs
```

Walks the member flow through the Vite proxy (`:3000`) exactly as the browser
does: health → register → verify (code read from the DB since SMTP is not
reachable here) → login → `/me` → task create/list/detail/update/delete →
member-forbidden admin route → logout → cleanup. It creates and removes a
throwaway account (`e2e-console@local.test`).
