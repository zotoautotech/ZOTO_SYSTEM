import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

const RAIL_ICONS = ["🏠", "🛒", "🖥️", "👥", "⊞", "☰", "☰", "ℹ️", "💬", "▦"];

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const crumbs = location.pathname
    .split("/")
    .filter(Boolean)
    .map((seg) => seg.replace(/-/g, " "));

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <nav
        style={{
          width: "var(--rail-width)",
          background: "#fff",
          borderRight: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 12,
          gap: 4,
        }}
      >
        {RAIL_ICONS.map((icon, i) => (
          <div
            key={i}
            style={{
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: i === 1 ? "var(--color-primary)" : "transparent",
              color: i === 1 ? "#fff" : "var(--color-text)",
              fontSize: 18,
            }}
          >
            {icon}
          </div>
        ))}
      </nav>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            height: "var(--topbar-height)",
            borderBottom: "1px solid var(--color-border)",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 16,
          }}
        >
          <strong style={{ fontSize: 16 }}>📈 SALES CRR — ZOTO</strong>
          <input
            placeholder="Search SALES CRR"
            style={{
              flex: 1,
              maxWidth: 480,
              margin: "0 auto",
              padding: "8px 14px",
              borderRadius: 20,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-page)",
            }}
          />
          <span className="text-muted" style={{ fontSize: 13 }}>
            Sync complete
          </span>
          {user && (
            <>
              <span style={{ fontSize: 13 }}>{user.name}</span>
              <button className="btn" onClick={logout}>
                Log out
              </button>
            </>
          )}
        </header>

        <div style={{ padding: "10px 20px", fontSize: 13 }} className="text-muted">
          {["SALES CRR", ...crumbs].join("  >  ")}
        </div>

        <main style={{ flex: 1, overflow: "auto", padding: "0 20px 20px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function NavCard({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 16,
        textDecoration: "none",
        color: "var(--color-text)",
      }}
    >
      <span style={{ fontSize: 24 }}>{icon}</span>
      <span style={{ fontWeight: 500 }}>{label}</span>
    </NavLink>
  );
}
