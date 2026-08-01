import { readFileSync } from "node:fs";
import { google } from "googleapis";
import { env } from "../config/env.js";

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];
// Deliberately a SEPARATE JWT client/scope set from DRIVE_SCOPES above, not just DRIVE_SCOPES
// with "documents" appended — domain-wide delegation authorizes a Client ID for one exact
// scope set at a time, so adding a scope to the already-working Drive client would require
// every existing Drive caller (e.g. the attachment upload feature) to wait on a Workspace
// admin re-authorizing the combined set too. Keeping Docs on its own client means only the
// gate pass feature is blocked until DOCS_SCOPES is authorized — uploads keep working today.
const DOCS_SCOPES = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/documents"];

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

let docsAuth: InstanceType<typeof google.auth.JWT> | null = null;

/**
 * Docs API access, for filling in the Dispatch Gate Pass template — impersonates the same
 * Workspace user as Drive (so generated Docs use their quota), but via its OWN JWT client
 * with DOCS_SCOPES (drive + documents), see that constant's comment above for why this is
 * kept separate from getDriveAuth() rather than just adding "documents" to DRIVE_SCOPES.
 * Requires a Workspace admin to additionally authorize this Client ID for DOCS_SCOPES in
 * Admin Console > Security > API Controls > Domain-wide Delegation — a NEW authorization
 * entry (or an edit to add the documents scope), separate from the existing Drive-only one.
 */
function getDocsAuth() {
  if (docsAuth) return docsAuth;
  const credentials = loadCredentials();
  docsAuth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: DOCS_SCOPES,
    subject: env.driveImpersonateUser || undefined,
  });
  return docsAuth;
}

export async function getDocsClient() {
  const auth = getDocsAuth();
  return google.docs({ version: "v1", auth: auth as any });
}

/** The gate pass pipeline also needs Drive calls (copy the template, export to PDF, delete
 * the intermediate Doc) alongside Docs calls — uses the SAME (documents-scoped) client as
 * getDocsClient() rather than the plain getDriveClient(), so every call in that one pipeline
 * shares a single token/scope set instead of juggling two clients for one feature. */
export async function getDriveClientForDocs() {
  const auth = getDocsAuth();
  return google.drive({ version: "v3", auth: auth as any });
}
