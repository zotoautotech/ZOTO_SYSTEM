import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
  fiscalYearSeries: process.env.FISCAL_YEAR_SERIES ?? "2627",

  googleServiceAccountKeyJson: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON ?? "",
  googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "",

  sheets: {
    transactions: process.env.ZOTO_TRANSACTIONS_SHEET_ID ?? "",
    customerBilling: process.env.CUSTOMER_BILLING_SHEET_ID ?? "",
    transport: process.env.TRANSPORT_SHEET_ID ?? "",
    fg: process.env.FG_SHEET_ID ?? "",
  },

  driveFolderId: process.env.DRIVE_FOLDER_ID ?? "",
  // Domain-wide delegation: the service account impersonates this Workspace user for Drive
  // uploads, so files are owned by them (using their quota) rather than the service account
  // itself, which has none. Requires this Client ID authorized in Workspace Admin Console
  // (Security > API Controls > Domain-wide Delegation) for the drive scope.
  driveImpersonateUser: process.env.DRIVE_IMPERSONATE_USER ?? "",
};

export { required };
