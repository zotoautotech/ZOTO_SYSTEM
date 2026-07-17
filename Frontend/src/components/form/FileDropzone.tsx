import { useRef, useState } from "react";
import { api } from "../../lib/api";

interface FileDropzoneProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
}

export function FileDropzone({ label, value, onChange }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(res.data.url);
    } catch {
      setError("Upload failed — check file type (PDF/PNG/JPG) and size (max 10MB)");
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
      <div
        onClick={() => inputRef.current?.click()}
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
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ color: "var(--color-primary)" }}
          >
            📄 View attachment
          </a>
        ) : (
          <span className="text-muted">📄 Click to upload PDF/PNG/JPG</span>
        )}
      </div>
      {error && <p style={{ color: "var(--color-error)", fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}
