import { useState } from "react";
import { AppShell } from "../components/AppShell.jsx";
import {
  Avatar,
  Badge,
  Button,
  IdPill,
  LoadingRow,
  Panel,
  RoleBadge,
  TextInput,
} from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { formatDateTime } from "../lib/format.js";
import { useResource } from "../lib/useResource.js";
import { useWorkspace } from "../lib/workspace.jsx";
import { useRouter } from "../router/router.jsx";

export function ProfilePage() {
  const { token, role, isAdmin, session, reportAuthError, signOut } = useAuth();
  const { refresh } = useWorkspace();
  const toast = useToast();
  const { navigate } = useRouter();

  const isAdminRealm = role === "ADMIN";
  const me = useResource(
    (signal) => (isAdminRealm ? api.meAdmin(token) : api.meUser(token)),
    [token, isAdminRealm],
    { onError: reportAuthError },
  );

  const [inviteCode, setInviteCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const redeemInvite = async (event) => {
    event.preventDefault();
    if (!inviteCode.trim()) return;
    setRedeeming(true);
    try {
      const result = await api.redeemInvite({ token: inviteCode.trim() }, token);
      setInviteCode("");
      toast.success(`Joined "${result?.workspace?.name || "workspace"}".`);
      // Pull the new membership into the switcher and select it.
      refresh();
    } catch (err) {
      toast.error(err?.message || "Could not redeem the invite.");
    } finally {
      setRedeeming(false);
    }
  };

  const profile =
    me.data?.admin || me.data?.user || session?.principal || null;

  if (me.loading && !profile) {
    return (
      <AppShell eyebrow="Account" title="Your profile">
        <div className="panel">
          <LoadingRow label="Loading profile" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="Account"
      title="Your profile"
      actions={
        <Button size="sm" variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      }
    >
      <div className="grid grid--halves">
        <Panel title="Identity">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s4)",
              marginBottom: "var(--s5)",
            }}
          >
            <Avatar name={profile?.name} size={56} />
            <div>
              <h2 style={{ fontSize: "1.15rem" }}>{profile?.name}</h2>
              <p className="muted mono" style={{ fontSize: "0.8rem" }}>
                {profile?.email}
              </p>
              <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                <RoleBadge role={role} />
                {profile?.emailVerifiedAt ? (
                  <Badge tone="ok" dot>Verified</Badge>
                ) : (
                  <Badge tone="warn" dot>Unverified</Badge>
                )}
              </div>
            </div>
          </div>

          <dl className="kv">
            <dt>Principal ID</dt>
            <dd className="mono" style={{ fontSize: "0.78rem" }}>
              <IdPill id={profile?.id} /> {profile?.id}
            </dd>
            <dt>Email verified</dt>
            <dd>{profile?.emailVerifiedAt ? formatDateTime(profile.emailVerifiedAt) : "no"}</dd>
            <dt>Account created</dt>
            <dd>{formatDateTime(profile?.createdAt)}</dd>
            <dt>Realm</dt>
            <dd>{isAdminRealm ? "Administrator directory" : "Member directory"}</dd>
          </dl>
        </Panel>

        <Panel title="Session">
          <p className="muted" style={{ marginBottom: "var(--s4)" }}>
            The API issues a stateless JWT valid for 7 days by default. Signing
            out clears it from this browser only — the token remains valid server
            side until it expires.
          </p>
          <dl className="kv">
            <dt>Role</dt>
            <dd>{isAdmin ? "ADMIN" : "USER"}</dd>
            <dt>Token</dt>
            <dd className="mono" style={{ fontSize: "0.76rem" }}>
              {session?.token ? `${session.token.slice(0, 24)}…` : "—"}
            </dd>
          </dl>
          <div style={{ marginTop: "var(--s5)", display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
            <Button size="sm" onClick={() => navigate("/tasks")}>
              Back to tasks
            </Button>
            <Button size="sm" variant="danger" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </Panel>

        {!isAdminRealm ? (
          <Panel title="Redeem an invite">
            <p className="muted" style={{ marginBottom: "var(--s4)" }}>
              Got an invite token from a workspace member? Paste it here to join
              — tokens are shared manually and expire after 7 days.
            </p>
            <form onSubmit={redeemInvite} style={{ display: "flex", gap: "var(--s2)" }}>
              <div style={{ flex: 1 }}>
                <TextInput
                  placeholder="paste the invite token"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  disabled={redeeming}
                />
              </div>
              <Button variant="primary" type="submit" loading={redeeming}>
                Join workspace
              </Button>
            </form>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
