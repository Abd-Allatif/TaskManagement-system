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
  { method = "GET", body, token, query, signal, workspaceId } = {},
) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  // Workspace scoping: task and category endpoints resolve the active
  // workspace from this header. Platform admins may omit it on reads (sudo)
  // but writes always require it.
  if (workspaceId) headers["X-Workspace-Id"] = workspaceId;

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
  meUser: (token, signal) => request("/auth/me", { token, signal }),

  /* ---- admin authentication: /api/admin/auth --------------------------- */
  registerAdmin: (body) =>
    request("/admin/auth/register", { method: "POST", body }),
  verifyAdminEmail: (body) =>
    request("/admin/auth/verify-email", { method: "POST", body }),
  resendAdminCode: (email) =>
    request("/admin/auth/resend-code", { method: "POST", body: { email } }),
  loginAdmin: (body) => request("/admin/auth/login", { method: "POST", body }),
  logoutAdmin: () => request("/admin/auth/logout", { method: "POST" }),
  meAdmin: (token, signal) => request("/admin/auth/me", { token, signal }),

  /* ---- tasks: /api/tasks ---------------------------------------------- */
  listTasks: (query, token, workspaceId) =>
    request("/tasks", { token, query, workspaceId }),
  getTask: (id, token, workspaceId) =>
    request(`/tasks/${id}`, { token, workspaceId }),
  createTask: (body, token, workspaceId) =>
    request("/tasks", { method: "POST", body, token, workspaceId }),
  updateTask: (id, body, token, workspaceId) =>
    request(`/tasks/${id}`, { method: "PUT", body, token, workspaceId }),
  deleteTask: (id, token, workspaceId) =>
    request(`/tasks/${id}`, { method: "DELETE", token, workspaceId }),

  /* ---- categories: /api/categories ------------------------------------ */
  listCategories: (token, workspaceId) =>
    request("/categories", { token, workspaceId }),
  getCategory: (id, token, workspaceId) =>
    request(`/categories/${id}`, { token, workspaceId }),
  createCategory: (body, token, workspaceId) =>
    request("/categories", { method: "POST", body, token, workspaceId }),
  updateCategory: (id, body, token, workspaceId) =>
    request(`/categories/${id}`, { method: "PUT", body, token, workspaceId }),
  deleteCategory: (id, token, workspaceId) =>
    request(`/categories/${id}`, { method: "DELETE", token, workspaceId }),

  /* ---- workspaces: /api/workspaces --------------------------------- */
  // The creator becomes OWNER; roles and membership are seeded server-side.
  createWorkspace: (body, token) =>
    request("/workspaces", { method: "POST", body, token }),
  listWorkspaces: (token) => request("/workspaces", { token }),
  updateWorkspace: (id, body, token) =>
    request(`/workspaces/${id}`, { method: "PATCH", body, token }),
  deleteWorkspace: (id, token) =>
    request(`/workspaces/${id}`, { method: "DELETE", token }),
  transferOwnership: (id, body, token) =>
    request(`/workspaces/${id}/transfer-ownership`, {
      method: "POST",
      body,
      token,
    }),

  listMembers: (id, token) => request(`/workspaces/${id}/members`, { token }),
  updateMemberRole: (id, userId, body, token) =>
    request(`/workspaces/${id}/members/${userId}`, {
      method: "PATCH",
      body,
      token,
    }),
  removeMember: (id, userId, token) =>
    request(`/workspaces/${id}/members/${userId}`, { method: "DELETE", token }),

  listRoles: (id, token) => request(`/workspaces/${id}/roles`, { token }),
  createRole: (id, body, token) =>
    request(`/workspaces/${id}/roles`, { method: "POST", body, token }),
  updateRole: (id, roleId, body, token) =>
    request(`/workspaces/${id}/roles/${roleId}`, {
      method: "PATCH",
      body,
      token,
    }),
  setRolePermissions: (id, roleId, body, token) =>
    request(`/workspaces/${id}/roles/${roleId}/permissions`, {
      method: "PUT",
      body,
      token,
    }),
  deleteRole: (id, roleId, token) =>
    request(`/workspaces/${id}/roles/${roleId}`, { method: "DELETE", token }),

  listInvites: (id, token) => request(`/workspaces/${id}/invites`, { token }),
  createInvite: (id, body, token) =>
    request(`/workspaces/${id}/invites`, { method: "POST", body, token }),
  cancelInvite: (id, inviteId, token) =>
    request(`/workspaces/${id}/invites/${inviteId}`, {
      method: "DELETE",
      token,
    }),
  redeemInvite: (body, token) =>
    request("/workspaces/invites/redeem", { method: "POST", body, token }),

  /* ---- permission catalog: /api/permissions ----------------------- */
  listPermissions: (token) => request("/permissions", { token }),

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
