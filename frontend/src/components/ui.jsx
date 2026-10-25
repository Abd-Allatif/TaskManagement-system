import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { Link } from "../router/router.jsx";
import { initials, shortId, titleCase } from "../lib/format.js";

/* ==========================================================================
   Buttons
   ========================================================================== */

export function Button({
  variant = "default",
  size = "md",
  block = false,
  loading = false,
  icon = null,
  className = "",
  children,
  disabled,
  ...rest
}) {
  const classes = [
    "btn",
    variant !== "default" ? `btn--${variant}` : "",
    size === "sm" ? "btn--sm" : "",
    block ? "btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

/* ==========================================================================
   Form primitives
   ========================================================================== */

export function Field({ label, hint, error, htmlFor, children }) {
  return (
    <div className="field">
      {label ? (
        <label className="field__label" htmlFor={htmlFor}>
          <span>{label}</span>
          {hint ? <span className="field__hint">{hint}</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="field__error">{error}</p> : null}
    </div>
  );
}

export function TextInput({ label, hint, error, id, className = "", ...rest }) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <input
        id={inputId}
        className={`input ${className}`.trim()}
        aria-invalid={error ? "true" : undefined}
        {...rest}
      />
    </Field>
  );
}

export function TextArea({ label, hint, error, id, className = "", ...rest }) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <textarea
        id={inputId}
        className={`textarea ${className}`.trim()}
        aria-invalid={error ? "true" : undefined}
        {...rest}
      />
    </Field>
  );
}

export function Select({
  label,
  hint,
  error,
  id,
  className = "",
  children,
  ...rest
}) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <select
        id={inputId}
        className={`select ${className}`.trim()}
        aria-invalid={error ? "true" : undefined}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
}

export function Checkbox({ label, className = "", ...rest }) {
  return (
    <label className={`check ${className}`.trim()}>
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

/** Multi-select rendered as toggleable pills. */
export function ChipMultiSelect({ options, value = [], onChange, emptyLabel }) {
  if (!options.length) {
    return <p className="muted">{emptyLabel || "Nothing available yet."}</p>;
  }

  const toggle = (id) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className="chips">
      {options.map((option) => {
        const pressed = value.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            className="chip"
            aria-pressed={pressed}
            onClick={() => toggle(option.id)}
          >
            {option.color ? (
              <span
                className="chip__dot"
                style={{ background: option.color }}
                aria-hidden="true"
              />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Badges
   ========================================================================== */

const STATUS_TONES = {
  PENDING: "warn",
  IN_PROGRESS: "cobalt",
  COMPLETED: "ok",
  DONE: "ok",
  BLOCKED: "danger",
  CANCELLED: "danger",
  ON_HOLD: "neutral",
};

export const statusTone = (code = "") =>
  STATUS_TONES[String(code).toUpperCase()] || "neutral";

export function Badge({ tone = "neutral", dot = false, children }) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot ? <span className="badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status, fallback = "No status" }) {
  if (!status) return <Badge tone="neutral">{fallback}</Badge>;
  return (
    <Badge tone={statusTone(status.code)} dot>
      {status.label || status.code}
    </Badge>
  );
}

export function RoleBadge({ role }) {
  return (
    <Badge tone={role === "ADMIN" ? "accent" : "cobalt"}>
      {role === "ADMIN" ? "Administrator" : "Member"}
    </Badge>
  );
}

export function IdPill({ id }) {
  return (
    <span className="id-pill" title={id}>
      #{shortId(id)}
    </span>
  );
}

/* ==========================================================================
   Surfaces
   ========================================================================== */

export function Panel({ title, action, children, bodyTight = false, flat = false }) {
  return (
    <section className={`panel ${flat ? "panel--flat" : ""}`.trim()}>
      {title || action ? (
        <header className="panel__head">
          {typeof title === "string" ? <h3>{title}</h3> : title}
          {action}
        </header>
      ) : null}
      <div className={`panel__body ${bodyTight ? "panel__body--tight" : ""}`.trim()}>
        {children}
      </div>
    </section>
  );
}

export function Tile({ label, value, foot, accent = "accent", loading = false }) {
  return (
    <article className={`tile tile--${accent}`}>
      <div className="stat">
        <span className="label">{label}</span>
        {loading ? (
          <span className="skeleton" style={{ height: 34, width: "60%" }} />
        ) : (
          <span className="stat__value">{value}</span>
        )}
        {foot ? <span className="stat__foot">{foot}</span> : null}
      </div>
    </article>
  );
}

export function EmptyState({ title, description, action, mark = "∅" }) {
  return (
    <div className="empty">
      <span className="empty__mark" aria-hidden="true">
        {mark}
      </span>
      <h3>{title}</h3>
      {description ? <p className="muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function LoadingRow({ label = "Loading" }) {
  return (
    <div className="loading-row" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Alert({ tone = "info", title, children }) {
  return (
    <div className={`alert alert--${tone}`} role="alert">
      <div className="alert__body">
        {title ? <strong>{title}</strong> : null}
        {children ? <span>{children}</span> : null}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Something went wrong" }) {
  return (
    <Alert tone="danger" title={title}>
      {error?.message}
      {onRetry ? (
        <>
          {" "}
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={onRetry}
            style={{ marginLeft: 8 }}
          >
            Retry
          </button>
        </>
      ) : null}
    </Alert>
  );
}

/* ==========================================================================
   Overlays
   ========================================================================== */

function useOverlay(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
}

export function Drawer({ open, title, subtitle, onClose, children, footer }) {
  useOverlay(open, onClose);
  if (!open) return null;

  return createPortal(
    <div
      className="scrim scrim--right"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Panel"}
      >
        <header className="drawer__head">
          <div>
            <span className="label">{subtitle || "Editor"}</span>
            <h2>{title}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer ? <footer className="drawer__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Modal({ open, title, onClose, children, footer }) {
  useOverlay(open, onClose);
  if (!open) return null;

  return createPortal(
    <div
      className="scrim scrim--center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Dialog"}
      >
        <header className="panel__head">
          <h3>{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </header>
        <div className="panel__body">{children}</div>
        {footer ? (
          <footer className="drawer__foot" style={{ borderTop: "1.5px solid var(--line-strong)" }}>
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  );
}

/* ==========================================================================
   Navigation helpers
   ========================================================================== */

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.count === "number" ? ` (${tab.count})` : ""}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, total, limit, onChange }) {
  if (!totalPages || totalPages <= 1) {
    return (
      <div className="pager">
        <span className="label">
          {total === 0 ? "No records" : `${total} record${total === 1 ? "" : "s"}`}
        </span>
      </div>
    );
  }

  const pages = [];
  const window = 2;
  for (let i = 1; i <= totalPages; i += 1) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= page - window && i <= page + window)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="pager">
      <span className="label">
        {from}–{to} of {total}
      </span>
      <div className="pager__pages">
        <Button
          size="sm"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Prev
        </Button>
        {pages.map((entry, index) =>
          entry === "…" ? (
            <span key={`gap-${index}`} className="muted mono" style={{ padding: "0 4px" }}>
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className="pager__num"
              aria-current={entry === page}
              onClick={() => onChange(entry)}
            >
              {entry}
            </button>
          ),
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/* ==========================================================================
   Domain chips
   ========================================================================== */

export function PrincipalChip({ name, email, role }) {
  return (
    <span className="cat-tag" title={email}>
      <span
        className="chip__dot"
        style={{ background: role === "ADMIN" ? "var(--accent)" : "var(--cobalt)" }}
        aria-hidden="true"
      />
      {name || email}
    </span>
  );
}

export function Avatar({ name, size = 34 }) {
  return (
    <span
      className="identity__avatar"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function TypeTag({ type }) {
  return (
    <Badge tone={type === "ADMIN" ? "accent" : "cobalt"}>{titleCase(type)}</Badge>
  );
}

export { Link };
