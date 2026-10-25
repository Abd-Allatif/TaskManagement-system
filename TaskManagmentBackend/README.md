# Task Management System — Backend

An Express 5 + Prisma (MariaDB) REST API for managing tasks between employees and
admins. Users and admins each have their own email-verification auth flow, and
authenticated principals can create, read, update and soft-delete tasks, with
category and assignment relations.

## Stack

| Concern      | Choice                                            |
| ------------ | ------------------------------------------------- |
| Runtime      | Node.js, CommonJS                                 |
| Framework    | Express 5                                         |
| Database     | MariaDB via Prisma 7 + `@prisma/adapter-mariadb`  |
| Auth         | JWT (`jsonwebtoken`) + bcrypt password hashing    |
| Email        | nodemailer (6-digit verification codes)           |
| Validation   | express-validator                                 |
| Security     | helmet, cors, express-rate-limit                  |
| Tests        | Jest (unit + supertest-free HTTP integration)     |

## Getting started

```bash
cp .env.example .env      # fill in DATABASE_URL and SMTP credentials
npm install
npx prisma migrate deploy # apply migrations
npm run seed              # seed PENDING / IN_PROGRESS / COMPLETED statuses
npm run dev               # nodemon server.js (default PORT=5000)
```

Required env keys: `PORT`, `JWT_SECRET`, `NODE_ENV`, `CLIENT_URL`, `DATABASE_URL`,
`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`.

## Scripts

| Command          | Description                                        |
| ---------------- | -------------------------------------------------- |
| `npm run dev`    | Start with nodemon (hot reload)                    |
| `npm start`      | Start with `node server.js`                        |
| `npm run lint`   | ESLint (flat config)                               |
| `npm test`       | Jest — 16 suites, all mocked (no DB/SMTP needed)   |
| `npm run seed`   | Upsert the default task statuses                   |

## Architecture

```
server.js                     app bootstrap, middleware, route mounting
routes/<Domain>/              Express routers
controllers/<Domain>/         request handlers (thin, call repositories)
repository/<Domain>/          Prisma data access
middleware/                   auth, adminAuth, authorization, errorHandler
middleware/validators/        express-validator chains + `validate`
services/emailService.js      nodemailer verification emails
prisma/schema.prisma          data model
prisma/seeds/                 status seed
__tests__/                    Jest unit + integration tests
```

**Request flow:** router → `verifyToken` (JWT → `req.user`) → validators →
controller → repository → Prisma. Errors are thrown/forwarded to
`middleware/errorHandler.js`, which maps Prisma and JWT errors to HTTP codes.

`middleware/auth.js` normalizes the JWT payload so `req.user.id` and
`req.user.type` are always present (`"USER"` or `"ADMIN"`), regardless of which
token shape was issued. `middleware/adminAuth.js` composes it and additionally
requires `type === "ADMIN"`.

## Authorization model

| Resource  | Read            | Write                            |
| --------- | --------------- | -------------------------------- |
| Tasks     | any auth user   | owner **or** admin               |
| Categories| any auth user   | admin only                       |
| Statuses  | any auth user   | admin only (via `/api/admin`)    |
| Users/Admins | admin only   | admin only                       |

Task ownership is determined by `createdById`. Soft-deleted tasks
(`deletedAt != null`) are hidden from reads and treated as missing.

## API reference

All bodies are JSON. Authenticated routes expect
`Authorization: Bearer <token>`. Successful auth responses return a JWT.

### Health

| Method | Path      | Auth | Description                          |
| ------ | --------- | ---- | ------------------------------------ |
| GET    | `/`       | —    | Serves `public/index.html`           |
| GET    | `/health` | —    | `{ status, uptime, timestamp }`      |

### User auth — `/api/auth` (rate limited: 20 req / 15 min)

| Method | Path                     | Body                                  | Description                       |
| ------ | ------------------------ | ------------------------------------- | --------------------------------- |
| POST   | `/api/auth/register`     | `{ name, email, password }`           | Create account + send code        |
| POST   | `/api/auth/verify-email` | `{ email, code }`                     | Verify email with 6-digit code    |
| POST   | `/api/auth/resend-code`  | `{ email }`                           | Issue a fresh verification code   |
| POST   | `/api/auth/login`        | `{ email, password }`                 | Login (requires verified email)   |
| POST   | `/api/auth/logout`       | —                                     | Stateless logout (client clears)  |
| GET    | `/api/auth/me`           | —                                     | Current profile                   |

Verification codes are 6 digits and expire after **10 minutes**.

### Tasks — `/api/tasks` (auth)

| Method | Path              | Auth            | Description                              |
| ------ | ----------------- | --------------- | ---------------------------------------- |
| POST   | `/api/tasks`      | any             | Create task (relations optional)         |
| GET    | `/api/tasks`      | any             | List/search/filter (paginated)           |
| GET    | `/api/tasks/:id`  | any             | Fetch one                                |
| PUT    | `/api/tasks/:id`  | owner or admin  | Update fields and/or relations           |
| DELETE | `/api/tasks/:id`  | owner or admin  | Soft delete                              |

Create / update body:

```json
{
  "title": "Deploy v2",
  "description": "optional",
  "deadline": "2026-12-31T00:00:00.000Z",
  "statusId": "<uuid>",
  "parentTaskId": "<uuid|null>",
  "categories": ["<category-uuid>"],
  "assignments": [{ "assignableType": "USER", "assignableId": "<user-uuid>" }]
}
```

List query params: `statusId`, `createdById`, `createdByType`, `endFlag`,
`search` (title/description), `page`, `limit` (max 100), `sortBy`, `sortOrder`
(`asc`|`desc`). List responses are `{ tasks, pagination }`.

### Categories — `/api/categories` (auth; writes admin-only)

| Method | Path                    | Auth  | Description        |
| ------ | ----------------------- | ----- | ------------------ |
| POST   | `/api/categories`       | admin | Create category    |
| GET    | `/api/categories`       | any   | List categories    |
| GET    | `/api/categories/:id`   | any   | Fetch one          |
| PUT    | `/api/categories/:id`   | admin | Update category    |
| DELETE | `/api/categories/:id`   | admin | Hard delete        |

Body: `{ name, color? }`.

### Statuses — `/api/statuses` (auth)

| Method | Path                  | Auth | Description       |
| ------ | --------------------- | ---- | ----------------- |
| GET    | `/api/statuses`       | any  | List statuses     |
| GET    | `/api/statuses/:id`   | any  | Fetch one         |

### Admin auth — `/api/admin/auth` (rate limited: 20 req / 15 min)

| Method | Path                          | Description                     |
| ------ | ----------------------------- | ------------------------------- |
| POST   | `/api/admin/auth/register`    | Create admin + send code        |
| POST   | `/api/admin/auth/verify-email`| Verify admin email              |
| POST   | `/api/admin/auth/resend-code` | Issue a fresh verification code |
| POST   | `/api/admin/auth/login`       | Login (requires verified email) |
| POST   | `/api/admin/auth/logout`      | Stateless logout                |
| GET    | `/api/admin/auth/me`          | Current admin profile           |

### Admin management — `/api/admin` (admin only)

| Method | Path                        | Description                          |
| ------ | --------------------------- | ------------------------------------ |
| GET    | `/api/admin/users`          | List users                           |
| GET    | `/api/admin/admins`         | List admins                          |
| GET    | `/api/admin/overview`       | Counts: users, admins, tasks, …      |
| POST   | `/api/admin/statuses`       | Create a status `{ code, label }`    |
| PUT    | `/api/admin/statuses/:id`   | Update a status                      |
| DELETE | `/api/admin/statuses/:id`   | Delete a status                      |

## Data model

- **User / Admin** — `email`, `password`, `emailVerifiedAt`, `isVerified`
- **VerificationToken / AdminVerificationToken** — 6-digit codes, 10-min expiry
- **Status** — `code` (unique), `label`; seeded with PENDING, IN_PROGRESS, COMPLETED
- **Task** — `title`, `description?`, `deadline?`, `statusId`, `createdByType`,
  `createdById`, `endFlag`, `parentTaskId?` (self-relation for sub-tasks),
  `deletedAt?` (soft delete)
- **TaskAssignment** — polymorphic `assignableType` (`USER`|`ADMIN`) + `assignableId`
- **Category / CategoryTaskPivot** — many-to-many between tasks and categories

## Error format

```json
{ "success": false, "error": "message", "stack": "only in development" }
```

| Condition                       | Status |
| ------------------------------- | ------ |
| Validation failure              | 400    |
| Missing/invalid token           | 401/403|
| Not owner / not admin           | 403    |
| Prisma `P2025` (not found)      | 404    |
| Prisma `P2002` (duplicate)      | 409    |
| Prisma `P2003` (bad reference)  | 400    |
| Unhandled error                 | 500    |

## Testing

```bash
npm test
```

Tests never touch a real database or SMTP server: Prisma, bcrypt, JWT and the
email service are mocked. Integration tests boot the real Express app on an
ephemeral port and issue real HTTP requests. See `__tests__/routes.test.js` for
the full HTTP surface.
