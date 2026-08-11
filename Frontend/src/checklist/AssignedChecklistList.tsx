import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "../components/DataTable";
import { useIsMobile } from "../lib/responsive";
import { listAssignedChecklist, type AssignedTaskRecord } from "./lib/checklistApi";

/** Admin-only view of every punched task template across every doer — matches the old
 * AppSheet "Assigned Checklist" view (Full Name, Task, Frequency, Day/Date, Doer, grouped
 * by Full Name). Reads Task List Master directly (the templates), not Master Accounts
 * instances. Gated server-side by GET /checklist/admin/assigned's own admin check — this
 * page assumes the caller already confirmed admin via checkIsChecklistAdmin() before
 * linking here (see MyTasksList's header actions). */
export function AssignedChecklistList() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["checklist", "admin", "assigned"],
    queryFn: listAssignedChecklist,
  });

  const columns: Column<AssignedTaskRecord>[] = [
    { key: "fullName", header: "Full Name", render: (row) => row.FULL_NAME || "—" },
    { key: "task", header: "Task", render: (row) => row.TASK || "—" },
    { key: "frequency", header: "Frequency", render: (row) => row.FREQUENCY || "—" },
    { key: "dayDate", header: "Day/Date", render: (row) => row.DAY_DATE || "—" },
    { key: "doer", header: "Doer", render: (row) => row.DOER || "—" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Assigned Checklist</h2>
        <button className="btn" onClick={() => navigate("/checklist")}>
          Back to My Tasks
        </button>
      </div>

      {isMobile ? (
        <div>
          {tasks.map((row, i) => (
            <div key={i} className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>{row.TASK || "—"}</div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {row.FULL_NAME} · {row.FREQUENCY} · {row.DAY_DATE}
              </div>
            </div>
          ))}
          {!isLoading && tasks.length === 0 && <p className="text-muted">No tasks assigned yet.</p>}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={tasks}
          emptyMessage={isLoading ? "Loading…" : "No tasks assigned yet."}
        />
      )}
    </div>
  );
}
