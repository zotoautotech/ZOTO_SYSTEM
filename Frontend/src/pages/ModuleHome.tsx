import { useNavigate } from "react-router-dom";
import { MODULES } from "../lib/modules";
import { NavCard } from "../components/Layout";
import { useSearch } from "../lib/search";

export function ModuleHome() {
  const navigate = useNavigate();
  const { query } = useSearch();

  const filtered = MODULES.filter((m) => m.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
        <button
          onClick={() => navigate("/")}
          aria-label="Back"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
          }}
        >
          ‹
        </button>
        <h2 style={{ fontWeight: 500, margin: 0 }}>SALES CRR</h2>
      </div>
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
