/**
 * Session persistence. The backend issues a stateless JWT and expects it back
 * as `Authorization: Bearer <token>`, so we keep it in localStorage alongside
 * the decoded role so a refresh can restore the shell before /me resolves.
 */

const STORAGE_KEY = "tms.session.v1";

export const ROLES = { USER: "USER", ADMIN: "ADMIN" };

/** Decodes a JWT payload without verifying it (UI hint only, never trusted). */
export function decodeToken(token) {
  if (!token || typeof token !== "string") return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** The backend omits `type` on user tokens, so absence means USER. */
export function roleFromToken(token) {
  const payload = decodeToken(token);
  if (!payload) return null;
  return payload.type === ROLES.ADMIN ? ROLES.ADMIN : ROLES.USER;
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage may be unavailable (private mode) — session stays in memory */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
