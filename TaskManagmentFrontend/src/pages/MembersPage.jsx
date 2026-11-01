import { useMemo, useState } from "react";
import { AppShell } from "../components/AppShell.jsx";
import {
  Alert,
  Avatar,
  Button,
  ConfirmDialog,
  EmptyState,
  LoadingRow,
  Modal,
  Panel,
  Select,
  TextInput,
} from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { formatDate } from "../lib/format.js";
import { useMutation, useResource } from "../lib/useResource.js";
import { useWorkspace } from "../lib/workspace.jsx";

/**
 * Workspace membership console: change roles, invite people by email
 * (tokens are shared manually — no email is sent), remove members and, for
 * the workspace owner, hand ownership to another member.
 *
 * Every mutation is permission-gated server-side; the UI only hides controls
 * based on the active workspace's role permission codes.
 */
export function MembersPage() {
  const { token, reportAuthError, principal, isAdmin } = useAuth();
  const { active, workspaceId, hasPermission } = useWorkspace();
  const toast = useToast();

  // Platform admins pass every permission guard server-side, but the API
  // refuses admin-created invites (no user account to attach invitedById) —
  // so the invite affordance is hidden for them instead of erroring.
  const canInvite = !isAdmin && hasPermission("member.invite");
  const canAssign = hasPermission("member.role.assign");
  const canRemove = hasPermission("member.remove");
  const isOwner = Boolean(active?.isOwner);

  const membersRes = useResource(
    (signal) => api.listMembers(workspaceId, token),
    [token, workspaceId],
    { enabled: Boolean(workspaceId), onError: reportAuthError },
  );
  const rolesRes = useResource(
    (signal) => api.listRoles(workspaceId, token),
    [token, workspaceId],
    { enabled: Boolean(workspaceId), onError: reportAuthError },
  );
  const invitesRes = useResource(
    (signal) => api.listInvites(workspaceId, token),
    [token, workspaceId],
    {
      enabled: Boolean(workspaceId) && canInvite,
      onError: reportAuthError,
    },
  );

  const members = membersRes.data?.members || [];
  const roles = (rolesRes.data?.roles || []).filter((r) => r.name !== "OWNER");
  const invites = invitesRes.data?.invites || [];
  const loading = membersRes.loading && members.length === 0;

  const roleOptions = useMemo(
    () => roles.map((r) => ({ value: r.id, label: `${r.name} role` })),
    [roles],
  );

  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", roleId: "" });
  const [inviteError, setInviteError] = useState(null);
  const [issuedToken, setIssuedToken] = useState(null);
  const [confirmRemoval, setConfirmRemoval] = useState(null);

  const createInvite = useMutation(async (payload) =>
    api.createInvite(workspaceId, payload, token),
  );
  const cancelInvite = useMutation(async (inviteId) =>
    api.cancelInvite(workspaceId, inviteId, token),
  );
  const changeRole = useMutation(async ({ userId, roleId }) =>
    api.updateMemberRole(workspaceId, userId, { roleId }, token),
  );
  const removeMember = useMutation(async (userId) =>
    api.removeMember(workspaceId, userId, token),
  );
  const transfer = useMutation(async (userId) =>
    api.transferOwnership(workspaceId, { userId }, token),
  );

  const submitInvite = async (event) => {
    event.preventDefault();
    setInviteError(null);
    try {
      const result = await createInvite.run({
        email: inviteForm.email,
        roleId: inviteForm.roleId || roles[0]?.id,
      });
      setIssuedToken(result?.token || null);
      setInviteForm({ email: "", roleId: "" });
      setInviting(false);
      invitesRes.reload();
    } catch (err) {
      setInviteError(err?.message || "Could not create the invite.");
    }
  };

  const memberName = (member) => member?.user?.name || "Member";

  return (
    <AppShell
      eyebrow={`Workspace · ${active?.name || "…"}`.trim()}
      title="Members"
      actions={
        canInvite ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setInviteForm((f) => ({ ...f, roleId: roles[0]?.id || "" }));
              setIssuedToken(null);
              setInviting(true);
            }}
          >
            Invite member
          </Button>
        ) : null
      }
    >
      {issuedToken ? (
        <Panel title="Invite token issued">
          <p className="muted">
            Share this token with the invitee — they redeem it on their profile
            or during registration.
          </p>
          <p
            className="mono"
            style={{
              background: "var(--paper-sunk)",
              padding: "10px 12px",
              borderRadius: 8,
              wordBreak: "break-all",
            }}
          >
            {issuedToken}
          </p>
        </Panel>
      ) : null}

      <Panel title={`Members (${members.length})`} bodyTight>
        {loading ? (
          <LoadingRow label="Loading members" />
        ) : membersRes.error ? (
          <Alert tone="danger" title="Could not load members">
            {membersRes.error.message}
          </Alert>
        ) : members.length === 0 ? (
          <EmptyState
            mark="☁"
            title="No members yet"
            description="Invite people with one-time tokens — they redeem the token on their profile or during registration."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th style={{ width: 170 }} />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isSelf = member.user?.id === principal?.id;
                  const memberIsOwner = active?.ownerUserId === member.user?.id;
                  return (
                    <tr key={member.id}>
                      <td>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <Avatar name={member.user?.name} />
                          <div>
                            <div style={{ fontWeight: 600 }}>{member.user?.name}</div>
                            <span
                              className="field__hint"
                              style={{ display: "block" }}
                            >
                              {member.user?.email}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {memberIsOwner ? (
                          <div style={{ display: "grid", gap: 2 }}>
                            <strong>{member.role?.name}</strong>
                            <span className="field__hint">
                              owner · role is fixed — use transfer
                            </span>
                          </div>
                        ) : !canAssign ? (
                          <strong>{member.role?.name}</strong>
                        ) : (
                          <Select
                            value={member.roleId}
                            aria-label={`Role for ${memberName(member)}`}
                            onChange={(event) =>
                              changeRole
                                .run({
                                  userId: member.user.id,
                                  roleId: event.target.value,
                                })
                                .then(() =>
                                  toast.success("Role updated."),
                                )
                                .catch((err) =>
                                  toast.error(
                                    err?.message || "Could not update the role.",
                                  ),
                                )
                            }
                          >
                            {roleOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: "0.78rem" }}>
                        {formatDate(member.user?.createdAt)}
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            justifyContent: "flex-end",
                          }}
                        >
                          {!memberIsOwner && !isSelf && isOwner ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={transfer.loading}
                              onClick={() =>
                                transfer
                                  .run(member.user.id)
                                  .then(() => toast.success("Ownership transferred."))
                                  .catch((err) =>
                                    toast.error(
                                      err?.message ||
                                        "Could not transfer ownership.",
                                    ),
                                  )
                              }
                            >
                              Make owner
                            </Button>
                          ) : null}
                          {canRemove && !memberIsOwner && !isSelf ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmRemoval(member)}
                            >
                              ✕
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {canAssign && roles.length > 0 && roles.every((role) => role.isSystem) ? (
          <div className="field__hint" style={{ padding: "10px 16px 14px" }}>
            The role list shows the fixed system roles (ADMIN, USER) plus any
            custom roles — create one on the Roles page and it appears here automatically.
          </div>
        ) : null}
      </Panel>

      {canInvite && invites.length > 0 ? (
        <Panel title={`Pending invites (${invites.length})`} bodyTight>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Expires</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id}>
                    <td>{invite.email}</td>
                    <td>{invite.role?.name}</td>
                    <td className="mono" style={{ fontSize: "0.78rem" }}>
                      {formatDate(invite.expiresAt)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={cancelInvite.loading}
                        onClick={() =>
                          cancelInvite
                            .run(invite.id)
                            .then(() => {
                              toast.success("Invite cancelled.");
                              invitesRes.reload();
                            })
                            .catch((err) =>
                              toast.error(
                                err?.message || "Could not cancel the invite.",
                              ),
                            )
                        }
                      >
                        Cancel
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Modal
        open={inviting}
        title="Invite a member"
        onClose={() => setInviting(false)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setInviting(false)}
              disabled={createInvite.loading}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={submitInvite} loading={createInvite.loading}>
              Create invite
            </Button>
          </>
        }
      >
        <form
          onSubmit={submitInvite}
          style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}
        >
          <TextInput
            label="Email"
            hint="the invitee must register or sign in with this address"
            placeholder="colleague@example.com"
            value={inviteForm.email}
            onChange={(e) =>
              setInviteForm((f) => ({ ...f, email: e.target.value }))
            }
            autoFocus
          />
          <Select
            label="Role"
            hint="applied when the invite is redeemed"
            value={inviteForm.roleId}
            onChange={(e) => setInviteForm((f) => ({ ...f, roleId: e.target.value }))}
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {inviteError ? <p className="field__error">{inviteError}</p> : null}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmRemoval)}
        title="Remove member"
        message={`Remove ${memberName(confirmRemoval)} from this workspace? They lose access immediately; their tasks stay.`}
        confirmLabel="Remove"
        loading={removeMember.loading}
        onConfirm={async () => {
          try {
            await removeMember.run(confirmRemoval.user.id);
            toast.success("Member removed.");
          } catch (err) {
            toast.error(err?.message || "Could not remove the member.");
          }
          setConfirmRemoval(null);
        }}
        onCancel={() => setConfirmRemoval(null)}
      />
    </AppShell>
  );
}
