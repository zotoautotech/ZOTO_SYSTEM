import { Router } from "express";
import { env } from "../../config/env.js";
import { readTable } from "../../services/sheets.js";

/**
 * Stock & WIP Dashboard + Notifications (build-prompt §7 screen 12, §8's notification
 * automations). Both are computed on read, not stored — this app has no notification-log
 * table or push mechanism (email/in-app delivery infra doesn't exist anywhere else in this
 * codebase either), so "notifications" here means "current pending items across NPD",
 * refreshed live on every request, not a persisted feed a doer can mark read/unread. If a
 * real push/email delivery mechanism is ever wanted, this is the query layer it would sit on
 * top of — don't rebuild the aggregation logic, just add delivery around it.
 */
export const dashboardRouter = Router();

dashboardRouter.get("/stock", async (_req, res, next) => {
  try {
    const rows = await readTable(env.sheets.fg, "FINAL GOOD SKU");
    const items = rows
      .filter((r) => r["FG ID"])
      .map((r) => {
        const opening = Number(r["OPENING STOCK"]) || 0;
        const min = Number(r["MIN STOCK"]) || 0;
        const max = Number(r["MAX STOCK"]) || 0;
        return {
          fgId: r["FG ID"],
          name: r.Name || r["FG ID"],
          category: r.CATEGORY,
          subCategory: r["SUB CATEGORY"],
          unit: r.UNIT,
          openingStock: opening,
          minStock: min,
          maxStock: max,
          costOfGoods: Number(r["COST OF GOODS"]) || 0,
          // Only flagged when a MIN STOCK threshold is actually set — most rows here are
          // legacy imports with entirely blank stock fields (see NPD/CONTEXT.md's live-header
          // dump), and treating "0 < 0" as a breach would flag literally every one of them.
          lowStock: min > 0 && opening < min,
        };
      });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/notifications", async (_req, res, next) => {
  try {
    const [attachments, kyc, fgRows, changelog] = await Promise.all([
      readTable(env.sheets.npd, "NPD ATTACHMENT"),
      readTable(env.sheets.npd, "Customer KYC"),
      readTable(env.sheets.fg, "FINAL GOOD SKU"),
      readTable(env.sheets.npd, "NPD Changelog"),
    ]);

    const pendingAttachments = attachments.filter(
      (a) => !a["Quality Review"] || !a["Design HOD Review"]
    );
    const pendingKyc = kyc.filter((k) => k["KYC Status"] === "Pending");
    const lowStockFg = fgRows.filter((r) => {
      const min = Number(r["MIN STOCK"]) || 0;
      const opening = Number(r["OPENING STOCK"]) || 0;
      return min > 0 && opening < min;
    });
    // "Recent" price changes — last 10, newest first, as a lightweight stand-in for a real
    // "pending approval" queue (see changelog.ts's own doc comment on why this stayed a plain
    // log rather than a Finance-approval gate).
    const recentPriceChanges = changelog.slice(-10).reverse();

    res.json({
      pendingAttachments: pendingAttachments.map((a) => ({
        attachmentId: a["Attachment ID"],
        projectId: a["Project ID"],
        docType: a["Doc Type"],
        needsQuality: !a["Quality Review"],
        needsDesignHod: !a["Design HOD Review"],
      })),
      pendingKyc: pendingKyc.map((k) => ({ kycId: k["KYC ID"], customerName: k["Customer Name"] })),
      lowStockFg: lowStockFg.map((r) => ({
        fgId: r["FG ID"],
        name: r.Name || r["FG ID"],
        openingStock: Number(r["OPENING STOCK"]) || 0,
        minStock: Number(r["MIN STOCK"]) || 0,
      })),
      recentPriceChanges,
    });
  } catch (err) {
    next(err);
  }
});
