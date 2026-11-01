import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, ApiError } from "./api";
import { useAuth } from "./auth.jsx";
import { clearWorkspace, loadWorkspace, saveWorkspace } from "./workspaceStore";

const WorkspaceContext = createContext(null);

/**
 * Owns the active workspace. Tasks and categories are resolved from the
 * `X-Workspace-Id` header server-side, so every screen must know which
 * workspace to act in before its first request.
 *
 * - Users only appear in the workspaces they are members of (each entry
 *   carries their role + permission codes for UI gating).
 * - Platform admins receive every workspace; they may work without a
 *   selection on reads (sudo mode) but writes still need a header.
 * - The selection survives refreshes via workspaceStore.
 */
export function WorkspaceProvider({ children }) {
  const { token, isAuthenticated, isAdmin, reportAuthError } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeId, setActiveId] = useState(() => loadWorkspace());
  const [status, setStatus] = useState("idle");
  // Bumped externally (e.g. after redeeming an invite) to re-run the loader.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setWorkspaces([]);
      setActiveId(null);
      clearWorkspace();
      setStatus("idle");
      return () => {
        cancelled = true;
      };
    }

    setStatus("loading");
    api
      .listWorkspaces(token)
      .then((data) => {
        if (cancelled) return;
        const list = data?.workspaces || [];
        setWorkspaces(list);
        setActiveId((current) => {
          const stillValid =
            current && list.some((w) => w.id === current);
          const next = stillValid
            ? current
            : isAdmin && data?.scope === "all"
              ? (list[0]?.id ?? null)
              : (list[0]?.id ?? null);
          if (next !== current) saveWorkspace(next);
          return next;
        });
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        // The principal may legitimately have no memberships yet.
        if (err instanceof ApiError && err.status === 404) {
          setWorkspaces([]);
          setStatus("ready");
          return;
        }
        reportAuthError(err);
        setStatus("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated, isAdmin, reportAuthError, refreshKey]);

  const setActiveWorkspace = useCallback((id) => {
    saveWorkspace(id);
    setActiveId(id);
  }, []);

  /** Re-fetch the membership list (e.g. after an invite redemption). */
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  const active = useMemo(
    () => workspaces.find((w) => w.id === activeId) || null,
    [workspaces, activeId],
  );

  const hasPermission = useCallback(
    (code) => {
      if (isAdmin) return true; // platform admins pass every guard server-side
      return Boolean(active?.role?.permissions?.includes(code));
    },
    [isAdmin, active],
  );

  const value = useMemo(
    () => ({
      workspaces,
      active,
      workspaceId: activeId,
      hasPermission,
      setActiveWorkspace,
      status,
      refresh,
    }),
    [workspaces, activeId, active, hasPermission, setActiveWorkspace, status, refresh],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
