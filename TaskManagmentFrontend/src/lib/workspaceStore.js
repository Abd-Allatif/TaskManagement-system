/**
 * Persistence for the active workspace selection (mirrors session.js).
 * Kept separate from the session so clearing auth also clears the workspace
 * in one place without two writers racing on the same key.
 */

const STORAGE_KEY = "tms.workspace.v1";

export function loadWorkspace() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveWorkspace(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage may be unavailable — the selection stays in memory */
  }
}

export function clearWorkspace() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
