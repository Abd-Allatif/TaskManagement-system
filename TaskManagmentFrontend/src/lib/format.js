/** Small formatting helpers shared across views. */

export const titleCase = (value = "") =>
  String(value)
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** "12 Oct 2026" — stable and locale-agnostic enough for a console UI. */
export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(value)} · ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

const DAY = 24 * 60 * 60 * 1000;

/** Compact relative deadline, e.g. "in 3d", "2d overdue". */
export function relativeDeadline(value) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;

  const diff = target.getTime() - Date.now();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / DAY);
  const hours = Math.floor(abs / (60 * 60 * 1000));

  let magnitude;
  if (abs < 60 * 60 * 1000) magnitude = `${Math.max(1, Math.floor(abs / 60000))}m`;
  else if (days >= 1) magnitude = `${days}d`;
  else magnitude = `${Math.max(1, hours)}h`;

  return diff < 0 ? `${magnitude} overdue` : `in ${magnitude}`;
}

export function deadlineState(value) {
  if (!value) return "none";
  const diff = new Date(value).getTime() - Date.now();
  if (Number.isNaN(diff)) return "none";
  if (diff < 0) return "overdue";
  if (diff < 2 * DAY) return "soon";
  return "later";
}

export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic colour for a status/category that has none assigned. */
export function colorFor(seed = "") {
  const palette = [
    "#1F3FD8",
    "#E8410E",
    "#0E7C5A",
    "#A86400",
    "#7A2E9B",
    "#0B6E8A",
    "#B0186B",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

/** Resolved colour for a status code, matching the badge tones. */
const STATUS_COLORS = {
  PENDING: "#a86400",
  IN_PROGRESS: "#1f3fd8",
  COMPLETED: "#0e7c5a",
  DONE: "#0e7c5a",
  BLOCKED: "#c2240a",
  CANCELLED: "#c2240a",
  ON_HOLD: "#6c7480",
};

export const statusColor = (code = "") =>
  STATUS_COLORS[String(code).toUpperCase()] || colorFor(String(code));

export const shortId = (id = "") => (id ? String(id).slice(0, 8) : "—");

export const pluralize = (count, singular, plural) =>
  `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
