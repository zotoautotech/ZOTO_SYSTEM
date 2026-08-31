import { NextFunction, Request, Response, Router } from "express";
import { hasNpdAccess } from "../npdPermissions.js";
import { requireAuth } from "../../middleware/auth.js";
import { taxonomyRouter } from "./taxonomy.js";
import { partCodeRequestRouter } from "./partCodeRequest.js";
import { bomRouter } from "./bom.js";
import { changelogRouter } from "./changelog.js";
import { projectsRouter } from "./projects.js";
import { npdAttachmentRouter } from "./npdAttachment.js";
import { customerRouter } from "./customer.js";
import { purchaseRouter } from "./purchase.js";
import { dashboardRouter } from "./dashboard.js";

/**
 * NPD module root router, mounted at /api/v1/npd in app.ts. Every sub-router (taxonomy today;
 * SKU catalogs, BOM, Part Code Request, Projects, etc. as later sprints add them) hangs off
 * this one, gated once here by requireNpdAccess — any recognized NPD USERS role. Individual
 * write routes narrow further with requireNpdRole([...]) from npdPermissions.ts where a
 * specific role should be required (see NPD/CONTEXT.md's "Roles" section).
 */
export const npdRouter = Router();

async function requireNpdAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const allowed = await hasNpdAccess(req.user!.employeeId);
    if (!allowed) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "No access to NPD" } });
    }
    next();
  } catch (err) {
    next(err);
  }
}

npdRouter.use(requireAuth, requireNpdAccess);

npdRouter.use("/taxonomy", taxonomyRouter);
npdRouter.use("/part-code-requests", partCodeRequestRouter);
npdRouter.use("/bom", bomRouter);
npdRouter.use("/changelog", changelogRouter);
npdRouter.use("/projects", projectsRouter);
npdRouter.use("/npd-attachments", npdAttachmentRouter);
npdRouter.use("/customer", customerRouter);
npdRouter.use("/purchase", purchaseRouter);
npdRouter.use("/dashboard", dashboardRouter);
// RM SKU creation (the real "Raw Material SKU Form") now goes through the generic taxonomy
// router's POST /taxonomy/rm-sku instead of a dedicated /rm-part-code route — see
// taxonomy.ts's rm-sku table entry and its POST handler's PART NO. computation.
