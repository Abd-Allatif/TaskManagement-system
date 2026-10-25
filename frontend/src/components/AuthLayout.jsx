import { useRouter } from "../router/router.jsx";

/** Split editorial shell used by every unauthenticated screen. */
export function AuthLayout({ children, display, bullets = [] }) {
  return (
    <div className="auth">
      <aside className="auth__aside">
        <div className="rail__brand" style={{ padding: 0, border: 0 }}>
          <span className="rail__mark" aria-hidden="true">
            TO
          </span>
          <span className="rail__wordmark">
            <b>Task Operations</b>
            <span>Console v1</span>
          </span>
        </div>

        <p className="auth__display">{display}</p>

        {bullets.length ? (
          <div className="auth__bullets">
            {bullets.map((bullet, index) => (
              <div className="auth__bullet" key={index}>
                <span className="auth__bullet-num">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        ) : null}
      </aside>

      <section className="auth__panel">
        <div className="auth__form">{children}</div>
      </section>
    </div>
  );
}

/** Segmented control that swaps between the member and admin entry points. */
export function RealmSwitch({ realm }) {
  const { navigate } = useRouter();
  const options = [
    { id: "user", label: "Member", to: "/login" },
    { id: "admin", label: "Administrator", to: "/admin/login" },
  ];

  return (
    <div className="auth__switch" role="group" aria-label="Account type">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={realm === option.id}
          onClick={() => navigate(option.to, { replace: true })}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
