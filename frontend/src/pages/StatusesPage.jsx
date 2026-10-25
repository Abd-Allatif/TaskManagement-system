import { useState } from "react";
import { AppShell } from "../components/AppShell.jsx";
import {
  Badge,
  Button,
  ConfirmDialog,
  LoadingRow,
  Modal,
  Panel,
  TextInput,
  statusTone,
} from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useMutation, useResource } from "../lib/useResource.js";

/**
 * Workflow lifecycle. Reads use /api/statuses (any principal) while writes go
 * through /api/admin/statuses, which only administrators may call.
 */
export function StatusesPage() {
  const { token, isAdmin, reportAuthError } = useAuth();
  const toast = useToast();

  const list = useResource((signal) => api.listStatuses(token), [token], {
    onError: reportAuthError,
  });
  const statuses = list.data?.statuses || [];
  const loading = list.loading && statuses.length === 0;

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ code: "", label: "" });
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);

  const save = useMutation(async (payload) =>
    editing?.id
      ? api.updateStatus(editing.id, payload, token)
      : api.createStatus(payload, token),
  );
  const remove = useMutation(async () => api.deleteStatus(confirm.id, token));

  const openEditor = (status = null) => {
    setEditing(status || {});
    setForm({
      code: status?.code || "",
      label: status?.label || "",
    });
    setErrors({});
  };

  const closeEditor = () => {
    setEditing(null);
    setErrors({});
  };

  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    const code = form.code.trim().toUpperCase().replace(/\s+/g, "_");
    const label = form.label.trim();

    if (!code) next.code = "Code is required";
    else if (code.length > 50) next.code = "Code must be 50 characters or less";
    if (!label) next.label = "Label is required";
    else if (label.length > 100) next.label = "Label must be 100 characters or less";

    setErrors(next);
    if (Object.keys(next).length) return;

    try {
      await save.run({ code, label });
      toast.success(editing?.id ? "Status updated." : "Status created.");
      closeEditor();
      list.reload();
    } catch (err) {
      setErrors(err?.fields || {});
      toast.error(err?.message || "Could not save the status.");
    }
  };

  const onDelete = async () => {
    try {
      await remove.run();
      toast.success("Status deleted.");
      setConfirm(null);
      list.reload();
    } catch (err) {
      setConfirm(null);
      toast.error(err?.message || "Could not delete the status.");
    }
  };

  return (
    <AppShell
      eyebrow={isAdmin ? "Administration" : "Reference"}
      title="Workflow statuses"
      actions={
        isAdmin ? (
          <Button variant="primary" size="sm" onClick={() => openEditor()}>
            New status
          </Button>
        ) : (
          <Badge tone="neutral" dot>Read only</Badge>
        )
      }
    >
      <Panel title={`Lifecycle (${statuses.length})`}>
        {loading ? (
          <LoadingRow label="Loading statuses" />
        ) : list.error ? (
          <p className="muted">{list.error.message}</p>
        ) : statuses.length === 0 ? (
          <p className="muted">
            No statuses found. Run <code>npm run seed</code> in the backend to
            install the default lifecycle.
          </p>
        ) : (
          <div>
            {statuses.map((status) => (
              <div className="admin-row" key={status.id}>
                <span
                  className="swatch"
                  style={{
                    width: 12,
                    height: 34,
                    background: statusTone(status.code) === "ok" ? "#0e7c5a"
                      : statusTone(status.code) === "cobalt" ? "#1f3fd8"
                      : statusTone(status.code) === "warn" ? "#a86400"
                      : statusTone(status.code) === "danger" ? "#c2240a"
                      : "#6c7480",
                  }}
                  aria-hidden="true"
                />
                <span className="admin-row__grow">
                  <span style={{ fontWeight: 700 }}>{status.label}</span>
                  <span
                    className="label"
                    style={{ display: "block", color: "var(--ink-4)" }}
                  >
                    {status.code}
                  </span>
                </span>
                <span
                  className={`badge badge--${statusTone(status.code)}`}
                  title="Badge tone"
                >
                  <span className="badge__dot" aria-hidden="true" />
                  {statusTone(status.code)}
                </span>
                {isAdmin ? (
                  <span style={{ display: "flex", gap: 6 }}>
                    <Button size="sm" variant="ghost" onClick={() => openEditor(status)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(status)}>
                      ✕
                    </Button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? "Edit status" : "New status"}
        onClose={closeEditor}
        footer={
          <>
            <Button variant="ghost" onClick={closeEditor} disabled={save.loading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} loading={save.loading}>
              {editing?.id ? "Save changes" : "Create"}
            </Button>
          </>
        }
      >
        <form
          onSubmit={submit}
          style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}
        >
          <TextInput
            label="Code"
            hint="unique · uppercase · max 50"
            placeholder="IN_REVIEW"
            value={form.code}
            error={errors.code}
            maxLength={50}
            disabled={Boolean(editing?.id)}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
          <TextInput
            label="Label"
            hint="shown in the UI · max 100"
            placeholder="In review"
            value={form.label}
            error={errors.label}
            maxLength={100}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
          {save.error ? <p className="field__error">{save.error.message}</p> : null}
          <p className="label" style={{ textAlign: "center" }}>
            {editing?.id
              ? "Renaming a code re-keys every task in that state"
              : "The code determines how tasks are bucketed in API filters"}
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete this status?"
        message="Tasks that still use this status will fail to reference it."
        confirmLabel="Delete status"
        loading={remove.loading}
        onConfirm={onDelete}
        onCancel={() => setConfirm(null)}
      />
    </AppShell>
  );
}
