import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Minimal history-API router. The app only needs path matching with params,
 * programmatic navigation and links — a full router library would be more
 * surface than this UI warrants.
 */

const RouterContext = createContext(null);

const readLocation = () =>
  window.location.pathname + window.location.search + window.location.hash;

/** Matches "/tasks/:id" against "/tasks/abc". Returns params or null. */
export function matchPath(pattern, pathname) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  const params = {};

  for (let i = 0; i < patternParts.length; i += 1) {
    const segment = patternParts[i];

    if (segment === "*") {
      params["*"] = pathParts.slice(i).join("/");
      return params;
    }

    if (segment.startsWith(":")) {
      if (pathParts[i] === undefined) return null;
      params[segment.slice(1)] = decodeURIComponent(pathParts[i]);
      continue;
    }

    if (segment !== pathParts[i]) return null;
  }

  return pathParts.length === patternParts.length ? params : null;
}

export function RouterProvider({ children }) {
  const [location, setLocation] = useState(readLocation);

  useEffect(() => {
    const onPop = () => setLocation(readLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to, { replace = false, keepScroll = false } = {}) => {
    if (to === readLocation()) return;
    if (replace) window.history.replaceState({}, "", to);
    else window.history.pushState({}, "", to);
    setLocation(readLocation());
    if (!keepScroll) window.scrollTo({ top: 0, left: 0 });
  }, []);

  const value = useMemo(() => {
    const url = new URL(window.location.origin + location);
    return {
      location,
      pathname: url.pathname,
      search: url.search,
      query: Object.fromEntries(url.searchParams.entries()),
      navigate,
    };
  }, [location, navigate]);

  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used inside <RouterProvider>");
  return ctx;
}

export function Link({ to, replace = false, onClick, children, ...rest }) {
  const { navigate } = useRouter();

  return (
    <a
      href={to}
      onClick={(event) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        onClick?.(event);
        navigate(to, { replace });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Declarative redirect, useful inside the route table. */
export function Navigate({ to, replace = true }) {
  const { navigate } = useRouter();

  useEffect(() => {
    navigate(to, { replace });
  }, [to, replace, navigate]);

  return null;
}
