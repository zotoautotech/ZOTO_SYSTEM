import { useState } from "react";
import { isAxiosError } from "axios";
import { FormModal } from "../components/form/FormModal";
import { TextField } from "../components/form/TextField";
import { useIsMobile } from "../lib/responsive";
import { createProject } from "./lib/npdApi";

interface Props {
  onClose: () => void;
  onSaved: (id: string) => void;
}

/** New Project intake (build-prompt §5.1 step 1) — segment/name/customer/deadline/assignee.
 * Status always starts "Open" server-side; not a field here. */
export function ProjectForm({ onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [projectName, setProjectName] = useState("");
  const [segment, setSegment] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectDeadline, setProjectDeadline] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function canSave() {
    return projectName.trim() !== "";
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      const { id } = await createProject({
        projectName,
        segment: segment || undefined,
        customerName: customerName || undefined,
        projectDescription: projectDescription || undefined,
        projectDeadline: projectDeadline || undefined,
        assignedTo: assignedTo || undefined,
        priority: priority || undefined,
      });
      onSaved(id);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="New Project" onClose={onClose} size="standard" sectionLabel="Project Details">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <TextField label="Project Name" required value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        <TextField label="Segment" value={segment} onChange={(e) => setSegment(e.target.value)} />
        <TextField label="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <TextField label="Project Description" value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} />
        <TextField label="Project Deadline" type="date" value={projectDeadline} onChange={(e) => setProjectDeadline(e.target.value)} />
        <TextField label="Assigned To" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
        <TextField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} />
        {error && <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 8 }}>{error}</p>}
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
          {saving ? "Saving…" : "Create Project"}
        </button>
      </div>
    </FormModal>
  );
}
