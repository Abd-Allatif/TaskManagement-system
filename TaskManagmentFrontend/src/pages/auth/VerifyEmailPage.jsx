import { useEffect, useRef, useState } from "react";
import { AuthLayout } from "../../components/AuthLayout.jsx";
import { useToast } from "../../components/Toast.jsx";
import { Alert, Button, Link, TextInput } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { useMutation } from "../../lib/useResource.js";
import { useRouter } from "../../router/router.jsx";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

const COPY = {
  user: { loginTo: "/login", registerTo: "/register" },
  admin: { loginTo: "/admin/login", registerTo: "/admin/register" },
};

export function VerifyEmailPage({ variant = "user" }) {
  const realm = variant === "admin" ? "admin" : "user";
  const copy = COPY[realm];

  const { query, navigate } = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState(query.email || "");
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  const inputsRef = useRef([]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const code = digits.join("");

  const verify = useMutation(async () =>
    realm === "admin"
      ? api.verifyAdminEmail({ email: email.trim(), code })
      : api.verifyUserEmail({ email: email.trim(), code }),
  );

  const resend = useMutation(async () =>
    realm === "admin"
      ? api.resendAdminCode(email.trim())
      : api.resendUserCode(email.trim()),
  );

  const setDigit = (index, value) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      setDigits((prev) => prev.map((d, i) => (i === index ? "" : d)));
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      // Support multi-character input (paste / autofill) by distributing.
      for (let offset = 0; offset < clean.length && index + offset < CODE_LENGTH; offset += 1) {
        next[index + offset] = clean[offset];
      }
      return next;
    });

    const target = Math.min(index + clean.length, CODE_LENGTH - 1);
    inputsRef.current[target]?.focus();
  };

  const onKeyDown = (index) => (event) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) inputsRef.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1)
      inputsRef.current[index + 1]?.focus();
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter the email address you registered with.");
      return;
    }
    if (code.length !== CODE_LENGTH) {
      setError(`Enter all ${CODE_LENGTH} digits of the verification code.`);
      return;
    }

    try {
      await verify.run();
      toast.success("Email verified. You can sign in now.");
      navigate(copy.loginTo, { replace: true });
    } catch (err) {
      setError(err?.message || "Could not verify the code.");
    }
  };

  const onResend = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter your email address first so we know where to send the code.");
      return;
    }
    try {
      await resend.run();
      toast.info("A new code is on its way. The previous one is now invalid.");
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(err?.message || "Could not resend the code.");
    }
  };

  return (
    <AuthLayout
      display={
        <>
          Confirm it is <em>you</em> before anything else.
        </>
      }
      bullets={[
        "Codes are 6 digits and expire 10 minutes after they are issued.",
        "Resending invalidates every previously issued code.",
        "Verification is required before your first sign-in.",
      ]}
    >
      <div>
        <span className="label">Verification</span>
        <h1 style={{ marginTop: 6 }}>Check your inbox</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Enter the 6-digit code we sent{" "}
          {email ? <strong>{email}</strong> : "to your email address"}.
        </p>
      </div>

      {error ? <Alert tone="danger" title="Verification failed">{error}</Alert> : null}

      <form
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}
      >
        {!query.email ? (
          <TextInput
            label="Email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        ) : null}

        <div className="field">
          <span className="field__label">
            <span>Verification code</span>
            <span className="field__hint">6 digits</span>
          </span>
          <div className="code-input">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputsRef.current[index] = el;
                }}
                value={digit}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                aria-label={`Digit ${index + 1}`}
                onChange={(e) => setDigit(index, e.target.value)}
                onKeyDown={onKeyDown(index)}
                onFocus={(e) => e.target.select()}
                autoFocus={index === 0}
              />
            ))}
          </div>
        </div>

        <Button type="submit" variant="primary" block loading={verify.loading}>
          Verify email
        </Button>

        <Button
          variant="ghost"
          block
          onClick={onResend}
          loading={resend.loading}
          disabled={cooldown > 0}
        >
          {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend code"}
        </Button>
      </form>

      <p className="rule-label label">or</p>

      <p className="muted" style={{ textAlign: "center" }}>
        Wrong address?{" "}
        <Link to={copy.registerTo} style={{ textDecoration: "underline", fontWeight: 600 }}>
          Register again
        </Link>
      </p>
    </AuthLayout>
  );
}
