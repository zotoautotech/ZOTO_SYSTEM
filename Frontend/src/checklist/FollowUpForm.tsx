import { useState } from "react";
import { isAxiosError } from "axios";
import { FormModal } from "../components/form/FormModal";
import { TextField } from "../components/form/TextField";
import { FileDropzone } from "../components/form/FileDropzone";
import { useIsMobile } from "../lib/responsive";
import { submitFollowUp, type ChecklistTaskRecord } from "./lib/checklistApi";

interface Props {
  task: ChecklistTaskRecord;
  onClose: () => void;
  onSaved: () => void;
}

/** Admin-only "Update Remark" action — writes an audit-log row to the PcFollowUp tab
 * (Remarks + optional Image + File), matching the old AppSheet PcFollowUp form's three
 * fields exactly. Never touches the task's own Master Accounts row. */
export function FollowUpForm({ task, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [remarks, setRemarks] = useState("");
  const [imageFileId, setImageFileId] = useState("");
  const [fileFileId, setFileFileId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!remarks.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await submitFollowUp(task.TASK_ID, { remarks, imageFileId, fileFileId });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="Update Remark" onClose={onClose} size="standard" sectionLabel={task.TASK}>
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <TextField label="Remarks" required value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        <FileDropzone label="Image" value={imageFileId} onChange={setImageFileId} context={`followup_img_${task.TASK_ID}`} />
        <FileDropzone label="File" value={fileFileId} onChange={setFileFileId} context={`followup_file_${task.TASK_ID}`} />
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
        <button className="btn btn-primary" onClick={handleSave} disabled={!remarks.trim() || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </FormModal>
  );
}
