import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, readTable, updateRow } from "../../services/sheets.js";
import { nextSequentialId } from "../../services/ids.js";

/**
 * Projects board (build-prompt §5.1, §7 screen 2). New `PROJECTS` tab on env.sheets.npd,
 * trimmed from the xlsx workbook's 22 columns to the 13 this app actually uses (dropped
 * `Approval Details`/`Priority Timestamp`/attachment-count columns — attachments are read
 * live from the `NPD ATTACHMENT` tab instead of duplicated here). Status transitions are
 * enforced by services/npdProjectStatus.ts, called from here (creation, closing) and from
 * npdAttachment.ts (upload, review decisions) — never a raw field write.
 */
export const projectsRouter = Router();

const TAB = "PROJECTS";
const ID_COLUMN = "Project ID";

projectsRouter.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await readTable(env.sheets.npd, TAB);
    res.json({ projects: status ? rows.filter((r) => r.Status === status) : rows });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/:id", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.npd, TAB);
    const project = rows.find((r) => r[ID_COLUMN] === req.params.id);
    if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

const CreateSchema = z.object({
  segment: z.string().trim().optional(),
  projectName: z.string().trim().min(1),
  projectDescription: z.string().trim().optional(),
  projectDeadline: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
  assignedTo: z.string().trim().optional(),
  priority: z.string().trim().optional(),
});

projectsRouter.post("/", async (req, res, next) => {
  try {
    const body = CreateSchema.parse(req.body);
    const id = await nextSequentialId(env.sheets.npd, TAB, ID_COLUMN, "PROJ");
    await appendRow(env.sheets.npd, TAB, {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      [ID_COLUMN]: id,
      Segment: body.segment ?? "",
      "Project Name": body.projectName,
      "Project Description": body.projectDescription ?? "",
      "Project Deadline": body.projectDeadline ?? "",
      "Customer Name": body.customerName ?? "",
      "Assigned By": req.user!.employeeId,
      "Assigned To": body.assignedTo ?? "",
      Priority: body.priority ?? "",
      Status: "Open",
    });
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

const UpdateSchema = CreateSchema.partial();

projectsRouter.put("/:id", async (req, res, next) => {
  try {
    const body = UpdateSchema.parse(req.body);
    const patch: Record<string, string> = {};
    if (body.segment !== undefined) patch.Segment = body.segment;
    if (body.projectName !== undefined) patch["Project Name"] = body.projectName;
    if (body.projectDescription !== undefined) patch["Project Description"] = body.projectDescription;
    if (body.projectDeadline !== undefined) patch["Project Deadline"] = body.projectDeadline;
    if (body.customerName !== undefined) patch["Customer Name"] = body.customerName;
    if (body.assignedTo !== undefined) patch["Assigned To"] = body.assignedTo;
    if (body.priority !== undefined) patch.Priority = body.priority;

    await updateRow(env.sheets.npd, TAB, ID_COLUMN, req.params.id, patch);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const CloseSchema = z.object({ remarks: z.string().trim().min(1) });

/** Manual, never automatic — see npdProjectStatus.ts's own doc comment on why closing isn't
 * part of the auto-transition chain. */
projectsRouter.post("/:id/close", async (req, res, next) => {
  try {
    const { remarks } = CloseSchema.parse(req.body);
    const rows = await readTable(env.sheets.npd, TAB, { refresh: true });
    const project = rows.find((r) => r[ID_COLUMN] === req.params.id);
    if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    if (project.Status === "Closed") {
      return res.status(409).json({ error: { code: "ALREADY_CLOSED", message: "Project already closed" } });
    }

    await updateRow(env.sheets.npd, TAB, ID_COLUMN, req.params.id, {
      Status: "Closed",
      "Closing Remarks": remarks,
    });
    res.json({ id: req.params.id, status: "Closed" });
  } catch (err) {
    next(err);
  }
});

// --- Conversation (simple per-project comment thread, build-prompt §3's CONVERSATION table) ---

projectsRouter.get("/:id/conversation", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.npd, "CONVERSATION");
    const messages = rows.filter((r) => r["Project ID"] === req.params.id);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

const MessageSchema = z.object({ message: z.string().trim().min(1) });

projectsRouter.post("/:id/conversation", async (req, res, next) => {
  try {
    const { message } = MessageSchema.parse(req.body);
    await appendRow(env.sheets.npd, "CONVERSATION", {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      "Project ID": req.params.id,
      Message: message,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
