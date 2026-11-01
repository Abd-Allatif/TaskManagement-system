import { useState } from "react";
import { AppShell } from "../components/AppShell.jsx";
import {
  Badge,
  Button,
  ChipMultiSelect,
  ConfirmDialog,
  EmptyState,
  LoadingRow,
  Modal,
  Panel,
  TextInput,
} from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useMutation, useResource } from "../lib/useResource.js";
import { useWorkspace } from "../lib/workspace.jsx";

/**
 * Role studio for the active workspace. The OWNER/ADMIN/USER system roles are
 * immutable and shown as reference; custom roles can be created, renamed,
 * re-permissioned and deleted here (all still enforced server-side).
 */
export function RolesPage() {
  const { token, reportAuthError } = useAuth();
  const { active, workspaceId, hasPermission } = useWorkspace();
  const toast = useToast();

  const canCreate = hasPermission("role.create");
  const canUpdate = hasPermission("role.update");
  const canDelete = hasPermission("role.delete");

  const rolesRes = useResource(
    (signal) => api.listRoles(workspaceId, token),
    [token, workspaceId],
    { enabled: Boolean(workspaceId), onError: reportAuthError },
  );
  const catalogRes = useResource(
    (signal) => api.listPermissions(token),
    [token],
    {
      // Only useful when the caller could actually change roles.
      enabled: Boolean(token) && canUpdate,
      onError: reportAuthError,
    },
  );

  const roles = rolesRes.data?.roles || [];
  const catalog = catalogRes.data?.permissions || [];
  const loading = rolesRes.loading && roles.length === 0;

  /** Expanded role id (accordion) while editing its permission set. */
  const [expanded, setExpanded] = useState(null);
  const [draftCodes, setDraftCodes] = useState([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const createRole = useMutation(async () => {
    const result = await api.createRole(workspaceId, { name }, token);
    setName("");
    setCreating(false);
    return result;
  });
  const savePermissions = useMutation(async ({ roleId, permissionCodes }) =>
    api.setRolePermissions(workspaceId, roleId, { permissionCodes }, token),
  );
  const deleteRole = useMutation(async (roleId) =>
    api.deleteRole(workspaceId, roleId, token),
  );

  const openEditor = (role) => {
    setExpanded(role.id === expanded ? null : role.id);
    setDraftCodes((role.rolePermissions || []).map((rp) => rp.permission.code));
  };

  const chipOptions = catalog.map((p) => ({
    id: p.code,
    label: p.code,
    title: p.label,
  }));

  return (
    <AppShell
      eyebrow={`Workspace · ${active?.name || "…"}`.trim()}
      title="Roles & permissions"
      actions={
        canCreate ? (
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            New role
          </Button>
        ) : null
      }
    >
      {loading ? (
        <Panel title="Roles" bodyTight>
          <LoadingRow label="Loading roles" />
        </Panel>
      ) : rolesRes.error ? (
        <Panel title="Roles">
          <p className="muted">{rolesRes.error.message}</p>
        </Panel>
      ) : (
        <Panel title={`Roles (${roles.length})`} bodyTight>
          {roles.length === 0 ? (
            <EmptyState
              mark="※"
              title="No roles yet"
              description="Every workspace starts with OWNER, ADMIN and USER system roles — something went wrong if none are listed."
            />
          ) : null}
          {roles.length > 0 && roles.every((role) => role.isSystem) && canCreate ? (
            <div
              className="alert alert--info"
              style={{ margin: "var(--s4)", marginBottom: 0 }}
              role="status"
            >
              <div className="alert__body">
                <strong>All three roles on this workspace are system roles</strong>
                <span>
                  They cannot be edited — create a custom role to compose a new
                  permission set; it becomes fully editable here.
                </span>
              </div>
              <div style={{ marginTop: 10 }}>
                <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                  Create a custom role
                </Button>
              </div>
            </div>
          ) : null}
          {roles.map((role) => {
            const codes = (role.rolePermissions || []).map(
              (rp) => rp.permission.code,
            );
            const memberCount = role._count?.memberships ?? role.memberships?.length ?? 0;
            const isExpanded = expanded === role.id;
            return (
              <div
                key={role.id}
                className="panel panel--flat"
                style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--s3)",
                    flexWrap: "wrap",
                  }}
                >
                  <strong style={{ flex: "1 1 auto", minWidth: 160 }}>
                    {role.name}{" "}
                    {memberCount > 0 ? (
                      <span className="field__hint">
                        ({memberCount} member{memberCount === 1 ? "" : "s"})
                      </span>
                    ) : (
                      <span className="field__hint">(no members)</span>
                    )}
                  </strong>
                  {role.isSystem ? (
                    <Badge tone="neutral">system · immutable</Badge>
                  ) : (
                    <Badge tone="accent">custom</Badge>
                  )}
                  <span className="field__hint mono">
                    {codes.length} permission{codes.length === 1 ? "" : "s"}
                  </span>
                  {canUpdate && !role.isSystem ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditor(role)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? "Close" : "Edit permissions"}
                    </Button>
                  ) : null}
                </div>

                {isExpanded ? (
                  <div style={{ marginTop: "var(--s3)" }}>
                    <ChipMultiSelect
                      options={chipOptions}
                      value={draftCodes}
                      onChange={setDraftCodes}
                      emptyLabel=""
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: "var(--s2)",
                        justifyContent: "flex-end",
                        marginTop: "var(--s3)",
                      }}
                    >
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={savePermissions.loading}
                        onClick={() => setExpanded(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        loading={savePermissions.loading}
                        onClick={() =>
                          savePermissions
                            .run({ roleId: role.id, permissionCodes: draftCodes })
                            .then(() => {
                              toast.success("Permissions updated.");
                              rolesRes.reload();
                              setExpanded(null);
                            })
                            .catch((err) =>
                              toast.error(
                                err?.message || "Could not save permissions.",
                              ),
                            )
                        }
                      >
                        Save permissions
                      </Button>
                      {canDelete && memberCount === 0 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDelete(role)}
                        >
                          Delete role
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div
                    className="mono muted"
                    style={{ marginTop: 6, fontSize: "0.72rem" }}
                  >
                    {codes.length ? codes.join(" · ") : "no permissions"}
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
      )}

      <Modal
        open={creating}
        title="New role"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={createRole.loading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={createRole.loading}
              onClick={async () => {
                setNameError(null);
                try {
                  await createRole.run();
                  rolesRes.reload();
                } catch (err) {
                  setNameError(err?.message || "Could not create the role.");
                }
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <form
          onSubmit={(event) => event.preventDefault()}
          style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}
        >
          <TextInput
            label="Role name"
            hint="must be unique within the workspace · max 60"
            placeholder="e.g. Reviewer"
            value={name}
            error={nameError}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <p className="label" style={{ textAlign: "center" }}>
            New roles start with no permissions — edit them right after.
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Delete “${confirmDelete?.name}”?`}
        message="This cannot be undone. Members already on this role must be reassigned first — the server refuses otherwise."
        confirmLabel="Delete"
        loading={deleteRole.loading}
        onConfirm={async () => {
          try {
            await deleteRole.run(confirmDelete.id);
            toast.success("Role deleted.");
            rolesRes.reload();
          } catch (err) {
            toast.error(err?.message || "Could not delete the role.");
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </AppShell>
  );
}
