import { MODULES } from "../lib/modules";
import { NavCard } from "../components/Layout";
import { useSearch } from "../lib/search";
import { useSetHeaderActions } from "../lib/headerActions";
import { useAuth } from "../lib/auth";

export function ModuleHome() {
  const { query } = useSearch();
  const { user } = useAuth();

  // Blank/missing MODULES claim defaults to "ALL" (see Backend/src/routes/auth.ts) so
  // nobody is locked out until an admin deliberately restricts their USERS sheet row.
  const allowedModules = user?.modules ?? "ALL";
  const visible =
    allowedModules === "ALL" ? MODULES : MODULES.filter((m) => allowedModules.includes(m.key));
  const filtered = visible.filter((m) => m.label.toLowerCase().includes(query.trim().toLowerCase()));

  useSetHeaderActions(
    <button
      aria-label="Filter"
      style={{
        width: 38,
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        background: "var(--color-bg)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 5h16M7 12h10M10 19h4" />
      </svg>
    </button>
  );

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
          marginTop: 16,
        }}
      >
        {filtered.map((m) => (
          <NavCard key={m.key} to={`/modules/${m.key}`} icon={m.icon} label={m.label} />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="text-muted" style={{ marginTop: 24 }}>
          No modules match "{query}"
        </p>
      )}
    </div>
  );
}
