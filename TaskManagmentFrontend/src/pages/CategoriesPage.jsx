import { useState } from "react";
import { AppShell } from "../components/AppShell.jsx";
import {
  Button,
  ConfirmDialog,
  LoadingRow,
  Modal,
  Panel,
  Field,
  TextInput,
} from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { formatDate } from "../lib/format.js";
import { useMutation, useResource } from "../lib/useResource.js";

/**
 * Categories are readable and creatable by every principal; edits and deletes
 * still go through the admin middleware, so those controls appear only for
 * administrators.
 */
export function CategoriesPage() {
  const { token, isAdmin, reportAuthError } = useAuth();
  const toast = useToast();

  const list = useResource((signal) => api.listCategories(token), [token], {
    onError: reportAuthError,
  });
  const categories = list.data?.categories || [];
  const loading = list.loading && categories.length === 0;

  const [editing, setEditing] = useState(null); // null | {} (create) | category
  const [form, setForm] = useState({ name: "", color: "" });
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);

  const save = useMutation(async (payload) =>
    editing?.id
      ? api.updateCategory(editing.id, payload, token)
      : api.createCategory(payload, token),
  );
  const remove = useMutation(async () => api.deleteCategory(confirm.id, token));

  const openEditor = (category = null) => {
    setEditing(category || {});
    setForm({
      name: category?.name || "",
      color: category?.color || "",
    });
    setErrors({});
  };

  const closeEditor = () => {
    setEditing(null);
    setErrors({});
  };

  const submit = async (event) => {
    event.preventDefault();
    const next = { ...errors };
    const name = form.name.trim();

    if (!name) next.name = "Name is required";
    else if (name.length > 100) next.name = "Name must be 100 characters or less";

    setErrors(next);
    if (next.name) return;

    try {
      await save.run({
        name,
        color: form.color.trim() || null,
      });
      toast.success(editing?.id ? "Category updated." : "Category created.");
      closeEditor();
      list.reload();
    } catch (err) {
      setErrors(err?.fields || {});
      toast.error(err?.message || "Could not save the category.");
    }
  };

  const onDelete = async () => {
    try {
      await remove.run();
      toast.success("Category deleted.");
      setConfirm(null);
      list.reload();
    } catch (err) {
      setConfirm(null);
      toast.error(err?.message || "Could not delete the category.");
    }
  };

  return (
    <AppShell
      eyebrow={isAdmin ? "Administration" : "Reference"}
      title="Categories"
      actions={
        <Button variant="primary" size="sm" onClick={() => openEditor()}>
          New category
        </Button>
      }
    >
      <Panel
        title={`Collections (${categories.length})`}
        action={
          <Button size="sm" variant="ghost" onClick={() => openEditor()}>
            + Add
          </Button>
        }
      >
        {loading ? (
          <LoadingRow label="Loading categories" />
        ) : list.error ? (
          <p className="muted">{list.error.message}</p>
        ) : categories.length === 0 ? (
          <p className="muted">No categories exist yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 54 }}>Colour</th>
                  <th>Name</th>
                  <th>Created</th>
                  <th style={{ width: isAdmin ? 130 : 0 }} />
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <span
                        className="swatch"
                        style={{
                          width: 26,
                          height: 26,
                          background: category.color || "var(--paper-sunk)",
                          borderStyle: "solid",
                        }}
                        aria-hidden="true"
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{category.name}</td>
                    <td className="mono" style={{ fontSize: "0.78rem" }}>
                      {formatDate(category.createdAt)}
                    </td>
                    {isAdmin ? (
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <Button size="sm" variant="ghost" onClick={() => openEditor(category)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirm(category)}>
                            ✕
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? "Edit category" : "New category"}
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
            label="Name"
            hint="required · max 100"
            placeholder="e.g. Infrastructure"
            value={form.name}
            error={errors.name}
            maxLength={100}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
          />
          <Field
            label={
              <>
                <span>Colour</span>
                <span className="field__hint">any CSS colour, optional</span>
              </>
            }
          >
            <div style={{ display: "flex", gap: "var(--s2)", alignItems: "center" }}>
              <input
                type="color"
                className="input"
                style={{ flex: "none", width: 56, padding: 4, minHeight: 42 }}
                value={/^#[0-9a-f]{6}$/i.test(form.color) ? form.color : "#e8410e"}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                aria-label="Pick a colour"
              />
              <input
                className="input"
                placeholder="#e8410e or vermilion"
                value={form.color}
                maxLength={50}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                style={{ fontFamily: "var(--font-mono)" }}
                aria-label="Colour value"
              />
            </div>
          </Field>
          {save.error ? (
            <p className="field__error">{save.error.message}</p>
          ) : null}
          <p className="label" style={{ textAlign: "center" }}>
            Categories colour-code tasks across the whole workspace
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete this category?"
        message="Deleting a category removes it from every task that references it."
        confirmLabel="Delete category"
        loading={remove.loading}
        onConfirm={onDelete}
        onCancel={() => setConfirm(null)}
      />
    </AppShell>
  );
}
