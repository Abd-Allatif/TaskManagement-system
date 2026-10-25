import { Link } from "../router/router.jsx";
import { deadlineState, formatDate, relativeDeadline, statusColor } from "../lib/format.js";
import { IdPill, StatusBadge } from "./ui.jsx";

/**
 * A task rendered as a "record strip": status-coloured edge, title, meta row,
 * and a side rail carrying deadline + sub-task/assignment counts.
 */
export function TaskCard({ task }) {
  const edge = task.status?.code ? statusColor(task.status.code) : "#99a0aa";
  const deadline = task.deadline;
  const state = deadlineState(deadline);
  const relative = relativeDeadline(deadline);
  const categories = (task.categories || []).map((pivot) => pivot.category).filter(Boolean);
  const assignmentCount = (task.assignments || []).length;
  const subTaskCount = (task.subTasks || []).length;

  return (
    <Link
      to={`/tasks/${task.id}`}
      className="task-card"
      style={{ "--edge": edge }}
      aria-label={`Open task ${task.title}`}
    >
      <span className="task-card__edge" aria-hidden="true" />

      <div className="task-card__main">
        <div className="task-card__top">
          <h3 className="task-card__title">{task.title}</h3>
        </div>

        {task.description ? (
          <p className="task-card__desc">{task.description}</p>
        ) : null}

        <div className="task-card__meta">
          <StatusBadge status={task.status} />

          {deadline ? (
            <span
              className={`meta-item ${
                state === "overdue"
                  ? "meta-item--overdue"
                  : state === "soon"
                    ? "meta-item--soon"
                    : ""
              }`.trim()}
              title={`Deadline ${formatDate(deadline)}`}
            >
              ⏱ {formatDate(deadline)}
              {relative ? ` · ${relative}` : ""}
            </span>
          ) : (
            <span className="meta-item muted">no deadline</span>
          )}

          {categories.slice(0, 3).map((category) => (
            <span key={category.id} className="cat-tag">
              <span
                className="chip__dot"
                style={{ background: category.color || "var(--ink-4)" }}
                aria-hidden="true"
              />
              {category.name}
            </span>
          ))}
          {categories.length > 3 ? (
            <span className="cat-tag">+{categories.length - 3}</span>
          ) : null}
        </div>
      </div>

      <div className="task-card__side">
        {task.endFlag ? (
          <span className="badge badge--ok">
            <span className="badge__dot" aria-hidden="true" />
            Closed
          </span>
        ) : (
          <span className="meta-item muted">open</span>
        )}
        <span className="meta-item muted" title="Assignments / sub-tasks">
          ⌂ {assignmentCount} · ⑃ {subTaskCount}
        </span>
        <IdPill id={task.id} />
      </div>
    </Link>
  );
}
