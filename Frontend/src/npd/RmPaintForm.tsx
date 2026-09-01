import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { useIsMobile } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import { createTaxonomyRow, previewRmPaintCode, previewPlainRandomId } from "./lib/npdApi";

interface Props {
  onClose: () => void;
  onSaved: (paintDescription: string) => void;
}

/** "RM ref Paint Form" — the nested "+ New" form opened from RmSkuForm.tsx's Paint
 * SearchableSelect, matching the real reference field-for-field, in order: TIMESTAMP,
 * USEREMAIL, Unique ID, Code, Paint Description. Simpler than RmCategoryForm.tsx/
 * RmSubCategoryForm.tsx — `RM ref Paint` has no `Against id`/dead-pointer column and no
 * `DUPLICACY` at all (confirmed live — see npdPartCode.ts's nextPaintCode() doc comment), so
 * there's nothing to preview beyond `Code` itself. Unique ID is a format-matching preview
 * only, not a predicted real value — see RmCategoryForm.tsx's own doc comment for why. */
export function RmPaintForm({ onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [paintDescription, setPaintDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const [previewUniqueId] = useState(previewPlainRandomId);

  const { data: preview, isError: previewFailed } = useQuery({
    queryKey: ["npd", "taxonomy", "rm-paint", "preview"],
    queryFn: previewRmPaintCode,
    retry: 1,
  });

  function canSave() {
    return !!paintDescription.trim() && !saving;
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      await createTaxonomyRow("rm-paint", { "Paint Description": paintDescription.trim() });
      onSaved(paintDescription.trim());
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div
        style={{
          position: "relative",
          width: isMobile ? "100%" : "min(30vw, 560px)",
          height: "100%",
          background: "#fff",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 64,
            flexShrink: 0,
            padding: "0 24px",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 20,
              height: 20,
              border: "none",
              background: "transparent",
              color: "#6B7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A1A1A", whiteSpace: "nowrap" }}>
            RM ref Paint Form
          </h2>
        </div>

        <div style={{ padding: "32px 24px", overflowY: "auto", flex: 1 }}>
          <TextField label="TIMESTAMP" value={now.toLocaleString()} disabled />
          <TextField label="USEREMAIL" value={user?.employeeId ?? ""} disabled />
          <TextField label="Unique ID" value={previewUniqueId} disabled />
          <TextField label="Code" value={preview ? preview.code : previewFailed ? "—" : "Loading…"} disabled />
          <TextField
            label="Paint Description"
            required
            value={paintDescription}
            onChange={(e) => setPaintDescription(e.target.value)}
            placeholder="Type a paint description…"
          />
          {error && <p style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{error}</p>}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: 64,
            flexShrink: 0,
            padding: "0 24px",
            borderTop: "1px solid #E5E7EB",
            background: "#fff",
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "1px solid #D1D5DB",
              background: "#fff",
              color: "#1A1A1A",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave()}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "none",
              background: "#C0392B",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: canSave() ? "pointer" : "default",
              opacity: canSave() ? 1 : 0.6,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
