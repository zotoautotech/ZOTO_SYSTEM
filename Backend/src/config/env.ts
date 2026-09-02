import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Plain `import "dotenv/config"` resolves .env relative to process.cwd() — fine when the
// process is started with `cd Backend && npm run dev`, but NOT when started some other way
// with a different working directory (e.g. .claude/launch.json's preview_start config runs
// `node Backend/node_modules/tsx/dist/cli.mjs watch Backend/src/index.ts` from the repo
// root, whose cwd is the repo root, not Backend/ — Backend/.env then silently never loads
// and every env var falls back to its default/empty string, which surfaced as a 500 on
// literally every Sheets-backed route with no obvious cause). Resolve .env relative to this
// file's own location instead, so it loads correctly regardless of the process's cwd.
loadDotenv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  // Comma-separated list — the deployed frontend has both its Vercel URL and a custom
  // domain (platform.myzoto.com) pointing at it, and requests from either need to pass CORS.
  allowedOrigins: (process.env.ALLOWED_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  fiscalYearSeries: process.env.FISCAL_YEAR_SERIES ?? "2627",

  googleServiceAccountKeyJson: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON ?? "",
  googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "",

  sheets: {
    transactions: process.env.ZOTO_TRANSACTIONS_SHEET_ID ?? "",
    customerBilling: process.env.CUSTOMER_BILLING_SHEET_ID ?? "",
    transport: process.env.TRANSPORT_SHEET_ID ?? "",
    fg: process.env.FG_SHEET_ID ?? "",
    home: process.env.ZOTO_HOME_SHEET_ID ?? "",
    checklistMaster: process.env.CHECKLIST_MASTER_SHEET_ID ?? "",
    checklistAccounts: process.env.CHECKLIST_ACCOUNTS_SHEET_ID ?? "",
    // NPD module — see NPD/CONTEXT.md for the full two-spreadsheet split. FG taxonomy/SKU data
    // lives on the existing `fg` sheet above (shared with Sales CRR's masters.ts, additive
    // writes only). Everything else NPD-specific — Raw Material SKU, RM taxonomy, Vendor Master,
    // Vehicle Compatibility, NPD USERS permissions, and (as later sprints add them) Projects/
    // BOM/Part Code Request/pricing-audit/Customer Master V2/Purchase/WIP/item-spec tabs — lives
    // on the live "ZOTO/PRODUCT MASTER-RM" spreadsheet (the user's own Drive, shared Editor with
    // this service account; no separate spreadsheet was created since the service account has no
    // Drive quota of its own to create one in — see NPD/CONTEXT.md).
    npd: process.env.NPD_SHEET_ID ?? "",
    // "ZOTO/MASTER-VENDOR" — a separate, already-live, real production vendor sheet (27+ real
    // rows, VEND-0001... sequential IDs) shared Editor with the service account by the user
    // directly (2 Sep 2026), NOT the empty placeholder "Vendor Master" tab on `npd` above —
    // taxonomy.ts's `vendor-master` table entry now points here instead. See that entry's own
    // comment for the header/ID-scheme differences (real headers use "Vendor Firm Name"/
    // "Vendor Id", not the placeholder's "Vendor Name"/"Vendor ID").
    vendorMaster: process.env.VENDOR_MASTER_SHEET_ID ?? "",

    // IMS module — 10 new spreadsheets created by Backend/create-ims-sheets.mjs (Sale/
    // Transport data reuses `transactions`/`transport` above — no separate IMS Sale sheet,
    // see docs/work/ims-sheet-header-spec.md's "Resolved ambiguities" section).
    imsStock: process.env.IMS_SHEET_STOCK_ID ?? "",
    imsRmWip: process.env.IMS_SHEET_RM_WIP_ID ?? "",
    imsPurchase: process.env.IMS_SHEET_PURCHASE_ID ?? "",
    imsProduction: process.env.IMS_SHEET_PRODUCTION_ID ?? "",
    imsFg: process.env.IMS_SHEET_FG_ID ?? "",
    imsMasterFg: process.env.IMS_SHEET_MASTER_FG_ID ?? "",
    imsProductMaster: process.env.IMS_SHEET_PRODUCT_MASTER_ID ?? "",
    imsDataStorage: process.env.IMS_SHEET_DATA_STORAGE_ID ?? "",
    imsCustomer: process.env.IMS_SHEET_CUSTOMER_ID ?? "",
    imsMasterCust: process.env.IMS_SHEET_MASTER_CUST_ID ?? "",
  },

  driveFolderId: process.env.DRIVE_FOLDER_ID ?? "",
  // The "Sales-CRR Gate Pass Template" Google Doc, copied + filled in per trip (see
  // Backend/src/services/gatePass.ts). Must be shared (at least Viewer) with
  // DRIVE_IMPERSONATE_USER below so drive.files.copy() can read it.
  dispatchGatePassTemplateDocId: process.env.DISPATCH_GATE_PASS_TEMPLATE_DOC_ID ?? "",
  // The "Sale Order Template T1" Google Doc, copied + filled in per order by the Create Sale
  // Order action (see Backend/src/services/saleOrderDoc.ts). Same sharing requirement as the
  // gate pass template above — DRIVE_IMPERSONATE_USER needs at least Viewer on it.
  saleOrderTemplateDocId: process.env.SALE_ORDER_TEMPLATE_DOC_ID ?? "",
  // Domain-wide delegation: the service account impersonates this Workspace user for Drive
  // uploads, so files are owned by them (using their quota) rather than the service account
  // itself, which has none. Requires this Client ID authorized in Workspace Admin Console
  // (Security > API Controls > Domain-wide Delegation) for the drive scope.
  driveImpersonateUser: process.env.DRIVE_IMPERSONATE_USER ?? "",
};

export { required };
