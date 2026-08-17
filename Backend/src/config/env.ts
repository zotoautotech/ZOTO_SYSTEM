import "dotenv/config";

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
