import { ToastProvider } from "./components/Toast.jsx";
import { useAuth } from "./lib/auth.jsx";
import { matchPath, Navigate, useRouter } from "./router/router.jsx";
import { AdminOverviewPage } from "./pages/AdminOverviewPage.jsx";
import { CategoriesPage } from "./pages/CategoriesPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { LoginPage } from "./pages/auth/LoginPage.jsx";
import { ProfilePage } from "./pages/ProfilePage.jsx";
import { RegisterPage } from "./pages/auth/RegisterPage.jsx";
import { StatusesPage } from "./pages/StatusesPage.jsx";
import { TaskDetailPage } from "./pages/TaskDetailPage.jsx";
import { TasksPage } from "./pages/TasksPage.jsx";
import { BootScreen, ForbiddenPage, NotFoundPage } from "./pages/StatusPages.jsx";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage.jsx";

/** Routes reachable without a session. */
const PUBLIC_ROUTES = [
  { path: "/login", element: () => <LoginPage variant="user" /> },
  { path: "/register", element: () => <RegisterPage variant="user" /> },
  { path: "/verify", element: () => <VerifyEmailPage variant="user" /> },
  { path: "/admin/login", element: () => <LoginPage variant="admin" /> },
  { path: "/admin/register", element: () => <RegisterPage variant="admin" /> },
  { path: "/admin/verify", element: () => <VerifyEmailPage variant="admin" /> },
];

/** Routes reachable by any authenticated principal. */
const PROTECTED_ROUTES = [
  { path: "/", element: () => <DashboardPage /> },
  { path: "/tasks", element: () => <TasksPage /> },
  { path: "/tasks/:id", element: (params) => <TaskDetailPage id={params.id} /> },
  { path: "/categories", element: () => <CategoriesPage /> },
  { path: "/statuses", element: () => <StatusesPage /> },
  { path: "/profile", element: () => <ProfilePage /> },
  { path: "/admin", element: () => <Navigate to="/admin/overview" /> },
];

/** Admin-only management area. */
const ADMIN_ROUTES = [{ path: "/admin/overview", element: () => <AdminOverviewPage /> }];

function resolve(routes, pathname) {
  for (const route of routes) {
    const params = matchPath(route.path, pathname);
    if (params) return route.element(params, pathname);
  }
  return null;
}

function Routes() {
  const { pathname } = useRouter();
  const { status, isAuthenticated, isAdmin } = useAuth();

  if (status === "checking") return <BootScreen />;

  const publicMatch = resolve(PUBLIC_ROUTES, pathname);

  if (!isAuthenticated) {
    return publicMatch || <LoginPage variant="user" />;
  }

  // A signed-in principal should never be left on an auth screen.
  if (publicMatch) return <Navigate to="/" />;

  const adminMatch = resolve(ADMIN_ROUTES, pathname);
  if (adminMatch) return isAdmin ? adminMatch : <ForbiddenPage />;

  return resolve(PROTECTED_ROUTES, pathname) || <NotFoundPage />;
}

export function App() {
  return (
    <ToastProvider>
      <Routes />
    </ToastProvider>
  );
}
