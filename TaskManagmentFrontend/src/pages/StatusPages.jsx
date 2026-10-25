import { AppShell } from "../components/AppShell.jsx";
import { Link } from "../router/router.jsx";

export function NotFoundPage() {
  return (
    <AppShell eyebrow="404" title="Nothing at this address">
      <div className="panel">
        <div className="empty">
          <span className="empty__mark mono" aria-hidden="true">
            404
          </span>
          <h3>This route does not exist in the console</h3>
          <p className="muted">
            The path may have been moved, or the link is stale.
          </p>
          <Link to="/" className="btn" style={{ minHeight: 40 }}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

export function ForbiddenPage() {
  return (
    <AppShell eyebrow="403" title="Administrator area">
      <div className="panel">
        <div className="empty">
          <span className="empty__mark mono" aria-hidden="true">
            403
          </span>
          <h3>Only administrators can view this area</h3>
          <p className="muted">
            The API rejects member tokens on <code>/api/admin</code> endpoints.
          </p>
          <Link to="/" className="btn" style={{ minHeight: 40 }}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

/** Shown while the stored session is being replayed against /me. */
export function BootScreen() {
  return (
    <div className="auth" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <div className="auth__panel" style={{ padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
          <span className="spinner" aria-hidden="true" />
          <span className="label">Restoring session…</span>
        </div>
      </div>
    </div>
  );
}

/** Shown when the API reports the token is no longer usable. */
export function SessionExpiredNotice() {
  return (
    <AppShell eyebrow="Session" title="Your session ended">
      <div className="alert alert--warn" role="alert">
        <div className="alert__body">
          <strong>Sign in again</strong>
          <span>Your token is no longer valid. Please sign in to continue working.</span>
        </div>
      </div>
      <div>
        <Link to="/login" className="btn" style={{ minHeight: 40 }}>
          Sign in
        </Link>
      </div>
    </AppShell>
  );
}
