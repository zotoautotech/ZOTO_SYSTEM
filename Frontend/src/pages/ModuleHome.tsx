import { MODULES } from "../lib/modules";
import { NavCard } from "../components/Layout";

export function ModuleHome() {
  return (
    <div>
      <h2 style={{ fontWeight: 500, marginTop: 20 }}>SALES CRR</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {MODULES.map((m) => (
          <NavCard key={m.key} to={`/modules/${m.key}`} icon={m.icon} label={m.label} />
        ))}
      </div>
    </div>
  );
}
