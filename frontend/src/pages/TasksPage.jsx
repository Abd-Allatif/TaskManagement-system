import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell.jsx";
import { TaskCard } from "../components/TaskCard.jsx";
import { TaskForm } from "../components/TaskForm.jsx";
import {
  Button,
  Pagination,
  Select,
} from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useResource } from "../lib/useResource.js";
import { usePrincipals, useReference } from "../lib/useReference.js";
import { useRouter } from "../router/router.jsx";

const SORT_FIELDS = [
  { value: "createDate", label: "Created" },
  { value: "deadline", label: "Deadline" },
  { value: "title", label: "Title" },
  { value: "endFlag", label: "Closed flag" },
];

const LIMIT = 10;

/**
 * Full task directory. Filters live in the query string so a filtered view can
 * be shared or bookmarked, and in-flight requests are cancelled on change.
 */
export function TasksPage() {
  const { query, navigate } = useRouter();
  const { token, principal, role, isAdmin, reportAuthError } = useAuth();
  const { statuses, categories } = useReference();
  const principals = usePrincipals(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState(query.search || "");

  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const mine = query.mine === "1";
  const filtered =
    Boolean(query.search) || Boolean(query.statusId) || Boolean(query.endFlag) || mine;

  /** Pushes a patch into the URL query, dropping empty values. */
  const setQuery = (patch) => {
    const next = { ...query, ...patch };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === null || value === "" || value === false) {
        continue;
      }
      params.set(key, String(value));
    }
    const qs = params.toString();
    navigate(`/tasks${qs ? `?${qs}` : ""}`, { replace: true, keepScroll: true });
  };

  /** Any filter change resets pagination. */
  const change = (patch) => setQuery({ ...patch, page: undefined });

  // Debounce the search box: filter changes are URL round-trips by design.
  useEffect(() => {
    if (search === (query.search || "")) return undefined;
    const handle = window.setTimeout(() => {
      setQuery({ search });
    }, 380);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const apiQuery = useMemo(
    () => ({
      page,
      limit: LIMIT,
      sortBy: query.sortBy || "createDate",
      sortOrder: query.sortOrder === "asc" ? "asc" : "desc",
      ...(query.statusId ? { statusId: query.statusId } : {}),
      ...(query.endFlag ? { endFlag: query.endFlag } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(mine && principal
        ? { createdById: principal.id, createdByType: role }
        : {}),
    }),
    [
      page,
      query.sortBy,
      query.sortOrder,
      query.statusId,
      query.endFlag,
      query.search,
      mine,
      principal,
      role,
    ],
  );

  const list = useResource(
    (signal) => api.listTasks(apiQuery, token),
    [token, JSON.stringify(apiQuery)],
    { onError: reportAuthError },
  );

  const tasks = list.data?.tasks || [];
  const pagination = list.data?.pagination;

  return (
    <AppShell
      eyebrow="Operations"
      title="Tasks"
      actions={
        <Button variant="primary" size="sm" onClick={() => setDrawerOpen(true)}>
          New task
        </Button>
      }
    >
      <form
        className="filters panel panel--flat"
        onSubmit={(event) => event.preventDefault()}
        style={{ boxShadow: "none" }}
        aria-label="Task filters"
      >
        <div className="field filters__search">
          <span className="field__label" style={{ position: "static" }}>
            <span>Search</span>
          </span>
          <input
            className="input"
            type="search"
            placeholder="Search title or description…"
            aria-label="Search tasks"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Select
          label="Status"
          value={query.statusId || ""}
          onChange={(event) => change({ statusId: event.target.value })}
        >
          <option value="">All statuses</option>
          {(statuses || []).map((status) => (
            <option key={status.id} value={status.id}>
              {status.label}
            </option>
          ))}
        </Select>

        <Select
          label="Completion"
          value={query.endFlag || ""}
          onChange={(event) => change({ endFlag: event.target.value })}
        >
          <option value="">Open &amp; closed</option>
          <option value="false">Open only</option>
          <option value="true">Closed only</option>
        </Select>

        <Select
          label="Sort by"
          value={query.sortBy || "createDate"}
          onChange={(event) => change({ sortBy: event.target.value })}
        >
          {SORT_FIELDS.map((field) => (
            <option key={field.value} value={field.value}>
              {field.label}
            </option>
          ))}
        </Select>

        <div
          style={{
            display: "grid",
            gap: "var(--s2)",
            gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
          }}
        >
          <Select
            label="Order"
            value={query.sortOrder === "asc" ? "asc" : "desc"}
            onChange={(event) => change({ sortOrder: event.target.value })}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </Select>
        </div>

        <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
          <Button size="sm" onClick={() => setQuery({ mine: mine ? undefined : "1" })}>
            {mine ? "✓ Only mine" : "Only mine"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              navigate("/tasks", { replace: true, keepScroll: true });
            }}
          >
            Reset
          </Button>
        </div>
      </form>

      {list.error ? (
        <div className="panel">
          <div className="panel__body">
            <p className="muted" style={{ marginBottom: "var(--s3)" }}>
              Could not load tasks — {list.error.message}
            </p>
            <Button size="sm" onClick={list.reload}>
              Retry
            </Button>
          </div>
        </div>
      ) : list.loading && tasks.length === 0 ? (
        <div className="grid" style={{ gap: "var(--s3)" }} aria-hidden="true">
          <div className="skeleton" style={{ height: 112 }} />
          <div className="skeleton" style={{ height: 112 }} />
          <div className="skeleton" style={{ height: 112 }} />
        </div>
      ) : tasks.length === 0 ? (
        <div className="panel">
          <div className="empty">
            <span className="empty__mark" aria-hidden="true">
              ∅
            </span>
            <h3>No tasks match</h3>
            <p className="muted">
              {filtered
                ? "Try loosening the filters above."
                : "Every list has to start somewhere. Create the first task."}
            </p>
            <Button variant="primary" size="sm" onClick={() => setDrawerOpen(true)}>
              New task
            </Button>
          </div>
        </div>
      ) : (
        <div className="stagger" style={{ display: "grid", gap: "var(--s3)" }}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      <Pagination
        page={pagination?.page || page}
        totalPages={pagination?.totalPages || 0}
        total={pagination?.total || 0}
        limit={pagination?.limit || LIMIT}
        onChange={(nextPage) =>
          setQuery({ page: nextPage === 1 ? undefined : nextPage })
        }
      />

      <TaskForm
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        statuses={statuses}
        categories={categories}
        principals={isAdmin ? principals : []}
        onSaved={() => list.reload()}
      />
    </AppShell>
  );
}
