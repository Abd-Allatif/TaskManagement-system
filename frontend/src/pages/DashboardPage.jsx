import { useMemo } from "react";
import { AppShell } from "../components/AppShell.jsx";
import { Link } from "../router/router.jsx";
import {
  EmptyState,
  ErrorState,
  LoadingRow,
  Panel,
} from "../components/ui.jsx";
import { TaskCard } from "../components/TaskCard.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import {
  formatDateTime,
  relativeDeadline,
  statusColor,
} from "../lib/format.js";
import { useResource } from "../lib/useResource.js";
import { useReference } from "../lib/useReference.js";

const DAY = 24 * 60 * 60 * 1000;

export function DashboardPage() {
  const {
    token,
    principal,
    role,
    isAdmin,
    reportAuthError,
  } = useAuth();
  const { statuses } = useReference();

  const scope = useMemo(
    () => ({
      createdById: principal?.id,
      createdByType: role,
    }),
    [principal?.id, role],
  );

  // Global telemetry is an admin-only endpoint; members get their own scope.
  const overview = useResource((signal) => api.adminOverview(token), [token], {
    enabled: isAdmin,
    onError: reportAuthError,
  });

  const recent = useResource(
    (signal) =>
      api.listTasks({ limit: 6, sortBy: "createDate", sortOrder: "desc" }, token),
    [token],
    { onError: reportAuthError },
  );

  const mine = useResource((signal) => api.listTasks({ ...scope, limit: 100 }, token), [token, scope], {
    onError: reportAuthError,
  });

  const tasks = mine.data?.tasks || [];
  const loading = mine.loading && !tasks.length;

  const stats = useMemo(() => {
    const now = Date.now();
    const open = tasks.filter((t) => !t.endFlag);
    return {
      total: tasks.length,
      open: open.length,
      closed: tasks.length - open.length,
      overdue: open.filter(
        (t) => t.deadline && new Date(t.deadline).getTime() < now,
      ).length,
      dueSoon: open.filter((t) => {
        if (!t.deadline) return false;
        const diff = new Date(t.deadline).getTime() - now;
        return diff >= 0 && diff < 3 * DAY;
      }),
      byStatus: statuses.map((status) => ({
        ...status,
        count: tasks.filter((t) => t.statusId === status.id).length,
      })),
    };
  }, [tasks, statuses]);

  const globalByStatus = useMemo(() => {
    if (!isAdmin) return stats.byStatus;
    const rows = overview.data?.overview?.tasksByStatus || [];
    return statuses.map((status) => {
      const row = rows.find((r) => r.statusId === status.id);
      return { ...status, count: row?._count?._all || 0 };
    });
  }, [isAdmin, overview.data, statuses, stats.byStatus]);

  const barMax = Math.max(1, ...globalByStatus.map((row) => row.count));

  const tiles = isAdmin
    ? [
        { label: "Members", value: overview.data?.overview?.users ?? "—", accent: "cobalt" },
        { label: "Administrators", value: overview.data?.overview?.admins ?? "—", accent: "accent" },
        { label: "Active tasks", value: overview.data?.overview?.tasks ?? "—", accent: "accent" },
      ]
    : [
        { label: "My tasks", value: loading ? null : stats.total, accent: "accent" },
        { label: "Open", value: loading ? null : stats.open, accent: "cobalt" },
        { label: "Overdue", value: loading ? null : stats.overdue, accent: "warn" },
        { label: "Closed", value: loading ? null : stats.closed, accent: "ok" },
      ];

  return (
    <AppShell
      eyebrow={isAdmin ? "Operations" : "Workspace"}
      title={`Good to see you, ${(principal?.name || "operator").split(" ")[0]}`}
    >
      <div className="grid grid--stats stagger">
        {tiles.map((tile) => (
          <div className="tile" key={tile.label}>
            <div className="stat">
              <span className="label">{tile.label}</span>
              <span className="stat__value">
                {tile.value === null ? <span className="skeleton" style={{ height: 30, width: 72, display: "inline-block" }} /> : tile.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid--split">
        <Panel title={isAdmin ? "Workload by status" : "My workload by status"}>
          {globalByStatus.length === 0 ? (
            <EmptyState
              mark="⬡"
              title="No statuses configured"
              description="An administrator must create statuses before tasks can be tracked."
            />
          ) : (
            globalByStatus.map((row) => (
              <div className="bar-row" key={row.id}>
                <span className="label" style={{ color: "var(--ink-2)" }}>
                  {row.label}
                </span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{
                      width: `${(row.count / barMax) * 100}%`,
                      "--bar-color": statusColor(row.code),
                    }}
                  />
                </span>
                <span className="bar-count">{row.count}</span>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Deadline radar">
          {loading ? (
            <LoadingRow label="Scanning deadlines" />
          ) : stats.dueSoon.length === 0 ? (
            <EmptyState mark="⏱" title="Nothing due within 3 days" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
              {stats.dueSoon.map((task) => (
                <Link
                  key={task.id}
                  to={`/tasks/${task.id}`}
                  className="admin-row"
                  style={{ borderRadius: 4, paddingLeft: 0 }}
                >
                  <span className="admin-row__grow" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                    {task.title}
                  </span>
                  <span className="meta-item meta-item--soon">
                    {relativeDeadline(task.deadline)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Latest created"
        action={
          <Link to="/tasks" className="btn btn--sm btn--ghost" style={{ minHeight: 28 }}>
            View all
          </Link>
        }
      >
        {recent.loading && !(recent.data?.tasks || []).length ? (
          <LoadingRow label="Loading tasks" />
        ) : recent.error ? (
          <ErrorState error={recent.error} onRetry={recent.reload} />
        ) : (recent.data?.tasks || []).length === 0 ? (
          <EmptyState
            mark="∅"
            title="No tasks yet"
            description="The workspace is empty. Create the first task to get moving."
            action={
              <Link to="/tasks" className="btn btn--sm" style={{ minHeight: 32 }}>
                Go to tasks
              </Link>
            }
          />
        ) : (
          <div className="stagger" style={{ display: "grid", gap: "var(--s3)" }}>
            {(recent.data?.tasks || []).map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </Panel>

      <p className="label" style={{ textAlign: "center" }}>
        Signed in as {principal?.email} · {isAdmin ? "administrator" : "member"} session ·
        issued {formatDateTime(principal?.emailVerifiedAt || null)}
      </p>
    </AppShell>
  );
}
