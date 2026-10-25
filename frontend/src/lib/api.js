/**
 * API client for the Task Management backend.
 *
 * Every endpoint below maps 1:1 onto a route mounted in server.js. The client
 * normalises the backend's several error shapes (controllers return `message`
 * or `error`; express-validator returns `errors[]`) into a single ApiError.
 */

const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, { status = 0, fields = null, payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    /** Field-level messages from express-validator, as { field: message }. */
    this.fields = fields;
    this.payload = payload;
  }
}

const STATUS_FALLBACK = {
  0: "Cannot reach the API. Is the backend running?",
  400: "That request was rejected.",
  401: "Your session has expired. Please sign in again.",
  403: "You do not have permission to do that.",
  404: "Not found.",
  409: "That record already exists.",
  429: "Too many requests. Please slow down and try again shortly.",
  500: "The server hit an unexpected error.",
};

const toFieldMap = (errors) => {
  if (!Array.isArray(errors)) return null;
  const map = {};
  for (const e of errors) {
    if (e && e.field && !map[e.field]) map[e.field] = e.message;
  }
  return Object.keys(map).length ? map : null;
};

const extractMessage = (payload, status) => {
  if (payload && typeof payload === "object") {
    if (typeof payload.message === "string" && payload.message) {
      return payload.message;
    }
    if (typeof payload.error === "string" && payload.error) {
      return payload.error;
    }
    if (Array.isArray(payload.errors) && payload.errors[0]?.message) {
      return payload.errors[0].message;
    }
  }
  return STATUS_FALLBACK[status] || `Request failed (${status}).`;
};

function buildUrl(path, query) {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }

  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request(
  path,
  { method = "GET", body, token, query, signal } = {},
) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError(STATUS_FALLBACK[0], { status: 0 });
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text.slice(0, 300) };
    }
  }

  if (!response.ok) {
    throw new ApiError(extractMessage(payload, response.status), {
      status: response.status,
      fields: toFieldMap(payload?.errors),
      payload,
    });
  }

  return payload;
}

export const api = {
  /* ---- user authentication: /api/auth ---------------------------------- */
  registerUser: (body) => request("/auth/register", { method: "POST", body }),
  verifyUserEmail: (body) =>
    request("/auth/verify-email", { method: "POST", body }),
  resendUserCode: (email) =>
    request("/auth/resend-code", { method: "POST", body: { email } }),
  loginUser: (body) => request("/auth/login", { method: "POST", body }),
  logoutUser: () => request("/auth/logout", { method: "POST" }),
  meUser: (token) => request("/auth/me", { token }),

  /* ---- admin authentication: /api/admin/auth --------------------------- */
  registerAdmin: (body) =>
    request("/admin/auth/register", { method: "POST", body }),
  verifyAdminEmail: (body) =>
    request("/admin/auth/verify-email", { method: "POST", body }),
  resendAdminCode: (email) =>
    request("/admin/auth/resend-code", { method: "POST", body: { email } }),
  loginAdmin: (body) => request("/admin/auth/login", { method: "POST", body }),
  logoutAdmin: () => request("/admin/auth/logout", { method: "POST" }),
  meAdmin: (token) => request("/admin/auth/me", { token }),

  /* ---- tasks: /api/tasks ---------------------------------------------- */
  listTasks: (query, token) => request("/tasks", { token, query }),
  getTask: (id, token) => request(`/tasks/${id}`, { token }),
  createTask: (body, token) => request("/tasks", { method: "POST", body, token }),
  updateTask: (id, body, token) =>
    request(`/tasks/${id}`, { method: "PUT", body, token }),
  deleteTask: (id, token) =>
    request(`/tasks/${id}`, { method: "DELETE", token }),

  /* ---- categories: /api/categories ------------------------------------ */
  listCategories: (token) => request("/categories", { token }),
  getCategory: (id, token) => request(`/categories/${id}`, { token }),
  createCategory: (body, token) =>
    request("/categories", { method: "POST", body, token }),
  updateCategory: (id, body, token) =>
    request(`/categories/${id}`, { method: "PUT", body, token }),
  deleteCategory: (id, token) =>
    request(`/categories/${id}`, { method: "DELETE", token }),

  /* ---- statuses (read): /api/statuses --------------------------------- */
  listStatuses: (token) => request("/statuses", { token }),
  getStatus: (id, token) => request(`/statuses/${id}`, { token }),

  /* ---- admin management: /api/admin ----------------------------------- */
  adminOverview: (token) => request("/admin/overview", { token }),
  adminUsers: (token) => request("/admin/users", { token }),
  adminAdmins: (token) => request("/admin/admins", { token }),
  createStatus: (body, token) =>
    request("/admin/statuses", { method: "POST", body, token }),
  updateStatus: (id, body, token) =>
    request(`/admin/statuses/${id}`, { method: "PUT", body, token }),
  deleteStatus: (id, token) =>
    request(`/admin/statuses/${id}`, { method: "DELETE", token }),
};
