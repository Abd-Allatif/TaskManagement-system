import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useMutation, useResource } from "../lib/useResource.js";
import {
  Alert,
  Button,
  Checkbox,
  ChipMultiSelect,
  Drawer,
  Select,
  TextArea,
  TextInput,
} from "./ui.jsx";
import { useToast } from "./Toast.jsx";

const pad = (value) => String(value).padStart(2, "0");

/** ISO string -> value accepted by <input type="datetime-local">. */
function toLocalInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const emptyForm = {
  title: "",
  description: "",
  deadline: "",
  statusId: "",
  parentTaskId: "",
  endFlag: false,
  categoryIds: [],
  assignmentKeys: [],
  assignSelf: false,
};

/**
 * Create/edit drawer. Mirrors the backend validators so the user sees field
 * errors before a round-trip, and surfaces express-validator `errors[]` if the
 * server rejects anyway.
 */
export function TaskForm({
  open,
  onClose,
  task,
  statuses = [],
  categories = [],
  principals = [],
  onSaved,
  /**
   * When creating a sub-task from a parent's detail page, pass the parent id.
   * The parent is pre-filled and locked for the whole session.
   */
  presetParentId = "",
}) {
  const { token, isAdmin, principal } = useAuth();
  const toast = useToast();

  const isEdit = Boolean(task?.id);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  // Candidate parents: only open, top-level tasks (excluding the edited task).
  const { data: parentData } = useResource(
    (signal) =>
      api.listTasks(
        { limit: 100, sortBy: "createDate", sortOrder: "desc" },
        token,
      ),
    [token, open],
    { enabled: open },
  );

  useEffect(() => {
    if (!open) return;

    if (task) {
      setForm({
        title: task.title || "",
        description: task.description || "",
        deadline: toLocalInput(task.deadline),
        statusId: task.statusId || "",
        parentTaskId: task.parentTaskId || "",
        endFlag: Boolean(task.endFlag),
        categoryIds: (task.categories || []).map((pivot) => pivot.categoryId),
        assignmentKeys: (task.assignments || []).map(
          (a) => `${a.assignableType}:${a.assignableId}`,
        ),
        assignSelf: false,
      });
    } else {
      setForm({
        ...emptyForm,
        parentTaskId: presetParentId,
        statusId: statusesRef.current[0]?.id || "",
        assignSelf: !isAdmin,
      });
    }

    setErrors({});
    setFormError(null);
  }, [open, task, isAdmin, presetParentId]);

  const parentOptions = useMemo(() => {
    const all = parentData?.tasks || [];
    return all.filter((t) => !t.parentTaskId && t.id !== task?.id);
  }, [parentData, task?.id]);

  const principalOptions = useMemo(
    () =>
      principals.map((p) => ({
        id: `${p.type}:${p.id}`,
        label: p.type === "ADMIN" ? `${p.name} (admin)` : p.name,
        color: p.type === "ADMIN" ? "#e8410e" : "#1f3fd8",
      })),
    [principals],
  );

  const save = useMutation(async (payload) =>
    isEdit
      ? api.updateTask(task.id, payload, token)
      : api.createTask(payload, token),
  );

  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () => {
    const payload = {
      title: form.title.trim(),
      statusId: form.statusId || undefined,
      parentTaskId: form.parentTaskId || undefined,
      categories: form.categoryIds,
    };

    const description = form.description.trim();
    if (description) payload.description = description;
    else if (isEdit) payload.description = "";

    if (form.deadline) payload.deadline = new Date(form.deadline).toISOString();
    if (isEdit) payload.endFlag = form.endFlag;

    if (isAdmin) {
      payload.assignments = form.assignmentKeys.map((key) => {
        const [assignableType, assignableId] = key.split(":");
        return { assignableType, assignableId };
      });
    } else {
      payload.assignments =
        form.assignSelf && principal
          ? [{ assignableType: "USER", assignableId: principal.id }]
          : [];
    }

    return payload;
  };

  const validate = () => {
    const next = {};
    const title = form.title.trim();

    if (!title) next.title = "Title is required";
    else if (title.length > 200)
      next.title = "Title must be 200 characters or less";

    if (form.deadline) {
      const date = new Date(form.deadline);
      if (Number.isNaN(date.getTime())) next.deadline = "Deadline must be a valid date";
      else if (date <= new Date())
        next.deadline = "Deadline must be in the future";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    try {
      const result = await save.run(buildPayload());
      toast.success(isEdit ? "Task updated." : "Task created.");
      onSaved?.(result?.task || null);
      onClose?.();
    } catch (err) {
      if (err?.fields) setErrors((prev) => ({ ...prev, ...err.fields }));
      setFormError(err?.message || "Could not save the task.");
    }
  };

  return (
    <Drawer
      open={open}
      subtitle={isEdit ? "Edit task" : presetParentId ? "New sub-task" : "New task"}
      title={isEdit ? task?.title || "Task" : "Create a task"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={save.loading}>
            {isEdit ? "Save changes" : presetParentId ? "Create sub-task" : "Create task"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: "var(--s5)" }}
      >
        {formError ? <Alert tone="danger" title="Save failed">{formError}</Alert> : null}

        <TextInput
          label="Title"
          hint="required · max 200"
          placeholder="e.g. Prepare Q4 compliance report"
          value={form.title}
          error={errors.title}
          maxLength={200}
          onChange={(e) => set("title")(e.target.value)}
          autoFocus
        />

        <TextArea
          label="Description"
          hint="optional"
          placeholder="Context, acceptance criteria, links…"
          value={form.description}
          error={errors.description}
          onChange={(e) => set("description")(e.target.value)}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "var(--s4)",
          }}
        >
          <Select
            label="Status"
            value={form.statusId}
            error={errors.statusId}
            onChange={(e) => set("statusId")(e.target.value)}
          >
            <option value="">Default (PENDING)</option>
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label} ({status.code})
              </option>
            ))}
          </Select>

          <TextInput
            label="Deadline"
            hint="must be in the future"
            type="datetime-local"
            value={form.deadline}
            error={errors.deadline}
            onChange={(e) => set("deadline")(e.target.value)}
          />
        </div>

        <Select
          label="Parent task"
          hint={
            presetParentId
              ? "locked · this task is the parent"
              : "optional · creates a sub-task"
          }
          value={form.parentTaskId}
          error={errors.parentTaskId}
          disabled={Boolean(presetParentId)}
          onChange={(e) => set("parentTaskId")(e.target.value)}
        >
          <option value="">None — top-level task</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </Select>

        <div className="field">
          <span className="field__label">
            <span>Categories</span>
            <span className="field__hint">
              {form.categoryIds.length} selected
            </span>
          </span>
          <ChipMultiSelect
            options={categories.map((c) => ({
              id: c.id,
              label: c.name,
              color: c.color || "var(--ink-4)",
            }))}
            value={form.categoryIds}
            onChange={set("categoryIds")}
            emptyLabel="No categories yet — add one on the Categories page."
          />
          {errors.categories ? (
            <p className="field__error">{errors.categories}</p>
          ) : null}
        </div>

        <div className="field">
          <span className="field__label">
            <span>Assignments</span>
            <span className="field__hint">
              {isAdmin
                ? `${form.assignmentKeys.length} selected`
                : "members can assign to themselves"}
            </span>
          </span>

          {isAdmin ? (
            <ChipMultiSelect
              options={principalOptions}
              value={form.assignmentKeys}
              onChange={set("assignmentKeys")}
              emptyLabel="No users or admins available."
            />
          ) : (
            <Checkbox
              label="Assign this task to me"
              checked={form.assignSelf}
              onChange={(e) => set("assignSelf")(e.target.checked)}
            />
          )}
          {errors.assignments ? (
            <p className="field__error">{errors.assignments}</p>
          ) : null}
        </div>

        {isEdit ? (
          <div className="field">
            <span className="field__label">
              <span>Completion flag</span>
            </span>
            <Checkbox
              label="Mark as closed (endFlag)"
              checked={form.endFlag}
              onChange={(e) => set("endFlag")(e.target.checked)}
            />
          </div>
        ) : null}
      </form>
    </Drawer>
  );
}
