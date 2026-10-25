import { useState } from "react";
import { AuthLayout, RealmSwitch } from "../../components/AuthLayout.jsx";
import { Alert, Button, Link, TextInput } from "../../components/ui.jsx";
import { useAuth } from "../../lib/auth.jsx";
import { ROLES } from "../../lib/session.js";
import { useMutation } from "../../lib/useResource.js";
import { useRouter } from "../../router/router.jsx";

const COPY = {
  user: {
    display: (
      <>
        Every task has an <em>owner</em>, a deadline and a status.
      </>
    ),
    heading: "Sign in",
    lede: "Access your workspace, track deadlines and move work forward.",
    registerTo: "/register",
    verifyTo: "/verify",
    bullets: [
      "Tasks with status, deadline, categories and sub-tasks.",
      "Assign work to yourself or, as an admin, to anyone.",
      "Verify your email once — then it is just a password.",
    ],
  },
  admin: {
    display: (
      <>
        Run the <em>whole</em> operation, not just your own list.
      </>
    ),
    heading: "Administrator sign in",
    lede: "Full control over categories, statuses, members and every task.",
    registerTo: "/admin/register",
    verifyTo: "/admin/verify",
    bullets: [
      "Create and edit categories and workflow statuses.",
      "See every member and every task in the system.",
      "Modify or remove any task, regardless of owner.",
    ],
  },
};

export function LoginPage({ variant = "user" }) {
  const realm = variant === "admin" ? "admin" : "user";
  const copy = COPY[realm];
  const { signIn } = useAuth();
  const { navigate } = useRouter();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);

  const login = useMutation(async () =>
    signIn(realm === "admin" ? ROLES.ADMIN : ROLES.USER, {
      email: form.email.trim(),
      password: form.password,
    }),
  );

  const submit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!form.email.trim() || !form.password) {
      setError("Enter both your email and password.");
      return;
    }

    try {
      await login.run();
      navigate("/", { replace: true });
    } catch (err) {
      // The API returns 403 + requiresVerification when the email is unconfirmed.
      if (err?.payload?.requiresVerification) {
        navigate(
          `${copy.verifyTo}?email=${encodeURIComponent(
            err.payload.email || form.email.trim(),
          )}`,
          { replace: true },
        );
        return;
      }
      setError(err?.message || "Could not sign in.");
    }
  };

  return (
    <AuthLayout display={copy.display} bullets={copy.bullets}>
      <RealmSwitch realm={realm} />

      <div>
        <span className="label">{realm === "admin" ? "Restricted" : "Welcome back"}</span>
        <h1 style={{ marginTop: 6 }}>{copy.heading}</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          {copy.lede}
        </p>
      </div>

      {error ? <Alert tone="danger" title="Sign in failed">{error}</Alert> : null}

      <form
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}
      >
        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
          autoFocus
        />

        <TextInput
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required
        />

        <Button type="submit" variant="primary" block loading={login.loading}>
          Sign in
        </Button>
      </form>

      <p className="rule-label label">or</p>

      <p className="muted" style={{ textAlign: "center" }}>
        No account yet?{" "}
        <Link to={copy.registerTo} style={{ textDecoration: "underline", fontWeight: 600 }}>
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}
