import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

const NAV_ITEMS = [
  { to: "/", icon: "🏠", label: "Home", end: true },
  { to: "/modules", icon: "🧾", label: "Sales CRR", end: false },
];

export function Layout() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // "modules" is folded into the "SALES CRR" crumb (both point at /modules) so it
  // isn't shown twice. Every crumb but the current page is a clickable link, so
  // you can jump back to any step — not just the immediate parent.
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const crumbs: { label: string; to: string }[] = [{ label: "SALES CRR", to: "/modules" }];
  pathSegments.forEach((seg, i) => {
    if (seg === "modules") return;
    crumbs.push({
      label: seg.replace(/-/g, " "),
      to: "/" + pathSegments.slice(0, i + 1).join("/"),
    });
  });

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <nav
        style={{
          width: collapsed ? 72 : "var(--rail-width)",
          flexShrink: 0,
          background: "var(--color-bg)",
          borderRight: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          padding: "20px 12px",
          gap: 4,
          transition: "width 0.18s ease",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            gap: 8,
            padding: "0 4px",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
            <span
              style={{
                width: 32,
                height: 32,
                flexShrink: 0,
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
            {!collapsed && <strong style={{ fontSize: 15, letterSpacing: 0.2, whiteSpace: "nowrap" }}>ZOTO</strong>}
          </div>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                fontSize: 13,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ‹
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg)",
              fontSize: 13,
              alignSelf: "center",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ›
          </button>
        )}

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: 12,
              padding: collapsed ? "10px 0" : "10px 14px",
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
            {!collapsed && <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            height: "var(--topbar-height)",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-bg)",
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
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title="Toggle light / dark theme"
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-page)",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
          <button className="btn" onClick={logout}>
            Log out
          </button>
        </header>

        <div
          style={{ padding: "10px 24px", fontSize: 13, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}
        >
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={crumb.to} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {isLast ? (
                  <span style={{ color: "var(--color-text)", fontWeight: 500, textTransform: "capitalize" }}>
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    to={crumb.to}
                    className="text-muted"
                    style={{ textDecoration: "none", textTransform: "capitalize" }}
                  >
                    {crumb.label}
                  </Link>
                )}
                {!isLast && <span className="text-muted">›</span>}
              </span>
            );
          })}
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
