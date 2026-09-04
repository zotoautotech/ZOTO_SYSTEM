import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { useIsMobile } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import { createTaxonomyRow, previewDrawingFgAgainstId, previewPlainRandomId, type TaxonomyRow } from "./lib/npdApi";

interface Props {
  /** The FG SKU this drawing record belongs to — SEGMENT/CATEGORY/SUB CATEGORY/STANDARD/PAINT
   * are all read straight off it (disabled, matching the reference's own greyed pre-filled
   * look — see the screenshot: these fields show as inert placeholders, not doer-editable). */
  fgRow: TaxonomyRow;
  onClose: () => void;
  onSaved: () => void;
}

/** Attachment column, in reference field order. Live sheet header text doubles as the field
 * label — no translation needed (see taxonomy.ts's own "no npdMaps.ts for these" convention). */
const ATTACHMENT_FIELDS = [
  "2D Drawing",
  "2D Top View",
  "2D Bottom View",
  "2D Front View",
  "3D Isometric View",
  "Rear Photo",
  "Rear Video",
  "3D Video",
  "Animation Process / CAE",
];

/** "Drawing FG Form" — one attachment record per FG SKU, matching the AppSheet reference
 * screenshot field-for-field (TIMESTAMP/AGAINST ID/Unique ID/USEREMAIL/SEGMENT/CATEGORY/
 * SUB CATEGORY/STANDARD/PAINT, then the 9 drawing/video attachment columns). Same right-docked
 * panel chrome as `FgSkuForm.tsx`/`FgQuickCreateForm.tsx`.
 *
 * The 9 attachment fields are plain text (Drive fileId or URL) for now — no generic upload
 * picker exists anywhere in NPD yet (see `taxonomy.ts`'s own `drawing-fg` table comment); a
 * doer pastes a link/fileId today, real upload wiring (`uploads.ts`'s private-Drive-file flow)
 * is a follow-up, flagged rather than faked. */
export function DrawingFgForm({ fgRow, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const [previewUniqueId] = useState(previewPlainRandomId);
  const { data: preview, isError: previewFailed } = useQuery({
    queryKey: ["npd", "taxonomy", "drawing-fg", "preview"],
    queryFn: previewDrawingFgAgainstId,
    retry: 1,
  });

  function setField(field: string, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await createTaxonomyRow("drawing-fg", {
        SEGMENT: fgRow.SEGMENT ?? "",
        CATEGORY: fgRow.CATEGORY ?? "",
        "SUB CATEGORY": fgRow["SUB CATEGORY"] ?? "",
        STANDARD: fgRow["STANDARD PART"] ?? "",
        PAINT: fgRow.Brand ?? "",
        ...ATTACHMENT_FIELDS.reduce<Record<string, string>>((acc, f) => {
          if (values[f]?.trim()) acc[f] = values[f].trim();
          return acc;
        }, {}),
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div
        style={{
          position: "relative",
          width: isMobile ? "100%" : "min(38vw, 700px)",
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A1A1A", whiteSpace: "nowrap" }}>Drawing FG Form</h2>
        </div>

        <div style={{ padding: isMobile ? "24px var(--space)" : "32px 40px", overflowY: "auto", flex: 1 }}>
          <TextField label="TIMESTAMP" value={now.toLocaleString()} disabled />
          <TextField label="AGAINST ID" value={preview ? preview.againstId || "—" : previewFailed ? "—" : "Loading…"} disabled />
          <TextField label="Unique ID" value={previewUniqueId} disabled />
          <TextField label="USEREMAIL" value={user?.employeeId ?? ""} disabled />
          <TextField label="SEGMENT" value={fgRow.SEGMENT ?? "—"} disabled />
          <TextField label="CATEGORY" value={fgRow.CATEGORY ?? "—"} disabled />
          <TextField label="SUB CATEGORY" value={fgRow["SUB CATEGORY"] ?? "—"} disabled />
          <TextField label="STANDARD" value={fgRow["STANDARD PART"] || "—"} disabled />
          <TextField label="PAINT" value={fgRow.Brand || "—"} disabled />
          {ATTACHMENT_FIELDS.map((f) => (
            <TextField
              key={f}
              label={f}
              value={values[f] ?? ""}
              onChange={(e) => setField(f, e.target.value)}
              placeholder="Drive file link or ID…"
            />
          ))}
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
            disabled={saving}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "none",
              background: "#C0392B",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
