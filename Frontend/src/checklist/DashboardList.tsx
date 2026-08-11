import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listDashboard } from "./lib/checklistApi";

/** Admin-only "Dashboard - Pending Checklist" — a per-doer pending-task-instance count,
 * matching the old AppSheet dashboard's underlying data (one donut per doer there; this
 * app only has the Accounts department built so far, so it's a flat list — extend into a
 * per-department breakdown once more departments exist). Clicking a doer drills into their
 * pending list (same data GET /tasks/mine shows the doer themselves, admin view of it). */
export function DashboardList() {
  const navigate = useNavigate();
  const { data: doers = [], isLoading } = useQuery({
    queryKey: ["checklist", "admin", "dashboard"],
    queryFn: listDashboard,
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Dashboard — Pending Checklist</h2>
        <button className="btn" onClick={() => navigate("/checklist")}>
          Back to My Tasks
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {doers.map((d) => (
          <button
            key={d.doerId}
            onClick={() => navigate(`/checklist/dashboard/${encodeURIComponent(d.doerId)}`)}
            className="card"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
              padding: 16,
              textAlign: "left",
              cursor: "pointer",
              color: "var(--color-text)",
            }}
          >
            <span style={{ fontWeight: 700 }}>{d.fullName}</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: "var(--color-primary)" }}>{d.count}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>
              pending task{d.count === 1 ? "" : "s"}
            </span>
          </button>
        ))}
      </div>

      {!isLoading && doers.length === 0 && <p className="text-muted">No pending tasks anywhere.</p>}
    </div>
  );
}
