import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { formatTimestamp } from "../lib/format";
import { useSetHeaderActions } from "../lib/headerActions";
import { useIsMobile } from "../lib/responsive";
import { openAttachment } from "../lib/attachments";
import { listMyTasks, type ChecklistTaskRecord } from "./lib/checklistApi";
import { TaskCompleteForm } from "./TaskCompleteForm";

/** The department's shared task queue (Accounts department, for now) — one row per task
 * instance from Master Accounts, NOT filtered to the logged-in user. Confirmed directly
 * against the old AppSheet reference (previewed as both an admin email and a regular doer
 * email — both saw the identical full list) that this is a shared department-wide board,
 * not a personal "my tasks" inbox; anyone with Checklist access sees and can complete any
 * row here, not just their own. Same list pattern as PdiList.tsx otherwise: Completed
 * toggle, DataTable desktop / card list mobile. Admin-only "Assigned Checklist"/"Dashboard"
 * links live in the sidebar (Layout.tsx), not here — indented under the Checklist nav item,
 * shown only while inside this app. Punching a new task also only happens from Assigned
 * Checklist's own "+ Add" now (matching the old app: doers complete tasks here, admins
 * assign them there) — this page has no punch form. */
export function MyTasksList() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeTask, setActiveTask] = useState<ChecklistTaskRecord | null>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["checklist", "mine", showCompleted],
    queryFn: () => listMyTasks(showCompleted ? "COMPLETED" : undefined),
    placeholderData: keepPreviousData,
  });


  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["checklist", "mine"] });
  }

  // Column order/set matches the old AppSheet "CHECKLIST Account" pending view exactly
  // (Full Name, Task, Delay Duration, Planned, Task Frequency, grouped by Date/sorted by
  // Planned) plus the completion fields (Status/Delay Status/Attachment/Remark's) once a
  // task has actually been completed, matching "CHECKLIST Completed Account".
  const columns: Column<ChecklistTaskRecord>[] = [
    { key: "fullName", header: "Full Name", render: (row) => row.FULL_NAME || "—" },
    { key: "task", header: "Task", render: (row) => row.TASK || "—" },
    { key: "delayDuration", header: "Delay Duration", render: (row) => row.DELAY_DURATION || "—" },
    { key: "planned", header: "Planned", render: (row) => (row.PLANNED ? formatTimestamp(row.PLANNED) : "—") },
    { key: "frequency", header: "Task Frequency", render: (row) => row.FREQUENCY || "—" },
    ...(showCompleted
      ? ([
          { key: "status", header: "Status", render: (row) => row.STATUS || "—" },
          { key: "delayStatus", header: "Delay Status", render: (row) => row.DELAY_STATUS || "—" },
          {
            key: "attachment",
            header: "Attachment",
            render: (row) =>
              row.ATTACHMENT_FILE ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAttachment(row.ATTACHMENT_FILE);
                  }}
                  style={{ color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
                >
                  View
                </button>
              ) : (
                "—"
              ),
          },
          { key: "remarks", header: "Remark's", render: (row) => row.REMARKS || "—" },
        ] as Column<ChecklistTaskRecord>[])
      : []),
  ];

  useSetHeaderActions(
    <div style={{ display: "flex", gap: 8 }}>
      <button
        className="btn btn-primary"
        onClick={() => setShowCompleted((current) => !current)}
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {showCompleted ? "Showing Completed" : "Completed…"}
      </button>
    </div>
  );

  const emptyMessage = isLoading
    ? "Loading…"
    : showCompleted
    ? "No completed tasks yet."
    : "No pending tasks — you're all caught up.";

  return (
    <div>
      {isMobile ? (
        <div style={{ padding: "8px 0 24px" }}>
          {tasks.map((row) => (
            <button
              key={row.TASK_ID}
              onClick={() => !showCompleted && setActiveTask(row)}
              className="card"
              style={{ display: "block", width: "100%", textAlign: "left", padding: 14, marginBottom: 10, color: "var(--color-text)", cursor: showCompleted ? "default" : "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontWeight: 700 }}>{row.TASK || "—"}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>{row.PLANNED ? formatTimestamp(row.PLANNED) : "—"}</span>
              </div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 5 }}>
                {row.FULL_NAME || "—"}
              </div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 2 }}>
                {row.FREQUENCY} · {row.DELAY_DURATION || (row.STATUS || "Pending")}
              </div>
            </button>
          ))}
          {!isLoading && tasks.length === 0 && <p className="text-muted">{emptyMessage}</p>}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={tasks}
          getRowKey={(row) => row.TASK_ID}
          onRowClick={showCompleted ? undefined : (row) => setActiveTask(row)}
          emptyMessage={emptyMessage}
        />
      )}

      {activeTask && (
        <TaskCompleteForm
          task={activeTask}
          onClose={() => setActiveTask(null)}
          onSaved={() => {
            setActiveTask(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
