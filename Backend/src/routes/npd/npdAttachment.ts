import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, readTable, updateRow } from "../../services/sheets.js";
import { nextSequentialId } from "../../services/ids.js";
import { hasNpdRole } from "../npdPermissions.js";
import { onFirstAttachmentUploaded, onAllAttachmentsApproved, type ProjectStatus } from "../../services/npdProjectStatus.js";

/**
 * NPD Attachment upload + review pipeline (build-prompt §5.1). New `NPD ATTACHMENT` tab on
 * env.sheets.npd. The actual file bytes go through the existing `Backend/src/routes/uploads.ts`
 * flow (private Drive file, view-token stream) — this tab only stores the returned fileId, same
 * pattern every other attachment field in this app already uses. `Doc Type` is a free-text
 * field on the frontend for now (3D Model / 2D Drawing / Isometric View / DVP Plan / PPAP /
 * Warranty Terms per the build prompt) rather than a taxonomy-backed dropdown — these are fixed,
 * small, unlikely-to-change categories, unlike Segment/Category which come from live sheets.
 *
 * "Quality Review" and "Design HOD Review" are both gated on the single "quality" NPD role —
 * the build prompt's own Roles table lists them as one combined role ("Quality/Design HOD:
 * Review & approve attachments, verify BOM items"), so this app doesn't have a separate
 * "design-hod" role to distinguish them. If that ever needs splitting, add a new NpdRole and
 * gate design-hod-review on it specifically.
 */
export const npdAttachmentRouter = Router();

const TAB = "NPD ATTACHMENT";
const ID_COLUMN = "Attachment ID";

async function projectStatusOf(projectId: string): Promise<string | undefined> {
  const rows = await readTable(env.sheets.npd, "PROJECTS");
  return rows.find((r) => r["Project ID"] === projectId)?.Status;
}

/** After a review decision, checks whether EVERY attachment on the project now has both
 * reviews Approved, and advances the project's status if so (services/npdProjectStatus.ts). */
async function maybeAdvanceOnAllApproved(projectId: string): Promise<void> {
  const rows = await readTable(env.sheets.npd, TAB, { refresh: true });
  const attachments = rows.filter((r) => r["Project ID"] === projectId);
  if (attachments.length === 0) return;
  const allApproved = attachments.every(
    (a) => a["Quality Review"] === "Approved" && a["Design HOD Review"] === "Approved"
  );
  if (!allApproved) return;

  const currentStatus = await projectStatusOf(projectId);
  if (!currentStatus) return;
  const nextStatus = onAllAttachmentsApproved(currentStatus as ProjectStatus);
  if (nextStatus !== currentStatus) {
    await updateRow(env.sheets.npd, "PROJECTS", "Project ID", projectId, { Status: nextStatus });
  }
}

npdAttachmentRouter.get("/", async (req, res, next) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    if (!projectId) {
      return res.status(400).json({ error: { code: "MISSING_PROJECT_ID", message: "projectId query param required" } });
    }
    const rows = await readTable(env.sheets.npd, TAB);
    res.json({ attachments: rows.filter((r) => r["Project ID"] === projectId) });
  } catch (err) {
    next(err);
  }
});

const CreateSchema = z.object({
  projectId: z.string().trim().min(1),
  docType: z.string().trim().min(1),
  file: z.string().trim().min(1),
});

npdAttachmentRouter.post("/", async (req, res, next) => {
  try {
    const body = CreateSchema.parse(req.body);

    const currentStatus = await projectStatusOf(body.projectId);
    if (!currentStatus) return res.status(404).json({ error: { code: "PROJECT_NOT_FOUND", message: "Project not found" } });

    const id = await nextSequentialId(env.sheets.npd, TAB, ID_COLUMN, "ATT");
    await appendRow(env.sheets.npd, TAB, {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      [ID_COLUMN]: id,
      "Project ID": body.projectId,
      "Doc Type": body.docType,
      File: body.file,
      "Quality Review": "",
      "Design HOD Review": "",
    });

    const nextStatus = onFirstAttachmentUploaded(currentStatus as ProjectStatus);
    if (nextStatus !== currentStatus) {
      await updateRow(env.sheets.npd, "PROJECTS", "Project ID", body.projectId, { Status: nextStatus });
    }

    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

const ReviewSchema = z.object({
  decision: z.enum(["Approved", "Rejected"]),
  remarks: z.string().trim().optional(),
});

async function handleReview(
  field: "Quality Review" | "Design HOD Review",
  timestampField: "Quality Review Timestamp" | "Design HOD Review Timestamp",
  remarksField: "Quality Review Remarks" | "Design HOD Review Remarks",
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) {
  try {
    const allowed = await hasNpdRole(req.user!.employeeId, ["quality"]);
    if (!allowed) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Quality/Design HOD or Admin only" } });

    const body = ReviewSchema.parse(req.body);
    const rows = await readTable(env.sheets.npd, TAB, { refresh: true });
    const attachment = rows.find((r) => r[ID_COLUMN] === req.params.id);
    if (!attachment) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Attachment not found" } });

    await updateRow(env.sheets.npd, TAB, ID_COLUMN, req.params.id, {
      [field]: body.decision,
      [remarksField]: body.remarks ?? "",
      [timestampField]: new Date().toISOString(),
    });

    if (body.decision === "Approved") {
      await maybeAdvanceOnAllApproved(attachment["Project ID"]);
    }

    res.json({ id: req.params.id, [field]: body.decision });
  } catch (err) {
    next(err);
  }
}

npdAttachmentRouter.post("/:id/quality-review", (req, res, next) =>
  handleReview("Quality Review", "Quality Review Timestamp", "Quality Review Remarks", req, res, next)
);

npdAttachmentRouter.post("/:id/design-hod-review", (req, res, next) =>
  handleReview("Design HOD Review", "Design HOD Review Timestamp", "Design HOD Review Remarks", req, res, next)
);
