import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useIsFetching } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { useSearch } from "../lib/search";
import { useSync } from "../lib/sync";
import { useHeaderActions } from "../lib/headerActions";
import { useIsCompact, useIsMobile } from "../lib/responsive";

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function ModulesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 4 6v6c0 4.5 3.2 7.7 8 9 4.8-1.3 8-4.5 8-9V6l-8-3Z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

function SyncIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={spinning ? { animation: "spin 0.8s linear infinite" } : undefined}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function timeAgo(ts: number | null): string {
  if (!ts) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

const NAV_ITEMS = [
  { to: "/", icon: HomeIcon, label: "Home", end: true },
  { to: "/modules", icon: ModulesIcon, label: "Sales CRR", end: false },
];

const UTILITY_ITEMS = [
  { to: "/settings", icon: SettingsIcon, label: "Settings" },
  { to: "/privacy-policy", icon: ShieldIcon, label: "Privacy Policy" },
  { to: "/terms-of-use", icon: DocIcon, label: "Terms of Use" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { query, setQuery } = useSearch();
  const { lastSyncAt, sync } = useSync();
  const { actions, left: headerLeft } = useHeaderActions();
  const isFetching = useIsFetching() > 0;
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const [, forceTick] = useState(0);
  const [railWidth, setRailWidth] = useState(208);
  const railDrag = useRef<{ startX: number; startWidth: number } | null>(null);
  const isCompact = useIsCompact();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The drawer (compact/mobile) is always shown "expanded" — the collapse toggle is a
  // desktop-only affordance, so ignore `collapsed` while the drawer is in play.
  const effectivelyCollapsed = collapsed && !isCompact;

  const onRailMouseMove = useCallback((e: MouseEvent) => {
    if (!railDrag.current) return;
    const next = railDrag.current.startWidth + (e.clientX - railDrag.current.startX);
    setRailWidth(Math.min(320, Math.max(160, next)));
  }, []);

  const onRailMouseUp = useCallback(() => {
    railDrag.current = null;
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", onRailMouseMove);
    window.removeEventListener("mouseup", onRailMouseUp);
  }, [onRailMouseMove]);

  const onRailMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (collapsed) return;
      railDrag.current = { startX: e.clientX, startWidth: railWidth };
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onRailMouseMove);
      window.addEventListener("mouseup", onRailMouseUp);
    },
    [collapsed, railWidth, onRailMouseMove, onRailMouseUp]
  );

  // Clear the search box when the route changes so a stale query doesn't silently
  // filter a page the user didn't mean to search.
  useEffect(() => {
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Close the mobile/tablet drawer on navigation so it doesn't stay open over the new page.
  useEffect(() => {
    setDrawerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Re-render every 30s so the "X minutes ago" sync label stays current.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // "modules" is folded into the "SALES CRR" crumb (both point at /modules) so it
  // isn't shown twice. Every crumb but the current page is a clickable link, so
  // you can jump back to any step — not just the immediate parent.
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const crumbs: { label: string; to: string }[] = [{ label: "SALES CRR", to: "/modules" }];
  pathSegments.forEach((seg, i) => {
    if (seg === "modules") return;
    crumbs.push({
      label: seg === "items" ? "Order Punch Items View" : seg.replace(/-/g, " "),
      to: "/" + pathSegments.slice(0, i + 1).join("/"),
    });
  });

  function navItemStyle(collapsed: boolean, isActive: boolean): React.CSSProperties {
    return {
      display: "flex",
      alignItems: "center",
      justifyContent: collapsed ? "center" : "flex-start",
      gap: 12,
      padding: collapsed ? "10px 0" : "10px 14px",
      borderRadius: 999,
      textDecoration: "none",
      fontSize: 14,
      fontWeight: isActive ? 600 : 500,
      color: isActive ? "#fff" : "var(--color-text)",
      background: isActive ? "var(--color-primary)" : "transparent",
      transition: "background 0.15s ease, color 0.15s ease",
    };
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {isCompact && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.4)" }}
        />
      )}
      <nav
        style={
          isCompact
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                height: "100vh",
                width: 260,
                zIndex: 41,
                background: "var(--color-bg)",
                display: "flex",
                flexDirection: "column",
                padding: "20px 12px",
                gap: 4,
                transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.2s ease",
                boxShadow: drawerOpen ? "var(--shadow-lg)" : "none",
              }
            : {
                width: collapsed ? 72 : railWidth,
                flexShrink: 0,
                background: "var(--color-bg)",
                display: "flex",
                flexDirection: "column",
                padding: "20px 12px",
                gap: 4,
                transition: railDrag.current ? "none" : "width 0.18s ease",
                overflow: "hidden",
              }
        }
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: effectivelyCollapsed ? "center" : "space-between",
            gap: 8,
            padding: "0 4px",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
            <span
              style={{
                width: 36,
                height: 36,
                flexShrink: 0,
                borderRadius: 8,
                background: "var(--color-primary)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 17,
              }}
            >
              Z
            </span>
            {!effectivelyCollapsed && (
              <strong style={{ fontSize: 21, fontWeight: 700, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                ZOTO
              </strong>
            )}
          </div>
          {!collapsed && !isCompact && (
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
          {isCompact && (
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
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
              ✕
            </button>
          )}
        </div>

        {collapsed && !isCompact && (
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

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label}
              style={({ isActive }) => navItemStyle(effectivelyCollapsed, isActive)}
            >
              <Icon />
              {!effectivelyCollapsed && <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>}
            </NavLink>
          );
        })}

        <div style={{ flex: 1 }} />

        <div
          style={{
            borderTop: "1px solid var(--color-border)",
            paddingTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {UTILITY_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                style={({ isActive }) => navItemStyle(effectivelyCollapsed, isActive)}
              >
                <Icon />
                {!effectivelyCollapsed && <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>}
              </NavLink>
            );
          })}
          <button
            onClick={logout}
            title="Log out"
            style={{
              ...navItemStyle(effectivelyCollapsed, false),
              border: "none",
              cursor: "pointer",
              width: "100%",
              background: "transparent",
            }}
          >
            <LogoutIcon />
            {!effectivelyCollapsed && <span style={{ whiteSpace: "nowrap" }}>Log Out</span>}
          </button>
        </div>
      </nav>

      {!collapsed && !isCompact && (
        <div
          onMouseDown={onRailMouseDown}
          onDoubleClick={() => setRailWidth(208)}
          title="Drag to resize"
          style={{
            width: 5,
            marginLeft: -2,
            marginRight: -2,
            cursor: "col-resize",
            flexShrink: 0,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div style={{ width: 1, height: "100%", background: "var(--color-border)", margin: "0 auto" }} />
        </div>
      )}
      {collapsed && !isCompact && <div style={{ width: 1, background: "var(--color-border)", flexShrink: 0 }} />}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            height: "var(--topbar-height)",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-bg)",
            display: "grid",
            gridTemplateColumns: isCompact ? "auto 1fr auto" : "1fr auto 1fr",
            alignItems: "center",
            padding: isCompact ? "0 12px" : "0 24px",
            gap: isCompact ? 8 : 16,
          }}
        >
          {isCompact ? (
            <button
              onClick={() => setDrawerOpen((o) => !o)}
              aria-label="Toggle menu"
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <HamburgerIcon />
            </button>
          ) : (
            <span />
          )}
          <input
            placeholder={`Search ${crumbs[crumbs.length - 1]?.label ?? "SALES CRR"}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: isCompact ? "100%" : 480,
              maxWidth: "100%",
              justifySelf: isCompact ? "stretch" : "center",
              padding: "8px 14px",
              borderRadius: 20,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-page)",
              color: "var(--color-text)",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: isCompact ? 6 : 12, justifySelf: "end" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
            {!isMobile && (
              <span className="text-muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                {isFetching ? "Syncing…" : "Sync complete"}
              </span>
            )}
            <div
              style={{
                display: "flex",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <button
                onClick={sync}
                aria-label="Sync now"
                title="Sync now"
                style={{
                  border: "none",
                  background: "var(--color-bg)",
                  width: 34,
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--color-text)",
                  borderRight: isMobile ? "none" : "1px solid var(--color-border)",
                }}
              >
                <SyncIcon spinning={isFetching} />
              </button>
              {!isMobile && (
              <button
                onClick={() => setSyncMenuOpen((o) => !o)}
                aria-label="Sync details"
                title="Sync details"
                style={{
                  border: "none",
                  background: "var(--color-bg)",
                  width: 28,
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                  fontSize: 11,
                }}
              >
                ▾
              </button>
              )}
            </div>

            {syncMenuOpen && (
              <>
                <div onClick={() => setSyncMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                <div
                  className="card"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    minWidth: 220,
                    zIndex: 31,
                    boxShadow: "var(--shadow-lg)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 16px",
                      background: isFetching ? "var(--color-primary-tint)" : "transparent",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: isFetching ? "var(--color-primary)" : "var(--color-text)" }}>
                      {isFetching ? "Syncing…" : "Sync complete"}
                    </div>
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                      Last sync: {timeAgo(lastSyncAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      sync();
                      setSyncMenuOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "12px 16px",
                      border: "none",
                      borderTop: "1px solid var(--color-border)",
                      background: "transparent",
                      fontSize: 14,
                      color: "var(--color-text)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <SyncIcon spinning={isFetching} />
                    Sync
                  </button>
                </div>
              </>
            )}
          </div>

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
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setAccountMenuOpen((o) => !o)}
              title={user?.email ?? "Account"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-page)",
                borderRadius: 999,
                padding: isMobile ? "4px" : "4px 12px 4px 4px",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "var(--color-primary)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
              </span>
              {!isMobile && (
                <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>{user?.name ?? "Account"}</span>
              )}
              <span className="text-muted" style={{ fontSize: 11 }}>
                ▾
              </span>
            </button>

            {accountMenuOpen && (
              <>
                <div
                  onClick={() => setAccountMenuOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 30 }}
                />
                <div
                  className="card"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    minWidth: 220,
                    padding: 8,
                    zIndex: 31,
                    boxShadow: "var(--shadow-lg)",
                  }}
                >
                  <button
                    onClick={() => {
                      setAccountMenuOpen(false);
                      navigate("/settings");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      padding: "12px 14px",
                      border: "none",
                      background: "transparent",
                      borderRadius: 8,
                      fontSize: 14,
                      color: "var(--color-text)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <PersonIcon />
                    View Profile
                  </button>
                  <button
                    onClick={() => {
                      setAccountMenuOpen(false);
                      logout();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      padding: "12px 14px",
                      border: "none",
                      background: "transparent",
                      borderRadius: 8,
                      fontSize: 14,
                      color: "var(--color-text)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <LogoutIcon />
                    Log Out
                  </button>
                </div>
              </>
            )}
          </div>
          </div>
        </header>

        <div
          style={{
            padding: isCompact ? "10px 12px" : "12px 24px",
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: isCompact ? "wrap" : "nowrap",
            gap: 12,
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          {headerLeft ?? (
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <span key={crumb.to} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isLast ? (
                      <span style={{ color: "var(--color-text)", fontWeight: 700, textTransform: "capitalize" }}>
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
          )}
          {actions && <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>{actions}</div>}
        </div>

        <main style={{ flex: 1, overflow: "auto", padding: isCompact ? "0 12px 16px" : "0 24px 24px" }}>
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
