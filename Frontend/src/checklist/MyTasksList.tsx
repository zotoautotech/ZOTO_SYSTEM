import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { formatTimestamp } from "../lib/format";
import { useSetHeaderActions, useSetHeaderLeft } from "../lib/headerActions";
import { useIsMobile } from "../lib/responsive";
import { openAttachment } from "../lib/attachments";
import { getDelayColor, listMyTasks, type ChecklistTaskRecord } from "./lib/checklistApi";
import { TaskCompleteForm } from "./TaskCompleteForm";
import { BulkTaskCompleteForm } from "./BulkTaskCompleteForm";

/** The department's task queue (Accounts department, for now) — one row per task instance
 * from Master Accounts. **A non-admin doer only sees their own rows; a Checklist admin sees
 * every doer's rows** — the actual filter is server-side (`GET /tasks/mine`, see
 * `Backend/src/routes/checklist.ts`), this page just renders whatever comes back. This
 * supersedes an earlier "shared department-wide board, not a personal inbox" design
 * (confirmed against the old AppSheet reference at the time) — a later, explicit user
 * request changed it to per-doer scoping with an Admin exception; see docs/CHECKLIST.md.
 * Same list pattern as PdiList.tsx otherwise: Completed toggle, DataTable desktop / card
 * list mobile. Admin-only "Assigned Checklist"/"Dashboard" links live in the sidebar
 * (Layout.tsx), not here — indented under the Checklist nav item, shown only while inside
 * this app. Punching a new task also only happens from Assigned Checklist's own "+ Add" now
 * (matching the old app: doers complete tasks here, admins assign them there) — this page
 * has no punch form.
 *
 * Every row is colored by its Delay Duration (`getDelayColor`, ported from the old
 * AppSheet reference's own conditional-format rule: yellow within 15 min of the deadline,
 * red once overdue) — applied to the WHOLE row via `DataTable`'s `getRowStyle`, not just
 * the Delay Duration cell, per explicit user request.
 *
 * Select mode + BulkTaskCompleteForm reuse the exact same select/bulk-form pattern
 * DispatchApprovalList.tsx already established (header-left "X Selected" pill, a Select
 * toggle icon next to Completed…, DataTable's own `selectable` checkbox column) — only
 * available on the pending view, not Completed (nothing to bulk-complete there). */
export function MyTasksList() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeTask, setActiveTask] = useState<ChecklistTaskRecord | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkForm, setShowBulkForm] = useState(false);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { data: rawTasks = [], isLoading } = useQuery({
    queryKey: ["checklist", "mine", showCompleted],
    queryFn: () => listMyTasks(showCompleted ? "COMPLETED" : undefined),
    placeholderData: keepPreviousData,
  });
  // Hides stray blank rows (empty Task/no data at all) — Sheets sometimes has trailing
  // blank rows or rows left over from bulk edits that shouldn't render as real tasks.
  const tasks = rawTasks.filter((t) => t.TASK?.trim());
  const selectedTasks = tasks.filter((t) => selectedIds.has(t.TASK_ID));

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["checklist", "mine"] });
  }

  function closeBulkFormAndExit() {
    setShowBulkForm(false);
    exitSelectMode();
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

  useSetHeaderLeft(
    selectMode ? (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={exitSelectMode}
          aria-label="Cancel selection"
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
          ✕
        </button>
        <span style={{ fontWeight: 700 }}>{selectedIds.size} Selected</span>
      </div>
    ) : null
  );

  useSetHeaderActions(
    selectMode ? (
      <button
        className="btn btn-primary"
        onClick={() => setShowBulkForm(true)}
        disabled={selectedIds.size === 0}
        style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
      >
        Bulk Complete Task Form
      </button>
    ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
        {!showCompleted && (
          <button
            aria-label="Select"
            onClick={() => setSelectMode(true)}
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
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="m8.5 12 2.5 2.5 4.5-5" />
            </svg>
          </button>
        )}
      </div>
    )
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
          {tasks.map((row) => {
            const selected = selectedIds.has(row.TASK_ID);
            return (
              <button
                key={row.TASK_ID}
                onClick={() => {
                  if (showCompleted) return;
                  if (selectMode) toggleRow(row.TASK_ID);
                  else setActiveTask(row);
                }}
                className="card"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: 14,
                  marginBottom: 10,
                  cursor: showCompleted ? "default" : "pointer",
                  ...(selected
                    ? { background: "var(--color-primary-tint)", color: "var(--color-text)" }
                    : { color: "var(--color-text)" }),
                }}
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
            );
          })}
          {!isLoading && tasks.length === 0 && <p className="text-muted">{emptyMessage}</p>}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={tasks}
          getRowKey={(row) => row.TASK_ID}
          onRowClick={showCompleted ? undefined : (row) => setActiveTask(row)}
          emptyMessage={emptyMessage}
          getRowStyle={(row) => {
            const color = getDelayColor(row.DELAY_MS);
            return color ? { color, fontWeight: 600 } : undefined;
          }}
          selectable={selectMode && !showCompleted}
          selectedKeys={selectedIds}
          onToggleRow={toggleRow}
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

      {showBulkForm && (
        <BulkTaskCompleteForm
          tasks={selectedTasks}
          onClose={closeBulkFormAndExit}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
