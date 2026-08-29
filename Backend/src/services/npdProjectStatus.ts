/**
 * Project status state-machine (build-prompt §5.1): Open → In Review → Pending Customer →
 * Closed, enforced server-side rather than as ad hoc field writes — this codebase's own
 * convention for every other status cascade (e.g. `ORDER_PUNCH.STATUS`). Pure functions, unit-
 * testable in isolation from the Sheets I/O that calls them (see routes/npd/projects.ts and
 * routes/npd/npdAttachment.ts for the call sites).
 *
 * Scope note: the build prompt also describes a "Send to Customer" flag that, once both
 * reviews are Approved, "generates a customer-facing document bundle and logs Send Remarks".
 * That document-generation piece is deliberately NOT implemented in this sprint — it would
 * need a real Google Docs template (like services/gatePass.ts's Dispatch Gate Pass), and no
 * such template exists for NPD yet. What IS implemented: the status auto-transition itself
 * (Open→In Review on first attachment upload, In Review→Pending Customer once every
 * attachment on the project has both reviews Approved). Closing is a separate, manual action
 * (see projects.ts's /:id/close) — never automatic, since only a person can judge a project
 * genuinely done.
 */
export type ProjectStatus = "Open" | "In Review" | "Pending Customer" | "Closed";

/** Called when a project's first NPD Attachment is uploaded. */
export function onFirstAttachmentUploaded(current: ProjectStatus): ProjectStatus {
  return current === "Open" ? "In Review" : current;
}

/** Called after any attachment review decision — advances the project once EVERY attachment
 * on it has both Quality Review and Design HOD Review set to "Approved". */
export function onAllAttachmentsApproved(current: ProjectStatus): ProjectStatus {
  return current === "In Review" ? "Pending Customer" : current;
}
