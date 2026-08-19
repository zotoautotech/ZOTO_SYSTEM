import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CustomerFilterPanel } from "../components/CustomerFilterPanel";
import { DataTable, type Column } from "../components/DataTable";
import { useSetHeaderActions } from "../lib/headerActions";
import { useSearch } from "../lib/search";
import { useIsMobile } from "../lib/responsive";
import { listAssignedChecklist, type AssignedTaskRecord } from "./lib/checklistApi";
import { TaskPunchForm } from "./TaskPunchForm";

/** Admin-only view of every punched task template across every doer — matches the old
 * AppSheet "Assigned Checklist" view exactly: left doer filter panel (All + one row per
 * doer with a count badge, same CustomerFilterPanel component the order lists already use),
 * a "+ Add" header button to punch a new task from here, and the same five columns (Full
 * Name, Task, Frequency, Day/Date, Doer). Reads Task List Master directly (the templates),
 * not Master Accounts instances. */
export function AssignedChecklistList() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { query } = useSearch();
  const [activeDoer, setActiveDoer] = useState<string | null>(null);
  const [showPunchForm, setShowPunchForm] = useState(false);
  const [filterWidth, setFilterWidth] = useState(260);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const onDividerMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const next = dragState.current.startWidth + (e.clientX - dragState.current.startX);
    setFilterWidth(Math.min(480, Math.max(160, next)));
  }, []);

  const onDividerMouseUp = useCallback(() => {
    dragState.current = null;
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", onDividerMouseMove);
    window.removeEventListener("mouseup", onDividerMouseUp);
  }, [onDividerMouseMove]);

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragState.current = { startX: e.clientX, startWidth: filterWidth };
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onDividerMouseMove);
      window.addEventListener("mouseup", onDividerMouseUp);
    },
    [filterWidth, onDividerMouseMove, onDividerMouseUp]
  );

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["checklist", "admin", "assigned"],
    queryFn: listAssignedChecklist,
  });

  const doerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      const name = t.FULL_NAME || "(empty)";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const q = query.trim().toLowerCase();
  const filteredTasks = tasks
    .filter((t) => (activeDoer ? (t.FULL_NAME || "(empty)") === activeDoer : true))
    .filter((t) =>
      q
        ? [t.TASK, t.FULL_NAME, t.DOER, t.FREQUENCY].some((v) => (v ?? "").toLowerCase().includes(q))
        : true
    );

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["checklist", "admin", "assigned"] });
  }

  useSetHeaderActions(
    <button className="btn btn-primary" onClick={() => setShowPunchForm(true)}>
      + Add
    </button>
  );

  const columns: Column<AssignedTaskRecord>[] = [
    { key: "fullName", header: "Full Name", render: (row) => row.FULL_NAME || "—" },
    { key: "task", header: "Task", render: (row) => row.TASK || "—" },
    { key: "frequency", header: "Frequency", render: (row) => row.FREQUENCY || "—" },
    { key: "dayDate", header: "Day/Date", render: (row) => row.DAY_DATE || "—" },
    { key: "doer", header: "Doer", render: (row) => row.DOER || "—" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 128px)" }}>
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "stretch",
          flex: 1,
          minHeight: 0,
        }}
      >
        <CustomerFilterPanel customers={doerCounts} active={activeDoer} onSelect={setActiveDoer} width={isMobile ? undefined : filterWidth} />

        {!isMobile && (
          <div
            onMouseDown={onDividerMouseDown}
            onDoubleClick={() => setFilterWidth(260)}
            title="Drag to resize"
            style={{
              width: 5,
              marginLeft: -2,
              marginRight: -2,
              cursor: "col-resize",
              flexShrink: 0,
              position: "relative",
              zIndex: 1,
            }}
          >
            <div style={{ width: 1, height: "100%", background: "var(--color-border)", margin: "0 auto" }} />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {isMobile ? (
            <div>
              {filteredTasks.map((row, i) => (
                <div key={i} className="card" style={{ padding: 14, marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>{row.TASK || "—"}</div>
                  <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {row.FULL_NAME} · {row.FREQUENCY} · {row.DAY_DATE}
                  </div>
                </div>
              ))}
              {!isLoading && filteredTasks.length === 0 && <p className="text-muted">No tasks assigned yet.</p>}
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={filteredTasks}
              emptyMessage={isLoading ? "Loading…" : "No tasks assigned yet."}
            />
          )}
        </div>
      </div>

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
