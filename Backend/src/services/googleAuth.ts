import { readFileSync } from "node:fs";
import { google } from "googleapis";
import { env } from "../config/env.js";

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

function loadCredentials(): { client_email: string; private_key: string } {
  if (env.googleServiceAccountKeyJson) return JSON.parse(env.googleServiceAccountKeyJson);
  if (env.googleApplicationCredentials) return JSON.parse(readFileSync(env.googleApplicationCredentials, "utf8"));
  throw new Error(
    "No Google credentials configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_JSON or GOOGLE_APPLICATION_CREDENTIALS in .env"
  );
}

let sheetsAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

/** Sheets access is unimpersonated — every sheet is shared directly with the service
 * account, so it doesn't need to act as anyone else. */
export function getGoogleAuth() {
  if (sheetsAuth) return sheetsAuth;
  const credentials = loadCredentials();
  sheetsAuth = new google.auth.GoogleAuth({ credentials, scopes: SHEETS_SCOPES });
  return sheetsAuth;
}

let driveAuth: InstanceType<typeof google.auth.JWT> | null = null;

/**
 * Drive access impersonates DRIVE_IMPERSONATE_USER via domain-wide delegation (Workspace
 * Admin Console > Security > API Controls > Domain-wide Delegation, authorized for this
 * service account's Client ID + the drive scope). Without impersonation, files the service
 * account creates in someone else's Drive folder are owned by the service account itself,
 * which has zero storage quota — impersonation makes the Workspace user the owner instead,
 * using their quota. Falls back to unimpersonated if not configured (uploads will fail
 * with the quota error until domain-wide delegation is set up).
 */
function getDriveAuth() {
  if (driveAuth) return driveAuth;
  const credentials = loadCredentials();
  driveAuth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: DRIVE_SCOPES,
    subject: env.driveImpersonateUser || undefined,
  });
  return driveAuth;
}

export async function getSheetsClient() {
  const auth = getGoogleAuth();
  return google.sheets({ version: "v4", auth: auth as any });
}

export async function listSheetTabs(spreadsheetId: string): Promise<string[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return (res.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
}

export async function getDriveClient() {
  const auth = getDriveAuth();
  return google.drive({ version: "v3", auth: auth as any });
}
