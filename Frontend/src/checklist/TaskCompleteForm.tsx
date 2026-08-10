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
  task: ChecklistTaskRecord;
  onClose: () => void;
  onSaved: () => void;
}

/** The doer's "complete this task" form — field visibility mirrors the old AppSheet Show_If
 * chain exactly: Status first, then Attachment (Yes/No) once Status is set, then Remark's +
 * Attachment File once both Status and Attachment are set. Saves via
 * POST /checklist/tasks/:taskId/complete (Backend/src/routes/checklist.ts). */
export function TaskCompleteForm({ task, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [status, setStatus] = useState<string>("");
  const [attachment, setAttachment] = useState<"Yes" | "No" | "">("");
  const [remarks, setRemarks] = useState("");
  const [attachmentFileId, setAttachmentFileId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const showAttachment = status !== "";
  const showRemarksAndFile = status !== "" && attachment !== "";

  function canSave() {
    if (!status || !attachment) return false;
    if (!remarks.trim()) return false;
    if (attachment === "Yes" && !attachmentFileId) return false;
    return true;
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await completeTask(task.TASK_ID, {
        status,
        attachment: attachment as "Yes" | "No",
        remarks,
        attachmentFileId: attachment === "Yes" ? attachmentFileId : "",
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="Complete Task" onClose={onClose} size="standard" sectionLabel={task.TASK}>
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
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
            <TextField
              label="Remark's"
              required
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
            {attachment === "Yes" && (
              <FileDropzone
                label="Attachment File *"
                value={attachmentFileId}
                onChange={setAttachmentFileId}
                context={`checklist_${task.TASK_ID}`}
              />
            )}
          </>
        )}

        {error && <p style={{ color: "#d32f2f", fontSize: 13, marginTop: 8 }}>{error}</p>}
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
        <button className="btn" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </FormModal>
  );
}
