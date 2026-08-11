import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable, type Column } from "../components/DataTable";
import { formatTimestamp } from "../lib/format";
import { useIsMobile } from "../lib/responsive";
import { listPendingForDoer, type ChecklistTaskRecord } from "./lib/checklistApi";
import { FollowUpForm } from "./FollowUpForm";

/** Admin drill-down from the Dashboard — one doer's pending task instances, matching the
 * old "Pending Checklist Data Account" list. Each row's "Update Remark" opens the PcFollowUp
 * form, matching the old app's own per-row action there. */
export function DoerPendingList() {
  const { doerId } = useParams<{ doerId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTask, setActiveTask] = useState<ChecklistTaskRecord | null>(null);

  const { data: rawTasks = [], isLoading } = useQuery({
    queryKey: ["checklist", "admin", "pending", doerId],
    queryFn: () => listPendingForDoer(doerId!),
    enabled: !!doerId,
  });
  const tasks = rawTasks.filter((t) => t.TASK?.trim());

  const columns: Column<ChecklistTaskRecord>[] = [
    { key: "task", header: "Task", render: (row) => row.TASK || "—" },
    { key: "frequency", header: "Frequency", render: (row) => row.FREQUENCY || "—" },
    { key: "planned", header: "Planned", render: (row) => (row.PLANNED ? formatTimestamp(row.PLANNED) : "—") },
    { key: "delayDuration", header: "Delay Duration", render: (row) => row.DELAY_DURATION || "—" },
    {
      key: "updateRemark",
      header: "",
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActiveTask(row);
          }}
          className="btn"
        >
          Update Remark
        </button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{tasks[0]?.FULL_NAME ?? "Pending Tasks"}</h2>
        <button className="btn" onClick={() => navigate("/checklist/dashboard")}>
          Back to Dashboard
        </button>
      </div>

      {isMobile ? (
        <div>
          {tasks.map((row) => (
            <div key={row.TASK_ID} className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>{row.TASK || "—"}</div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {row.FREQUENCY} · {row.PLANNED ? formatTimestamp(row.PLANNED) : "—"} · {row.DELAY_DURATION}
              </div>
              <button className="btn" style={{ marginTop: 8 }} onClick={() => setActiveTask(row)}>
                Update Remark
              </button>
            </div>
          ))}
          {!isLoading && tasks.length === 0 && <p className="text-muted">No pending tasks.</p>}
        </div>
      ) : (
        <DataTable columns={columns} rows={tasks} getRowKey={(row) => row.TASK_ID} emptyMessage={isLoading ? "Loading…" : "No pending tasks."} />
      )}

      {activeTask && <FollowUpForm task={activeTask} onClose={() => setActiveTask(null)} onSaved={() => setActiveTask(null)} />}
    </div>
  );
}
