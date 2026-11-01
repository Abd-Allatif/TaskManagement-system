import { useEffect, useState } from "react";
import { Link, useRouter } from "../router/router.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { Avatar, Button, RoleBadge } from "./ui.jsx";

const WORK_NAV = [
  { to: "/", label: "Dashboard", glyph: "▦", exact: true },
  { to: "/tasks", label: "Tasks", glyph: "☰" },
  { to: "/categories", label: "Categories", glyph: "◈" },
  { to: "/statuses", label: "Statuses", glyph: "⬡" },
];

const WORKSPACE_NAV = [
  { to: "/workspace/members", label: "Members", glyph: "☁" },
  { to: "/workspace/roles", label: "Roles", glyph: "※" },
];

const ADMIN_NAV = [
  { to: "/admin/overview", label: "Overview", glyph: "◆" },
];

function isActive(pathname, item) {
  if (item.exact) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function NavLink({ item, pathname, onNavigate }) {
  const active = isActive(pathname, item);
  return (
    <Link
      to={item.to}
      className="navlink"
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      <span className="navlink__glyph" aria-hidden="true">
        {item.glyph}
      </span>
      {item.label}
    </Link>
  );
}

export function AppShell({ eyebrow, title, actions, children }) {
  const { pathname } = useRouter();
  const { principal, role, isAdmin, signOut } = useAuth();
  const { workspaces, active, workspaceId, setActiveWorkspace } = useWorkspace();
  const [railOpen, setRailOpen] = useState(false);

  // Collapse the off-canvas rail whenever the route changes.
  useEffect(() => {
    setRailOpen(false);
  }, [pathname]);

  return (
    <div className="shell">
      <aside className={`rail ${railOpen ? "rail--open" : ""}`.trim()}>
        <div className="rail__brand">
          <span className="rail__mark" aria-hidden="true">
            TO
          </span>
          <span className="rail__wordmark">
            <b>Task Operations</b>
            <span>Console v1</span>
          </span>
        </div>

        <nav className="rail__nav" aria-label="Primary">
          <div className="rail__group">
            <span className="rail__group-title">Work</span>
            {WORK_NAV.map((item) => (
              <NavLink
                key={item.to}
                item={item}
                pathname={pathname}
                onNavigate={() => setRailOpen(false)}
              />
            ))}
          </div>

          {isAdmin ? (
            <div className="rail__group">
              <span className="rail__group-title">Administration</span>
              {ADMIN_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  item={item}
                  pathname={pathname}
                  onNavigate={() => setRailOpen(false)}
                />
              ))}
            </div>
          ) : (
            <div className="rail__group">
              <span className="rail__group-title">Workspace</span>
              {WORKSPACE_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  item={item}
                  pathname={pathname}
                  onNavigate={() => setRailOpen(false)}
                />
              ))}
            </div>
          )}
        </nav>

        <div className="rail__foot">
          <Link to="/profile" className="identity" onClick={() => setRailOpen(false)}>
            <Avatar name={principal?.name} />
            <span className="identity__meta">
              <span className="identity__name">{principal?.name || "Account"}</span>
              <span className="identity__email">{principal?.email}</span>
            </span>
          </Link>
          <RoleBadge role={role} />
          <button type="button" className="rail__signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      {railOpen ? (
        <div
          className="scrim"
          style={{ zIndex: 45 }}
          onClick={() => setRailOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <div className="shell__main">
        <header className="topbar">
          <Button
            className="topbar__menu"
            variant="ghost"
            size="sm"
            aria-label="Toggle navigation"
            aria-expanded={railOpen}
            onClick={() => setRailOpen((open) => !open)}
          >
            ☰
          </Button>

          <div className="topbar__titles">
            <span className="label topbar__eyebrow">{eyebrow || "Console"}</span>
            <h1>{title}</h1>
          </div>

          {/* Workspace switcher: the active selection rides every request as
              X-Workspace-Id. Admins may leave it unset to browse in sudo
              mode; members always have exactly one workspace selected. */}
          {workspaces.length > 0 ? (
            <div>
              <select
                className="select"
                style={{ minWidth: 190 }}
                value={workspaceId || ""}
                aria-label="Active workspace"
                onChange={(event) => setActiveWorkspace(event.target.value)}
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                    {ws.role ? ` — ${ws.role.name}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {actions ? <div className="topbar__actions">{actions}</div> : null}
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
