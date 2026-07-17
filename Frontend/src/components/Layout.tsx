import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

const NAV_ITEMS = [
  { to: "/", icon: "🏠", label: "Home", end: true },
  { to: "/modules/punch-order", icon: "🧾", label: "Sales CRR", end: false },
];

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
          flexShrink: 0,
          background: "#fff",
          borderRight: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          padding: "20px 12px",
          gap: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 8px",
            marginBottom: 24,
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "var(--color-primary)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            Z
          </span>
          <strong style={{ fontSize: 15, letterSpacing: 0.2 }}>ZOTO</strong>
        </div>

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 999,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "var(--color-primary)" : "var(--color-text)",
              background: isActive ? "var(--color-primary-tint)" : "transparent",
              transition: "background 0.15s ease, color 0.15s ease",
            })}
          >
            <span style={{ fontSize: 17, lineHeight: 1 }}>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
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
            padding: "0 24px",
            gap: 16,
          }}
        >
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

        <div style={{ padding: "10px 24px", fontSize: 13 }} className="text-muted">
          {["SALES CRR", ...crumbs].join("  >  ")}
        </div>

        <main style={{ flex: 1, overflow: "auto", padding: "0 24px 24px" }}>
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
