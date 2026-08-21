import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { formatTimestamp } from "../lib/format";
import { useIsMobile } from "../lib/responsive";
import { getDelayColor, listMyTasks, type ChecklistTaskRecord } from "./lib/checklistApi";
import { FollowUpForm } from "./FollowUpForm";

/** Drill-down data table from `AccountDashboardExpand.tsx`'s "Data" button — every pending
 * task instance across every doer (`GET /tasks/mine`, the same real department-wide query
 * `MyTasksList.tsx` uses), not filtered to one doer like `DoerPendingList.tsx` is. Each
 * row's "Update Remark" opens the same `PcFollowUp` form used everywhere else in this app
 * (`FollowUpForm.tsx`) — kept as an always-visible column button rather than the reference's
 * hover-only reveal, matching this app's existing `DoerPendingList.tsx` row-action
 * convention instead of adding a one-off hover micro-interaction. */
export function AccountPendingDataList() {
  const isMobile = useIsMobile();
  const [activeTask, setActiveTask] = useState<ChecklistTaskRecord | null>(null);

  const { data: rawTasks = [], isLoading } = useQuery({
    queryKey: ["checklist", "mine", false],
    queryFn: () => listMyTasks(),
  });
  const tasks = rawTasks.filter((t) => t.TASK?.trim());

  const columns: Column<ChecklistTaskRecord>[] = [
    { key: "fullName", header: "Full Name", render: (row) => row.FULL_NAME || "—" },
    { key: "task", header: "Task", render: (row) => row.TASK || "—" },
    { key: "frequency", header: "Frequency", render: (row) => row.FREQUENCY || "—" },
    { key: "planned", header: "Planned", render: (row) => (row.PLANNED ? formatTimestamp(row.PLANNED) : "—") },
    {
      key: "delayDuration",
      header: "Delay Duration",
      render: (row) => {
        const color = getDelayColor(row.DELAY_MS);
        return color ? (
          <span style={{ color, fontWeight: 600 }}>{row.DELAY_DURATION || "—"}</span>
        ) : (
          row.DELAY_DURATION || "—"
        );
      },
    },
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
          Remark
        </button>
      ),
    },
  ];

  return (
    <div>
      {isMobile ? (
        <div>
          {tasks.map((row) => (
            <div key={row.TASK_ID} className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>{row.TASK || "—"}</div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {row.FULL_NAME} · {row.FREQUENCY} · {row.PLANNED ? formatTimestamp(row.PLANNED) : "—"}
              </div>
              <button className="btn" style={{ marginTop: 8 }} onClick={() => setActiveTask(row)}>
                Remark
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
