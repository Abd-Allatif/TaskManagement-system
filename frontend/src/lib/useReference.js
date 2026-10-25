import { useMemo } from "react";
import { api } from "./api.js";
import { useAuth } from "./auth.jsx";
import { useResource } from "./useResource.js";

/** Statuses and categories are needed by most screens — load them together. */
export function useReference() {
  const { token, reportAuthError } = useAuth();

  const statuses = useResource((signal) => api.listStatuses(token), [token], {
    onError: reportAuthError,
  });
  const categories = useResource((signal) => api.listCategories(token), [token], {
    onError: reportAuthError,
  });

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
 * Assignable principals (members + admins). Only admins may list them, so the
 * request is skipped entirely for regular members.
 */
export function usePrincipals(enabled) {
  const { token, isAdmin, reportAuthError } = useAuth();
  const active = Boolean(enabled) && isAdmin;

  const users = useResource((signal) => api.adminUsers(token), [token], {
    enabled: active,
    onError: reportAuthError,
  });
  const admins = useResource((signal) => api.adminAdmins(token), [token], {
    enabled: active,
    onError: reportAuthError,
  });

  return useMemo(() => {
    if (!active) return [];
    const members = (users.data?.users || []).map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      type: "USER",
    }));
    const staff = (admins.data?.admins || []).map((admin) => ({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      type: "ADMIN",
    }));
    return [...members, ...staff];
  }, [active, users.data, admins.data]);
}
