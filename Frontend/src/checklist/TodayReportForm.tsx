import { useEffect, useState } from "react";
import { FormModal } from "../components/form/FormModal";
import { getTodayReport, saveTodayReport } from "./lib/checklistApi";

/** "Today's Report" notepad popup — opened from MyTasksList.tsx's header button. Fetches
 * the auto-generated Completed/Pending summary (GET /checklist/today-report) the instant it
 * mounts and shows it in an editable textarea; the doer can add to/edit the auto-generated
 * text before saving. Save always appends a brand-new row to "Doer wise Notepad report"
 * (never updates a prior one) — so re-opening and saving again later the same day keeps a
 * full history of updates through the day, not just the latest edit. */
export function TodayReportForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTodayReport()
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't generate the report. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await saveTodayReport(text);
      onSaved();
      onClose();
    } catch {
      setError("Couldn't save the report. Try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="Today's Report" onClose={onClose} size="standard">
      <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 16, gap: 12 }}>
        {loading ? (
          <p className="text-muted" style={{ margin: "auto" }}>
            Generating today's report…
          </p>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Today's report…"
              style={{
                flex: 1,
                width: "100%",
                resize: "none",
                padding: 12,
                borderRadius: "var(--radius)",
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                color: "var(--color-text)",
                fontSize: 14,
                fontFamily: "inherit",
                lineHeight: 1.5,
              }}
            />
            {error && (
              <p style={{ color: "var(--color-error)", fontSize: 13, margin: 0 }}>{error}</p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !text.trim()}>
                {saving ? "Saving…" : "Save Report"}
              </button>
            </div>
          </>
        )}
      </div>
    </FormModal>
  );
}
