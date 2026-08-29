import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDropzone } from "../components/form/FileDropzone";
import { openAttachment } from "../lib/attachments";
import {
  getProject,
  listConversation,
  postConversationMessage,
  closeProject,
  listNpdAttachments,
  createNpdAttachment,
  submitQualityReview,
  submitDesignHodReview,
  type NpdAttachmentRecord,
} from "./lib/npdApi";

const DOC_TYPES = ["3D Model", "2D Drawing", "Isometric View", "DVP Plan", "PPAP", "Warranty Terms"];

/** Project detail (build-prompt §7 screen 2's detail panel: Conversation / Attachments /
 * Reviews tabs, flattened onto one scrolling page rather than actual tabs — there's little
 * enough content per section that tabs would just add a click). Attachment review actions are
 * shown to everyone; the real gate is server-side (Quality/Design HOD or Admin only,
 * npdPermissions.ts) — same "form check is UX-only" convention as the Part Code Request queue. */
export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");
  const [newDocType, setNewDocType] = useState(DOC_TYPES[0]);
  const [newFile, setNewFile] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeRemarks, setCloseRemarks] = useState("");
  const [actionError, setActionError] = useState("");
  const [reviewRemarks, setReviewRemarks] = useState<Record<string, string>>({});

  const { data: project, isLoading } = useQuery({
    queryKey: ["npd", "projects", id],
    queryFn: () => getProject(id!),
    enabled: !!id,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["npd", "projects", id, "conversation"],
    queryFn: () => listConversation(id!),
    enabled: !!id,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["npd", "npd-attachments", id],
    queryFn: () => listNpdAttachments(id!),
    enabled: !!id,
  });

  function refreshProject() {
    queryClient.invalidateQueries({ queryKey: ["npd", "projects", id] });
    queryClient.invalidateQueries({ queryKey: ["npd", "projects"] });
  }

  async function handleSendMessage() {
    if (!newMessage.trim() || !id) return;
    await postConversationMessage(id, newMessage.trim());
    setNewMessage("");
    queryClient.invalidateQueries({ queryKey: ["npd", "projects", id, "conversation"] });
  }

  async function handleAddAttachment() {
    if (!newFile || !id) return;
    setActionError("");
    try {
      await createNpdAttachment({ projectId: id, docType: newDocType, file: newFile });
      setNewFile("");
      queryClient.invalidateQueries({ queryKey: ["npd", "npd-attachments", id] });
      refreshProject();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setActionError(detail ?? "Could not add attachment — please try again.");
    }
  }

  async function handleReview(attachmentId: string, kind: "quality" | "design", decision: "Approved" | "Rejected") {
    setActionError("");
    try {
      const remarks = reviewRemarks[`${attachmentId}-${kind}`];
      if (kind === "quality") await submitQualityReview(attachmentId, decision, remarks);
      else await submitDesignHodReview(attachmentId, decision, remarks);
      queryClient.invalidateQueries({ queryKey: ["npd", "npd-attachments", id] });
      refreshProject();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setActionError(detail ?? "Could not submit review — please try again.");
    }
  }

  async function handleClose() {
    if (!closeRemarks.trim() || !id) return;
    setActionError("");
    try {
      await closeProject(id, closeRemarks.trim());
      setClosing(false);
      setCloseRemarks("");
      refreshProject();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setActionError(detail ?? "Could not close project — please try again.");
    }
  }

  if (isLoading || !project) return <p className="text-muted" style={{ marginTop: 16 }}>Loading…</p>;

  return (
    <div style={{ marginTop: 16, maxWidth: 720 }}>
      <button className="btn" onClick={() => navigate("/npd/projects")} style={{ marginBottom: 16 }}>
        ← Back to Projects
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{project["Project Name"]}</h2>
          <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {project["Customer Name"] || "—"} · {project.Segment || "—"} · Status: <strong>{project.Status}</strong>
          </p>
        </div>
        {project.Status !== "Closed" && (
          <button className="btn" onClick={() => setClosing(true)}>
            Close Project
          </button>
        )}
      </div>

      {project["Project Description"] && <p style={{ fontSize: 14 }}>{project["Project Description"]}</p>}
      {project.Status === "Closed" && project["Closing Remarks"] && (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Closing remarks: {project["Closing Remarks"]}
        </p>
      )}

      {actionError && <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 8 }}>{actionError}</p>}

      {closing && (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Close Project</h3>
          <textarea
            value={closeRemarks}
            onChange={(e) => setCloseRemarks(e.target.value)}
            placeholder="Closing remarks…"
            style={{
              width: "100%",
              minHeight: 70,
              padding: 10,
              borderRadius: "var(--radius)",
              border: "1px solid var(--color-border)",
              fontSize: 14,
              marginBottom: 10,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => setClosing(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!closeRemarks.trim()} onClick={handleClose}>
              Confirm Close
            </button>
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 32, fontSize: 16 }}>NPD Attachments</h3>
      {attachments.map((a) => (
        <AttachmentRow
          key={a["Attachment ID"]}
          attachment={a}
          reviewRemarks={reviewRemarks}
          setReviewRemarks={setReviewRemarks}
          onReview={handleReview}
        />
      ))}

      <div className="card" style={{ padding: 16, marginTop: 12 }}>
        <h4 style={{ marginTop: 0, fontSize: 14 }}>Add Attachment</h4>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Doc Type</label>
          <select
            value={newDocType}
            onChange={(e) => setNewDocType(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--color-border)",
              fontSize: 14,
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <FileDropzone label="File" value={newFile} onChange={setNewFile} context={id} />
        <button className="btn btn-primary" disabled={!newFile} onClick={handleAddAttachment}>
          Add Attachment
        </button>
      </div>

      <h3 style={{ marginTop: 32, fontSize: 16 }}>Conversation</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {messages.map((m, i) => (
          <div key={i} className="card" style={{ padding: 10, fontSize: 13 }}>
            <div className="text-muted" style={{ fontSize: 11, marginBottom: 2 }}>
              {m.Useremail} · {new Date(m.Timestamp).toLocaleString()}
            </div>
            {m.Message}
          </div>
        ))}
        {messages.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No messages yet.</p>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Write a message…"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--color-border)",
            fontSize: 14,
          }}
        />
        <button className="btn btn-primary" disabled={!newMessage.trim()} onClick={handleSendMessage}>
          Send
        </button>
      </div>
    </div>
  );
}

function AttachmentRow({
  attachment,
  reviewRemarks,
  setReviewRemarks,
  onReview,
}: {
  attachment: NpdAttachmentRecord;
  reviewRemarks: Record<string, string>;
  setReviewRemarks: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  onReview: (attachmentId: string, kind: "quality" | "design", decision: "Approved" | "Rejected") => void;
}) {
  const id = attachment["Attachment ID"];
  return (
    <div className="card" style={{ padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>{attachment["Doc Type"]}</strong>
          <button
            className="btn"
            style={{ marginLeft: 10, padding: "2px 8px", fontSize: 12 }}
            onClick={() => openAttachment(attachment.File)}
          >
            View
          </button>
        </div>
      </div>

      {(["quality", "design"] as const).map((kind) => {
        const field = kind === "quality" ? "Quality Review" : "Design HOD Review";
        const decision = attachment[field];
        return (
          <div key={kind} style={{ marginTop: 10, fontSize: 13 }}>
            <span className="text-muted">{field}: </span>
            {/* var(--color-primary) is this app's brand red, same hue family as
             * var(--color-error) — using it for "Approved" made both decisions read as
             * near-identical red and was genuinely hard to tell apart at a glance (caught
             * during Sprint 4 browser verification). Match StatusBadge.tsx's own established
             * green/red convention instead (#2E7D32/#C62828), the only place this app already
             * draws an approve/reject-style distinction. */}
            {decision ? (
              <span style={{ fontWeight: 600, color: decision === "Approved" ? "#2E7D32" : "#C62828" }}>
                {decision}
              </span>
            ) : (
              <>
                <input
                  placeholder="Remarks (optional)"
                  value={reviewRemarks[`${id}-${kind}`] ?? ""}
                  onChange={(e) => setReviewRemarks((prev) => ({ ...prev, [`${id}-${kind}`]: e.target.value }))}
                  style={{
                    width: 220,
                    padding: "4px 8px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                    marginRight: 8,
                  }}
                />
                <button className="btn" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => onReview(id, kind, "Approved")}>
                  Approve
                </button>{" "}
                <button className="btn" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => onReview(id, kind, "Rejected")}>
                  Reject
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
