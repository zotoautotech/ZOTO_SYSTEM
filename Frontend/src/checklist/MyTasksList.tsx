import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { FloatingActionButton } from "../components/FloatingActionButton";
import { formatTimestamp } from "../lib/format";
import { useSetHeaderActions } from "../lib/headerActions";
import { useIsMobile } from "../lib/responsive";
import { openAttachment } from "../lib/attachments";
import { listMyTasks, type ChecklistTaskRecord } from "./lib/checklistApi";
import { TaskCompleteForm } from "./TaskCompleteForm";
import { TaskPunchForm } from "./TaskPunchForm";

/** The doer's own Checklist task queue (Accounts department, for now) — one row per task
 * instance from Master Accounts, filtered server-side to the logged-in doer's own Email.
 * Same list pattern as PdiList.tsx: Completed toggle, DataTable desktop / card list mobile. */
export function MyTasksList() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeTask, setActiveTask] = useState<ChecklistTaskRecord | null>(null);
  const [showPunchForm, setShowPunchForm] = useState(false);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["checklist", "mine", showCompleted],
    queryFn: () => listMyTasks(showCompleted ? "COMPLETED" : undefined),
    placeholderData: keepPreviousData,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["checklist", "mine"] });
  }

  const columns: Column<ChecklistTaskRecord>[] = [
    { key: "task", header: "Task", render: (row) => row.TASK || "—" },
    { key: "frequency", header: "Frequency", render: (row) => row.FREQUENCY || "—" },
    { key: "planned", header: "Planned", render: (row) => (row.PLANNED ? formatTimestamp(row.PLANNED) : "—") },
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
      {!isMobile && (
        <button className="btn btn-primary" onClick={() => setShowPunchForm(true)}>
          + Give Task
        </button>
      )}
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
                {row.FREQUENCY} · {row.STATUS || "Pending"}
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

      {isMobile && <FloatingActionButton onClick={() => setShowPunchForm(true)} ariaLabel="Give Task" />}

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

      {showPunchForm && (
        <TaskPunchForm
          onClose={() => setShowPunchForm(false)}
          onSaved={() => {
            setShowPunchForm(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
