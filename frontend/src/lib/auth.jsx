import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, ApiError } from "./api";
import {
  clearSession,
  loadSession,
  ROLES,
  roleFromToken,
  saveSession,
} from "./session";

const AuthContext = createContext(null);

/**
 * Owns the session. On boot it replays the stored JWT against the matching
 * `/me` endpoint so a stale or revoked token can never render a signed-in UI.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => loadSession());
  const [status, setStatus] = useState("checking");

  const applySession = useCallback((next) => {
    setSession(next);
    if (next) saveSession(next);
    else clearSession();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stored = loadSession();

    if (!stored?.token) {
      setStatus("ready");
      return () => {
        cancelled = true;
      };
    }

    const role =
      stored.role === ROLES.ADMIN || roleFromToken(stored.token) === ROLES.ADMIN
        ? ROLES.ADMIN
        : ROLES.USER;

    const probe = role === ROLES.ADMIN ? api.meAdmin : api.meUser;

    probe(stored.token)
      .then((data) => {
        if (cancelled) return;
        applySession({
          token: stored.token,
          role,
          principal: data?.admin || data?.user || stored.principal || null,
        });
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        // 401/403 => token is gone or no longer valid. 404 => principal deleted.
        if (
          err instanceof ApiError &&
          [401, 403, 404].includes(err.status)
        ) {
          applySession(null);
        }
        setStatus("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const signIn = useCallback(
    async (role, credentials) => {
      const isAdmin = role === ROLES.ADMIN;
      const data = isAdmin
        ? await api.loginAdmin(credentials)
        : await api.loginUser(credentials);

      const next = {
        token: data?.token,
        role: isAdmin ? ROLES.ADMIN : ROLES.USER,
        principal: data?.admin || data?.user || null,
      };

      if (!next.token) {
        throw new ApiError("Login succeeded but no token was returned.", {
          status: 500,
        });
      }

      applySession(next);
      return next;
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    const role = session?.role;
    try {
      if (role === ROLES.ADMIN) await api.logoutAdmin();
      else await api.logoutUser();
    } catch {
      /* JWTs are stateless — a failed logout call must not trap the user. */
    }
    applySession(null);
  }, [session, applySession]);

  /** Drops the session when the API reports the token is no longer usable. */
  const reportAuthError = useCallback(
    (err) => {
      if (err instanceof ApiError && err.status === 401) applySession(null);
    },
    [applySession],
  );

  const value = useMemo(
    () => ({
      status,
      session,
      token: session?.token || null,
      role: session?.role || null,
      principal: session?.principal || null,
      isAuthenticated: Boolean(session?.token),
      isAdmin: session?.role === ROLES.ADMIN,
      signIn,
      signOut,
      reportAuthError,
    }),
    [status, session, signIn, signOut, reportAuthError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
