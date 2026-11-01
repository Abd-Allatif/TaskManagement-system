import { useMemo } from "react";
import { api } from "./api.js";
import { useAuth } from "./auth.jsx";
import { useResource } from "./useResource.js";
import { useWorkspace } from "./workspace.jsx";

/** Statuses and categories are needed by most screens — load them together. */
export function useReference() {
  const { token, reportAuthError } = useAuth();
  const { workspaceId, isAdmin } = useWorkspace();

  const statuses = useResource((signal) => api.listStatuses(token), [token], {
    onError: reportAuthError,
  });
  // Categories are workspace-scoped. An admin in sudo mode (no workspace
  // selected) may still list them, members cannot.
  const categories = useResource(
    (signal) => api.listCategories(token, workspaceId),
    [token, workspaceId],
    {
      enabled: Boolean(workspaceId) || isAdmin,
      onError: reportAuthError,
    },
  );

  return {
    statuses: statuses.data?.statuses || [],
    categories: categories.data?.categories || [],
    statusesError: statuses.error,
    categoriesError: categories.error,
    loading: statuses.loading || categories.loading,
    reloadStatuses: statuses.reload,
    reloadCategories: categories.reload,
  };
}

/**
 * Assignable principals for the task forms. USER assignees are validated
 * against workspace membership server-side, so members come from the active
 * workspace's member list; admins are assignable globally but only an admin
 * principal may list them.
 */
export function usePrincipals(enabled) {
  const { token, isAdmin, reportAuthError } = useAuth();
  const { workspaceId } = useWorkspace();
  const membersEnabled = Boolean(enabled) && Boolean(workspaceId);
  const adminListEnabled = Boolean(enabled) && isAdmin;

  const members = useResource(
    (signal) => api.listMembers(workspaceId, token),
    [token, workspaceId],
    {
      enabled: membersEnabled,
      onError: reportAuthError,
    },
  );
  const admins = useResource((signal) => api.adminAdmins(token), [token], {
    enabled: adminListEnabled,
    onError: reportAuthError,
  });

  return useMemo(() => {
    const people = (members.data?.members || []).map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      type: "USER",
      role: m.role?.name || null,
    }));
    if (!adminListEnabled) return people;
    const staff = (admins.data?.admins || []).map((admin) => ({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      type: "ADMIN",
    }));
    return [...people, ...staff];
  }, [adminListEnabled, members.data, admins.data]);
}
