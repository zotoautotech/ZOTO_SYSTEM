import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { api } from "../../lib/api";
import { openAttachment } from "../../lib/attachments";
import { handlePageNavKeyDown } from "../../lib/keyboardNav";

interface FileDropzoneProps {
  label: string;
  /** A Drive file ID (current uploads store this — never a raw Drive link). */
  value: string;
  onChange: (fileId: string) => void;
  /** Included in the auto-generated Drive filename (e.g. an order ID) so files are easy
   * to find by record, matching the AppSheet-style naming the old system used. */
  context?: string;
}

export function FileDropzone({ label, value, onChange, context }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (context) formData.append("context", context);
      const res = await api.post("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(res.data.fileId);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail || "Upload failed — check file type (PDF/PNG/JPG) and size (max 10MB)");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        style={{ display: "none" }}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {/* This used to be a plain <div onClick> — not focusable at all (and the hidden
       * <input type="file"> above is display:none, also excluded from tab order), so Tab
       * silently skipped straight over the whole upload control. tabIndex + role="button"
       * make it a real Tab stop; Enter/Space open the file picker like a click would.
       * PageUp/PageDown reuse the same shared field-to-field navigation every other field
       * uses (see lib/keyboardNav.ts). */}
      <div
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          } else {
            handlePageNavKeyDown(e);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={value ? `${label}: view attachment` : `${label}: click to upload`}
        className="card"
        style={{
          padding: 24,
          textAlign: "center",
          cursor: "pointer",
          background: "var(--color-bg-page)",
        }}
      >
        {uploading ? (
          <span className="text-muted">Uploading…</span>
        ) : value ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openAttachment(value);
            }}
            style={{ color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", font: "inherit" }}
          >
            📄 View attachment
          </button>
        ) : (
          <span className="text-muted">📄 Click to upload PDF/PNG/JPG</span>
        )}
      </div>
      {error && <p style={{ color: "var(--color-error)", fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}
