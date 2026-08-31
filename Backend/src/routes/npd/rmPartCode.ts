import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, readTable } from "../../services/sheets.js";
import { nextSequentialId } from "../../services/ids.js";
import { generateRmPartCode, RmPartCodeLookupError } from "../../services/npdPartCode.js";
import { hasNpdRole } from "../npdPermissions.js";

/**
 * RM Part Code Generator — the corrected, real Design-side workflow, replacing the earlier
 * assumption that "New Part Code Request" was where codes get created (it isn't — that tab is
 * a Sales request to assign an ALREADY-EXISTING code to a new customer; see
 * partCodeRequest.ts's own doc comment and NPD/CONTEXT.md's Sprint 7 notes for the full trace
 * that established this). This route is Design/Admin only, matches how the real legacy system
 * worked (a Design-side person picks Category/Sub-Category/Paint/Design-By from the fixed
 * vocabulary tables, the code is then deterministically assembled — see npdPartCode.ts), and
 * creates the actual `Raw Material SKU` row.
 */
export const rmPartCodeRouter = Router();

const GenerateSchema = z.object({
  category: z.string().trim().min(1),
  subCategory: z.string().trim().min(1),
  paintDescription: z.string().trim().min(1),
  designByLabel: z.string().trim().min(1),
  vendorName: z.string().trim().optional(),
});

rmPartCodeRouter.post("/generate", async (req, res, next) => {
  try {
    const allowed = await hasNpdRole(req.user!.employeeId, ["design"]);
    if (!allowed) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Design or Admin only" } });

    const body = GenerateSchema.parse(req.body);
    const result = await generateRmPartCode(body);

    // Duplicate check — same category/sub-category/paint/design-by combo already existing as
    // a PART NO. prefix+suffix would mean this is a re-request, not a genuinely new part. The
    // 3-digit counter already makes each generated code unique, so this mainly guards against
    // a double-click/double-submit producing two rows for what's really the same physical part
    // request in the same moment — same server-side-gate convention used everywhere else in
    // this app.
    const existing = await readTable(env.sheets.npd, "Raw Material SKU", { refresh: true });
    if (existing.some((r) => r["PART NO."] === result.partCode)) {
      return res.status(409).json({ error: { code: "DUPLICATE", message: "That exact part code was just generated — try again" } });
    }

    const id = await nextSequentialId(env.sheets.npd, "Raw Material SKU", "ID'S", "RM");
    await appendRow(env.sheets.npd, "Raw Material SKU", {
      TIMESTAMP: new Date().toISOString(),
      USEREMAIL: req.user!.employeeId,
      "ID'S": id,
      "PART NO.": result.partCode,
      Category: body.category,
      "Sub Category": body.subCategory,
      Paint: body.paintDescription,
      "VENDOR NAME": body.vendorName ?? "",
    });

    res.status(201).json({ id, ...result });
  } catch (err) {
    if (err instanceof RmPartCodeLookupError) {
      return res.status(422).json({ error: { code: err.code, message: err.message } });
    }
    next(err);
  }
});
