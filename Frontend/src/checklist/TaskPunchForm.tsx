import { useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { FormModal } from "../components/form/FormModal";
import { TextField } from "../components/form/TextField";
import { SearchableSelect } from "../components/form/SearchableSelect";
import { useIsMobile } from "../lib/responsive";
import { listDoers, punchTask } from "./lib/checklistApi";

// Matches Task List Master's Frequency enum exactly (D/W/M/Y/Q/F/E1st..ELast) — the existing
// Apps Script recurrence engine only knows these exact codes.
const FREQUENCY_OPTIONS = [
  { value: "D", label: "Daily" },
  { value: "W", label: "Weekly" },
  { value: "M", label: "Monthly" },
  { value: "Y", label: "Yearly" },
  { value: "Q", label: "Quarterly" },
  { value: "F", label: "Fortnightly" },
  { value: "E1st", label: "Every 1st <weekday> of month" },
  { value: "E2nd", label: "Every 2nd <weekday> of month" },
  { value: "E3rd", label: "Every 3rd <weekday> of month" },
  { value: "E4th", label: "Every 4th <weekday> of month" },
  { value: "ELast", label: "Every last <weekday> of month" },
];

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

/** Punch-in form for a new Checklist task template — writes one row to Task List Master.
 * The existing Apps Script trigger (untouched) routes + expands it into dated instances;
 * this form never talks to Master Accounts directly. */
export function TaskPunchForm({ onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const { data: doers = [] } = useQuery({ queryKey: ["checklist", "doers"], queryFn: listDoers });

  const [task, setTask] = useState("");
  const [doerId, setDoerId] = useState("");
  const [department, setDepartment] = useState("");
  const [frequency, setFrequency] = useState("D");
  const [dayDate, setDayDate] = useState("");
  const [times, setTimes] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const doerOptions = doers
    .filter((d) => d.EMP_ID)
    .map((d) => ({ value: d.EMP_ID, label: d.NAME, subtitle: d.DESIGNATION }));

  function canSave() {
    return task.trim() !== "" && doerId !== "" && dayDate !== "" && (frequency === "D" || times.trim() !== "");
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await punchTask({
        task,
        doerId,
        department,
        frequency,
        dayDate,
        times: frequency === "D" ? undefined : times,
        endDate: endDate || undefined,
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="Give Task" onClose={onClose} size="standard" sectionLabel="Task Details">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <TextField label="Task" required value={task} onChange={(e) => setTask(e.target.value)} />

        <SearchableSelect
          label="Doer"
          required
          value={doerId}
          onChange={(value, option) => {
            setDoerId(value);
            const doer = doers.find((d) => d.EMP_ID === value);
            setDepartment(doer?.DEPARTMENT ?? "");
            void option;
          }}
          options={doerOptions}
          placeholder="Search doer…"
        />

        {department && (
          <p className="text-muted" style={{ fontSize: 13, marginTop: -12, marginBottom: 20 }}>
            Department: {department}
          </p>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
            Frequency <span style={{ color: "var(--color-error)" }}>*</span>
          </label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--color-border)",
              fontSize: 14,
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          >
            {FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <TextField
          label="Day/Date (next due date)"
          required
          type="datetime-local"
          value={dayDate}
          onChange={(e) => setDayDate(e.target.value)}
        />

        {frequency !== "D" && (
          <TextField
            label="Times"
            required
            type="number"
            min={0}
            max={8}
            value={times}
            onChange={(e) => setTimes(e.target.value)}
          />
        )}

        <TextField
          label="End Date (optional — defaults to financial year end)"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />

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
