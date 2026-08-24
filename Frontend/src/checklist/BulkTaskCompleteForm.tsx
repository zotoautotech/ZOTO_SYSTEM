import { useState } from "react";
import { isAxiosError } from "axios";
import { FormModal } from "../components/form/FormModal";
import { ToggleGroup } from "../components/form/ToggleGroup";
import { TextField } from "../components/form/TextField";
import { FileDropzone } from "../components/form/FileDropzone";
import { useIsMobile } from "../lib/responsive";
import { completeTask, type ChecklistTaskRecord } from "./lib/checklistApi";

const STATUS_OPTIONS = [
  { value: "Done", label: "Done" },
  { value: "Rejected", label: "Rejected" },
  { value: "Full Day Leave", label: "Full Day Leave" },
  { value: "First Half Leave", label: "First Half Leave" },
  { value: "Second Half Leave", label: "Second Half Leave" },
] as const;

interface Props {
  tasks: ChecklistTaskRecord[];
  onClose: () => void;
  onSaved: () => void;
}

interface TaskResult {
  taskId: string;
  status: "pending" | "success" | "error";
  message?: string;
}

/** Applies ONE completion decision to every selected task at once — same shape as
 * BulkReachedForm.tsx/BulkDispatchApprovalForm.tsx: one form, submitted sequentially per
 * task via the existing single-task POST /checklist/tasks/:taskId/complete (completeTask()
 * — never a new bulk endpoint), so two calls can't race each other and a partial failure
 * still shows exactly which rows went through. Field set/visibility mirrors
 * TaskCompleteForm.tsx exactly, since this is the same decision just fanned out. */
export function BulkTaskCompleteForm({ tasks, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  // Snapshot at mount — onSaved() invalidates the pending-tasks query mid-flow, which would
  // otherwise shrink `tasks` (a just-completed row drops off the pending list) WHILE this
  // modal is still showing its own per-row results, same reasoning as BulkReachedForm.tsx.
  const [snapshotTasks] = useState(tasks);

  const [status, setStatus] = useState<string>("");
  const [attachment, setAttachment] = useState<"Yes" | "No" | "">("");
  const [remarks, setRemarks] = useState("");
  const [attachmentFileId, setAttachmentFileId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<TaskResult[] | null>(null);

  const showAttachment = status !== "";
  const showRemarksAndFile = status !== "" && attachment !== "";

  function canSave() {
    if (!status || !attachment) return false;
    if (!remarks.trim()) return false;
    if (attachment === "Yes" && !attachmentFileId) return false;
    return true;
  }

  async function handleSave() {
    if (!canSave() || submitting) return;
    setSubmitting(true);
    const running: TaskResult[] = snapshotTasks.map((t) => ({ taskId: t.TASK_ID, status: "pending" }));
    setResults([...running]);

    const payload = {
      status,
      attachment: attachment as "Yes" | "No",
      remarks,
      attachmentFileId: attachment === "Yes" ? attachmentFileId : "",
    };

    for (let i = 0; i < snapshotTasks.length; i++) {
      try {
        await completeTask(snapshotTasks[i].TASK_ID, payload);
        running[i] = { taskId: snapshotTasks[i].TASK_ID, status: "success" };
      } catch (err) {
        const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
        running[i] = { taskId: snapshotTasks[i].TASK_ID, status: "error", message: detail ?? "Could not save." };
      }
      setResults([...running]);
    }

    setSubmitting(false);
    onSaved();
    // Auto-close on a clean sweep, same as every other bulk form in this app — a partial
    // failure keeps the modal open so the per-row Saved/Failed list stays visible.
    if (running.every((r) => r.status === "success")) onClose();
  }

  const successCount = results?.filter((r) => r.status === "success").length ?? 0;
  const errorCount = results?.filter((r) => r.status === "error").length ?? 0;
  const done = results !== null && !submitting;

  return (
    <FormModal title="Bulk Complete Task Form" onClose={onClose} size="standard" sectionLabel={`${snapshotTasks.length} task${snapshotTasks.length === 1 ? "" : "s"} selected`}>
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            marginBottom: 20,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {snapshotTasks.map((task, i) => {
            const result = results?.[i];
            return (
              <div
                key={task.TASK_ID}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 12px",
                  borderBottom: i < snapshotTasks.length - 1 ? "1px solid var(--color-border)" : undefined,
                  fontSize: 13,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {task.TASK || "—"}
                  </div>
                  <div className="text-muted">{task.FULL_NAME || "—"}</div>
                </div>
                {result && (
                  <span
                    style={{
                      flexShrink: 0,
                      color:
                        result.status === "success"
                          ? "var(--color-success, #2e7d32)"
                          : result.status === "error"
                            ? "#d32f2f"
                            : "var(--color-text-muted)",
                      fontSize: 12,
                      alignSelf: "center",
                    }}
                    title={result.message}
                  >
                    {result.status === "success" ? "Saved" : result.status === "error" ? "Failed" : "…"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <ToggleGroup
          label="Status"
          required
          value={status}
          onChange={(v) => setStatus(v)}
          options={STATUS_OPTIONS as unknown as { value: string; label: string }[]}
        />

        {showAttachment && (
          <ToggleGroup
            label="Attachment"
            required
            value={attachment}
            onChange={(v) => setAttachment(v)}
            options={[
              { value: "Yes", label: "Yes" },
              { value: "No", label: "No" },
            ]}
          />
        )}

        {showRemarksAndFile && (
          <>
            <TextField label="Remark's" required value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            {attachment === "Yes" && (
              <FileDropzone
                label="Attachment File *"
                value={attachmentFileId}
                onChange={setAttachmentFileId}
                context="checklist_bulk"
              />
            )}
          </>
        )}

        {done && (
          <p style={{ fontSize: 13, marginTop: 12 }}>
            {successCount} succeeded{errorCount > 0 ? `, ${errorCount} failed — hover a task above for the reason.` : "."}
          </p>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: isMobile ? "14px var(--space) 28px" : "14px var(--space)",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-bg-page)",
        }}
      >
        <button className="btn" onClick={onClose} disabled={submitting}>
          {done ? "Close" : "Cancel"}
        </button>
        {!done && (
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || submitting}>
            {submitting ? `Saving… (${results?.filter((r) => r.status !== "pending").length ?? 0}/${snapshotTasks.length})` : "Save"}
          </button>
        )}
      </div>
    </FormModal>
  );
}
