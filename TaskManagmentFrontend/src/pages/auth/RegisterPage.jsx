import { useState } from "react";
import { AuthLayout, RealmSwitch } from "../../components/AuthLayout.jsx";
import { Alert, Button, Link, TextInput } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { useMutation } from "../../lib/useResource.js";
import { useRouter } from "../../router/router.jsx";

const COPY = {
  user: {
    display: (
      <>
        Set up your account in <em>one</em> step.
      </>
    ),
    heading: "Create your account",
    lede: "A 6-digit code confirms your email — it expires after 10 minutes.",
    verifyTo: "/verify",
    loginTo: "/login",
  },
  admin: {
    display: (
      <>
        Provision an <em>administrator</em> account.
      </>
    ),
    heading: "Create an admin account",
    lede: "Administrators manage categories, statuses, members and all tasks.",
    verifyTo: "/admin/verify",
    loginTo: "/admin/login",
  },
};

export function RegisterPage({ variant = "user" }) {
  const realm = variant === "admin" ? "admin" : "user";
  const copy = COPY[realm];
  const { navigate } = useRouter();

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});

  const register = useMutation(async () =>
    realm === "admin"
      ? api.registerAdmin({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
        })
      : api.registerUser({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
        }),
  );

  const submit = async (event) => {
    event.preventDefault();
    setError(null);

    const next = {};
    if (form.name.trim().length < 4)
      next.name = "Name must be at least 4 characters long";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim()))
      next.email = "Enter a valid email address";
    if (form.password.length < 8)
      next.password = "Password must be at least 8 characters long";

    setFields(next);
    if (Object.keys(next).length) return;

    try {
      await register.run();
      navigate(`${copy.verifyTo}?email=${encodeURIComponent(form.email.trim())}`, {
        replace: true,
      });
    } catch (err) {
      if (err?.fields) setFields(err.fields);
      setError(err?.message || "Could not create the account.");
    }
  };

  return (
    <AuthLayout display={copy.display}>
      <RealmSwitch realm={realm} />

      <div>
        <span className="label">Registration</span>
        <h1 style={{ marginTop: 6 }}>{copy.heading}</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          {copy.lede}
        </p>
      </div>

      {error ? <Alert tone="danger" title="Registration failed">{error}</Alert> : null}

      <form
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}
      >
        <TextInput
          label="Full name"
          hint="min 4 characters"
          placeholder="Ada Lovelace"
          value={form.name}
          error={fields.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          autoFocus
        />

        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={form.email}
          error={fields.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
        />

        <TextInput
          label="Password"
          hint="min 8 characters"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={form.password}
          error={fields.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required
        />

        <Button type="submit" variant="primary" block loading={register.loading}>
          Create account
        </Button>
      </form>

      <p className="rule-label label">or</p>

      <p className="muted" style={{ textAlign: "center" }}>
        Already registered?{" "}
        <Link to={copy.loginTo} style={{ textDecoration: "underline", fontWeight: 600 }}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
