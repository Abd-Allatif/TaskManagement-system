import { useState } from "react";
import { AppShell } from "../components/AppShell.jsx";
import { TaskCard } from "../components/TaskCard.jsx";
import { TaskForm } from "../components/TaskForm.jsx";
import { Link } from "../router/router.jsx";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  IdPill,
  LoadingRow,
  Panel,
  Select,
  StatusBadge,
} from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useMutation, useResource } from "../lib/useResource.js";
import { usePrincipals, useReference } from "../lib/useReference.js";
import {
  deadlineState,
  formatDate,
  formatDateTime,
  relativeDeadline,
  titleCase,
} from "../lib/format.js";
import { useRouter } from "../router/router.jsx";
import { useToast } from "../components/Toast.jsx";

export function TaskDetailPage({ id }) {
  const { token, principal, role, isAdmin, reportAuthError } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const { statuses, categories } = useReference();
  const principals = usePrincipals(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [subDrawerOpen, setSubDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const taskQuery = useResource((signal) => api.getTask(id, token), [token, id], {
    onError: reportAuthError,
  });

  const task = taskQuery.data?.task;
  const nextQuery = useResource(
    (signal) => api.listTasks({ limit: 20, sortBy: "createDate", sortOrder: "desc" }, token),
    [token],
    { onError: reportAuthError },
  );

  const canEdit = Boolean(task) && (isAdmin || task.createdById === principal?.id);

  const update = useMutation(async (patch) => api.updateTask(id, patch, token));
  const remove = useMutation(async () => api.deleteTask(id, token));

  const applyPatch = async (patch, message) => {
    try {
      await update.run(patch);
      toast.success(message);
      taskQuery.reload();
    } catch (err) {
      toast.error(err?.message || "Could not update the task.");
    }
  };

  if (taskQuery.loading && !task) {
    return (
      <AppShell eyebrow="Operations" title="Task">
        <div className="panel">
          <LoadingRow label="Loading task" />
        </div>
      </AppShell>
    );
  }

  if (taskQuery.error) {
    return (
      <AppShell
        eyebrow="Operations"
        title="Task"
        actions={
          <Link to="/tasks" className="btn btn--sm" style={{ minHeight: 32 }}>
            All tasks
          </Link>
        }
      >
        <div className="panel">
          <div className="panel__body">
            <p className="muted">{taskQuery.error.message}</p>
            {taskQuery.error.status === 404 ? (
              <p className="muted" style={{ marginTop: "var(--s2)" }}>
                The task may have been deleted, or the link is stale.
              </p>
            ) : null}
            <div style={{ marginTop: "var(--s4)", display: "flex", gap: "var(--s2)" }}>
              <Button size="sm" onClick={taskQuery.reload}>Retry</Button>
              <Link to="/tasks" className="btn btn--sm" style={{ minHeight: 32 }}>
                Back to tasks
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!task) return null;

  const deadline = task.deadline;  const dlState = deadlineState(deadline);
  const assignmentCount = (task.assignments || []).length;
  const subTasks = task.subTasks || [];
  const taskCategories = (task.categories || []).map((p) => p.category).filter(Boolean);
  const hasParent = Boolean(task.parentTaskId);

  return (
    <AppShell
      eyebrow={
        <span>
          <Link to="/tasks" style={{ textDecoration: "underline" }}>
            Tasks
          </Link>{" "}
          / detail
        </span>
      }
      title={task.title}
      actions={
        canEdit ? (
          <>
            <Button size="sm" onClick={() => setDrawerOpen(true)}>Edit</Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setConfirmOpen(true)}
              disabled={remove.loading}
            >
              Delete
            </Button>
          </>
        ) : (
          <Badge tone="neutral" dot>
            Read only
          </Badge>
        )
      }
    >
      <article className="panel" style={{ padding: "var(--s5)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s3)", marginBottom: "var(--s4)" }}>
          <StatusBadge status={task.status} />
          {task.endFlag ? (
            <Badge tone="ok" dot>Closed</Badge>
          ) : (
            <Badge tone="cobalt" dot>Open</Badge>
          )}
          {hasParent ? (
            <Link to={`/tasks/${task.parentTaskId}`} className="badge badge--neutral">
              Sub-task ↗
            </Link>
          ) : null}
          <IdPill id={task.id} />
        </div>

        <h2 className="detail-title" style={{ overflowWrap: "anywhere" }}>
          {task.title}
        </h2>

        {task.description ? (
          <p className="detail-body" style={{ marginTop: "var(--s4)" }}>
            {task.description}
          </p>
        ) : (
          <p className="muted" style={{ marginTop: "var(--s3)" }}>
            No description was provided for this task.
          </p>
        )}

        {deadline ? (
          <p
            className={`label ${
              dlState === "overdue" ? "meta-item--overdue" : dlState === "soon" ? "meta-item--soon" : ""
            }`}
            style={{ marginTop: "var(--s4)", fontSize: "0.72rem" }}
          >
            ⏱ Deadline {formatDate(deadline)} · {relativeDeadline(deadline)}
          </p>
        ) : (
          <p className="label" style={{ marginTop: "var(--s4)", fontSize: "0.72rem" }}>
            No deadline set
          </p>
        )}

        {update.error ? (
          <div style={{ marginTop: "var(--s4)" }}>
            <Alert tone="danger" title="Update failed">{update.error.message}</Alert>
          </div>
        ) : null}
      </article>

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
          <Panel
            title="Workflow"
            action={
              canEdit ? (
                <span className="status-quick">
                  <Select
                    aria-label="Change status"
                    value={task.statusId}
                    style={{ minHeight: 34 }}
                    disabled={update.loading}
                    onChange={(event) =>
                      applyPatch(
                        { statusId: event.target.value },
                        "Status updated.",
                      )
                    }
                  >
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant={task.endFlag ? "default" : "cobalt"}
                    disabled={update.loading}
                    onClick={() =>
                      applyPatch(
                        { endFlag: !task.endFlag },
                        task.endFlag ? "Task reopened." : "Task closed.",
                      )
                    }
                  >
                    {task.endFlag ? "Reopen" : "Close"}
                  </Button>
                </span>
              ) : null
            }
          >
            <dl className="kv">
              <dt>Created</dt>
              <dd>{formatDateTime(task.createDate || task.createdAt)}</dd>
              <dt>Created by</dt>
              <dd>
                <Badge tone={task.createdByType === "ADMIN" ? "accent" : "cobalt"}>
                  {titleCase(task.createdByType)}
                </Badge>{" "}
                {task.createdById === principal?.id ? " · you" : ""}
              </dd>
              <dt>Last updated</dt>
              <dd>{formatDateTime(task.createdAt)}</dd>
              <dt>Deleted</dt>
              <dd>{task.deletedAt ? formatDateTime(task.deletedAt) : "no"}</dd>
            </dl>
          </Panel>

          <Panel
            title={`Sub-tasks (${subTasks.length})`}
            action={
              /* The API only allows sub-tasks under root tasks, so the
                 button is hidden while viewing a sub-task itself. */
              canEdit && !task.endFlag && !hasParent ? (
                <Button size="sm" variant="ghost" onClick={() => setSubDrawerOpen(true)}>
                  + New sub-task
                </Button>
              ) : null
            }
          >
            {subTasks.length === 0 ? (
              <p className="muted">This task has no sub-tasks yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "var(--s3)" }}>
                {subTasks.map((sub) => (
                  <TaskCard key={sub.id} task={sub} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title={`Assignments (${assignmentCount})`}>
            {assignmentCount === 0 ? (
              <p className="muted">Nobody is assigned to this task.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Principal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {task.assignments.map((assignment) => (
                      <tr key={assignment.id}>
                        <td>
                          <Badge
                            tone={assignment.assignableType === "ADMIN" ? "accent" : "cobalt"}
                            dot
                          >
                            {titleCase(assignment.assignableType)}
                          </Badge>
                        </td>
                        <td className="mono" style={{ fontSize: "0.78rem" }}>
                          {assignment.assignableId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!isAdmin ? (
              <p className="label" style={{ marginTop: "var(--s3)" }}>
                Only administrators can view the full member directory.
              </p>
            ) : null}
          </Panel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
          <Panel title="Categories">
            {taskCategories.length === 0 ? (
              <p className="muted">No categories attached.</p>
            ) : (
              <div className="chips">
                {taskCategories.map((category) => (
                  <span key={category.id} className="cat-tag">
                    <span
                      className="chip__dot"
                      style={{ background: category.color || "var(--ink-4)" }}
                      aria-hidden="true"
                    />
                    {category.name}
                  </span>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Status legend">
            {statuses.map((s) => (
              <span
                key={s.id}
                className="badge"
                style={{
                  color: "var(--ink-2)",
                  marginRight: 6,
                  marginBottom: 6,
                  display: "inline-flex",
                  textTransform: "none",
                }}
              >
                <span
                  className="badge__dot"
                  style={{ background: s.code ? "currentColor" : "currentColor" }}
                  aria-hidden="true"
                />
                {s.label} ({s.code})
              </span>
            ))}
          </Panel>
        </div>
      </div>

      <TaskForm
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        task={task}
        statuses={statuses}
        categories={categories}
        principals={principals}
        onSaved={() => taskQuery.reload()}
      />

      <TaskForm
        open={subDrawerOpen}
        onClose={() => setSubDrawerOpen(false)}
        task={null}
        presetParentId={task.id}
        statuses={statuses}
        categories={categories}
        principals={principals}
        onSaved={() => taskQuery.reload()}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this task?"
        message="The task is soft-deleted in the API — it can no longer be listed or opened."
        confirmLabel="Delete task"
        loading={remove.loading}
        onConfirm={async () => {
          try {
            await remove.run();
            toast.success("Task deleted.");
            setConfirmOpen(false);
            navigate("/tasks", { replace: true });
          } catch (err) {
            setConfirmOpen(false);
            toast.error(err?.message || "Could not delete the task.");
          }
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppShell>
  );
}
