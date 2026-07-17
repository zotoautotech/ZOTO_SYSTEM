import { useParams } from "react-router-dom";
import { MODULES } from "../lib/modules";

export function PlaceholderModule() {
  const { moduleKey } = useParams();
  const mod = MODULES.find((m) => m.key === moduleKey);

  return (
    <div className="card" style={{ padding: 40, marginTop: 20, textAlign: "center" }}>
      <div style={{ fontSize: 40 }}>{mod?.icon ?? "🔧"}</div>
      <h2>{mod?.label ?? moduleKey}</h2>
      <p className="text-muted">
        This module's Pending/Completed queue and form are built in the next phase.
      </p>
    </div>
  );
}
