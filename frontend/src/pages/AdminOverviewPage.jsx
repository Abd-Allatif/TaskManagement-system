import { useState } from "react";
import { AppShell } from "../components/AppShell.jsx";
import {
  Badge,
  LoadingRow,
  Panel,
  Tabs,
  Tile,
  statusTone,
} from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { colorFor, formatDate, statusColor } from "../lib/format.js";
import { useResource } from "../lib/useResource.js";
import { useReference } from "../lib/useReference.js";

/**
 * Global telemetry + the full principal directory. Every endpoint here is
 * admin-gated by `verifyAdmin`, so the route only renders for ADMIN tokens.
 */
export function AdminOverviewPage() {
  const { token, reportAuthError } = useAuth();
  const { statuses } = useReference();
  const [tab, setTab] = useState("users");

  const overview = useResource((signal) => api.adminOverview(token), [token], {
    onError: reportAuthError,
  });
  const users = useResource((signal) => api.adminUsers(token), [token], {
    enabled: tab === "users",
    onError: reportAuthError,
  });
  const admins = useResource((signal) => api.adminAdmins(token), [token], {
    enabled: tab === "admins",
    onError: reportAuthError,
  });

  const data = overview.data?.overview;
  const rows = data?.tasksByStatus || [];
  const barMax = Math.max(1, ...rows.map((row) => row._count?._all || 0));

  const members = users.data?.users || [];
  const staff = admins.data?.admins || [];
  const directory = tab === "users" ? members : staff;

  return (
    <AppShell eyebrow="Administration" title="System overview">
      <div className="grid grid--stats stagger">
        <Tile label="Members" value={data?.users ?? "—"} accent="cobalt" loading={overview.loading} />
        <Tile label="Administrators" value={data?.admins ?? "—"} accent="accent" loading={overview.loading} />
        <Tile label="Active tasks" value={data?.tasks ?? "—"} accent="accent" loading={overview.loading} foot="soft-deleted excluded" />
        <Tile label="Categories" value={data?.categories ?? "—"} loading={overview.loading} />
        <Tile label="Statuses" value={data?.statuses ?? "—"} loading={overview.loading} />
      </div>

      <div className="grid grid--halves">
        <Panel title="Active tasks by status">
          {rows.length === 0 ? (
            <p className="muted">No active tasks grouped by status.</p>
          ) : (
            rows.map((row) => {
              const status = statuses.find((s) => s.id === row.statusId);
              return (
                <div className="bar-row" key={row.statusId}>
                  <span className="label" style={{ color: "var(--ink-2)" }}>
                    {status?.label || "Unknown"}
                  </span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{
                        width: `${((row._count?._all || 0) / barMax) * 100}%`,
                        "--bar-color": statusColor(status?.code || row.statusId),
                      }}
                    />
                  </span>
                  <span className="bar-count">{row._count?._all || 0}</span>
                </div>
              );
            })
          )}
        </Panel>

        <Panel title="Directory">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "users", label: "Members", count: members.length },
              { id: "admins", label: "Administrators", count: staff.length },
            ]}
          />

          {users.loading && tab === "users" ? (
            <LoadingRow label="Loading members" />
          ) : admins.loading && tab === "admins" ? (
            <LoadingRow label="Loading administrators" />
          ) : users.error || admins.error ? (
            <p className="muted">
              {(users.error || admins.error)?.message}
            </p>
          ) : directory.length === 0 ? (
            <p className="muted">Nothing here yet.</p>
          ) : (
            <div className="table-wrap" style={{ marginTop: "var(--s3)" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Verified</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {directory.map((person) => (
                    <tr key={person.id}>
                      <td style={{ fontWeight: 600 }}>{person.name}</td>
                      <td className="mono" style={{ fontSize: "0.76rem" }}>
                        {person.email}
                      </td>
                      <td>
                        {person.emailVerifiedAt ? (
                          <Badge tone="ok" dot>Verified</Badge>
                        ) : (
                          <Badge tone="warn" dot>Pending</Badge>
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: "0.76rem" }}>
                        {formatDate(person.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Status palette reference">
        <div className="chips">
          {statuses.map((status) => (
            <span key={status.id} className="chip" aria-hidden="true">
              <span
                className="chip__dot"
                style={{ background: colorFor(status.code) }}
              />
              {status.label}
              <span className="label" style={{ opacity: 0.7 }}>
                {statusTone(status.code)}
              </span>
            </span>
          ))}
        </div>
      </Panel>
    </AppShell>
  );
}
