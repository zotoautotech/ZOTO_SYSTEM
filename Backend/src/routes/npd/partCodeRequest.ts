import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, readTable, updateRow } from "../../services/sheets.js";
import { nextSequentialId } from "../../services/ids.js";
import { generatePartCode, NoLettersAvailableError } from "../../services/npdPartCode.js";
import { hasNpdRole } from "../npdPermissions.js";
import { getCatalogTable } from "./taxonomy.js";

/**
 * New / Replacement Part-Code Request workflow (build-prompt §5.2). New tab, "New Part Code
 * Request" on env.sheets.npd (the live RM spreadsheet) — trimmed down from the xlsx workbook's
 * 25-column version to the fields this app actually collects/shows (see NPD/CONTEXT.md).
 *
 * Flow: anyone with NPD access can submit a request (Status: "Requested"). Approving it
 * (design/admin only) generates the actual part code — base code taken from the chosen
 * category's own taxonomy row (`FG ref Category DD` / `RM ref Category DD`'s `CODE` column,
 * see npd/taxonomy.ts), suffixed by the next unused Alphabet letter (npdPartCode.ts) — and
 * inserts the new row into the matching SKU catalog (FINAL GOOD SKU or Raw Material SKU).
 * Rejecting just records a note, no catalog write.
 */
export const partCodeRequestRouter = Router();

const TAB = "New Part Code Request";
const ID_COLUMN = "Part Request ID";

const CreateSchema = z.object({
  partType: z.enum(["FG", "RM"]),
  customerName: z.string().trim().optional(),
  oldPartCode: z.string().trim().optional(),
  segment: z.string().trim().optional(),
  category: z.string().trim().min(1),
  subCategory: z.string().trim().min(1),
  partName: z.string().trim().min(1),
  partDescription: z.string().trim().optional(),
  attachment: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
});

/** Duplicate detection (build-prompt §5.2's "DUPLICACY"/"Is part code is new" check) — against
 * the real target catalog, not just other requests. FG's catalog has a `Name` column to compare
 * against directly; the RM catalog has no equivalent "name" field (a raw material's identity is
 * really its Category+Sub Category+Paint combo, PART NO. is usually still blank at this stage),
 * so RM compares on that combo instead. */
async function findDuplicate(body: z.infer<typeof CreateSchema>): Promise<boolean> {
  if (body.partType === "FG") {
    const table = getCatalogTable("fg-sku");
    const rows = await readTable(table.spreadsheetId, table.tab, { refresh: true });
    return rows.some((r) => (r.Name ?? "").trim().toLowerCase() === body.partName.trim().toLowerCase());
  }
  const table = getCatalogTable("rm-sku");
  const rows = await readTable(table.spreadsheetId, table.tab, { refresh: true });
  return rows.some(
    (r) =>
      (r.Category ?? "").trim().toLowerCase() === body.category.trim().toLowerCase() &&
      (r["Sub Category"] ?? "").trim().toLowerCase() === body.subCategory.trim().toLowerCase()
  );
}

/** The taxonomy row's own CODE column is the pre-composed segment+category+sub-category base —
 * see npdPartCode.ts's doc comment. Looked up by exact Category+Sub Category match. */
async function baseCodeFor(body: z.infer<typeof CreateSchema>): Promise<string> {
  const tab = body.partType === "FG" ? "FG ref Category DD" : "RM ref Category DD";
  const spreadsheetId = body.partType === "FG" ? env.sheets.fg : env.sheets.npd;
  const rows = await readTable(spreadsheetId, tab);
  const match = rows.find(
    (r) =>
      (r.Category ?? "").trim().toLowerCase() === body.category.trim().toLowerCase() &&
      (r["SUB CATEGORY"] ?? "").trim().toLowerCase() === body.subCategory.trim().toLowerCase()
  );
  const code = (match?.CODE ?? "").trim();
  if (!code) {
    throw Object.assign(new Error("This Category/Sub Category has no CODE set on its taxonomy row yet"), {
      httpStatus: 422,
      httpCode: "MISSING_TAXONOMY_CODE",
    });
  }
  return code;
}

partCodeRequestRouter.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await readTable(env.sheets.npd, TAB);
    res.json({ requests: status ? rows.filter((r) => r.Status === status) : rows });
  } catch (err) {
    next(err);
  }
});

partCodeRequestRouter.post("/", async (req, res, next) => {
  try {
    const body = CreateSchema.parse(req.body);

    if (await findDuplicate(body)) {
      return res.status(409).json({
        error: { code: "DUPLICATE", message: "A matching SKU already exists — this looks like a duplicate request" },
      });
    }

    const id = await nextSequentialId(env.sheets.npd, TAB, ID_COLUMN, "PCR");
    await appendRow(env.sheets.npd, TAB, {
      [ID_COLUMN]: id,
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      "Part Type": body.partType,
      "Customer Name": body.customerName ?? "",
      "Old Part Code": body.oldPartCode ?? "",
      Segment: body.segment ?? "",
      Category: body.category,
      "Sub Category": body.subCategory,
      "Part Name": body.partName,
      "Part Description": body.partDescription ?? "",
      Attachment: body.attachment ?? "",
      Remarks: body.remarks ?? "",
      Status: "Requested",
    });
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

/** Approve — Design/Admin only (requires enough authority to assign a permanent part code).
 * Generates the code, inserts the SKU row, marks the request Approved. */
partCodeRequestRouter.post("/:id/approve", async (req, res, next) => {
  try {
    const allowed = await hasNpdRole(req.user!.employeeId, ["design"]);
    if (!allowed) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Design or Admin only" } });

    const rows = await readTable(env.sheets.npd, TAB, { refresh: true });
    const request = rows.find((r) => r[ID_COLUMN] === req.params.id);
    if (!request) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Request not found" } });
    if (request.Status !== "Requested") {
      return res.status(409).json({ error: { code: "ALREADY_DECIDED", message: `Already ${request.Status}` } });
    }

    const body = {
      partType: request["Part Type"] as "FG" | "RM",
      category: request.Category,
      subCategory: request["Sub Category"],
      partName: request["Part Name"],
    };
    const baseCode = await baseCodeFor(body as z.infer<typeof CreateSchema>);
    const partCode = await generatePartCode(baseCode, req.user!.employeeId);

    const table = getCatalogTable(body.partType === "FG" ? "fg-sku" : "rm-sku");
    const newId = await nextSequentialId(table.spreadsheetId, table.tab, table.idColumn, table.idPrefix);
    const record: Record<string, string> =
      body.partType === "FG"
        ? {
            [table.idColumn]: newId,
            [table.timestampField]: new Date().toISOString(),
            [table.useremailField!]: req.user!.employeeId,
            "PART NO.": partCode,
            CATEGORY: request.Category,
            "SUB CATEGORY": request["Sub Category"],
            SEGMENT: request.Segment ?? "",
            Name: request["Part Name"],
          }
        : {
            [table.idColumn]: newId,
            [table.timestampField]: new Date().toISOString(),
            [table.useremailField!]: req.user!.employeeId,
            "PART NO.": partCode,
            Category: request.Category,
            "Sub Category": request["Sub Category"],
          };
    await appendRow(table.spreadsheetId, table.tab, record);

    await updateRow(env.sheets.npd, TAB, ID_COLUMN, req.params.id, {
      Status: "Approved",
      "Part Code": partCode,
    });

    res.json({ id: req.params.id, partCode, catalogId: newId });
  } catch (err) {
    if (err instanceof NoLettersAvailableError) {
      return res.status(503).json({ error: { code: "NO_LETTERS_AVAILABLE", message: err.message } });
    }
    if (err && typeof err === "object" && "httpStatus" in err) {
      const e = err as { httpStatus: number; httpCode: string; message: string };
      return res.status(e.httpStatus).json({ error: { code: e.httpCode, message: e.message } });
    }
    next(err);
  }
});

const RejectSchema = z.object({ note: z.string().trim().min(1) });

partCodeRequestRouter.post("/:id/reject", async (req, res, next) => {
  try {
    const allowed = await hasNpdRole(req.user!.employeeId, ["design"]);
    if (!allowed) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Design or Admin only" } });

    const { note } = RejectSchema.parse(req.body);
    const rows = await readTable(env.sheets.npd, TAB, { refresh: true });
    const request = rows.find((r) => r[ID_COLUMN] === req.params.id);
    if (!request) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Request not found" } });
    if (request.Status !== "Requested") {
      return res.status(409).json({ error: { code: "ALREADY_DECIDED", message: `Already ${request.Status}` } });
    }

    await updateRow(env.sheets.npd, TAB, ID_COLUMN, req.params.id, { Status: "Rejected", "Assign Note": note });
    res.json({ id: req.params.id });
  } catch (err) {
    next(err);
  }
});
