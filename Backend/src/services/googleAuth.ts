import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { google } from "googleapis";
import { env } from "../config/env.js";

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];
const DOCS_SCOPES = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/documents"];

// Backend/ itself — same base directory env.ts resolves .env against, for the same reason:
// GOOGLE_APPLICATION_CREDENTIALS in .env is a relative path ("./secrets/service-account-key.json"),
// and a bare readFileSync(relativePath) resolves against process.cwd(), not against where the
// .env file lives. That's fine when someone runs `cd Backend && npm run dev`, but not under
// .claude/launch.json's preview_start config (cwd = repo root) — surfaced as a real ENOENT
// there. Resolve relative credential paths against this file's own directory's parent instead.
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadCredentials(): { client_email: string; private_key: string } {
  if (env.googleServiceAccountKeyJson) return JSON.parse(env.googleServiceAccountKeyJson);
  if (env.googleApplicationCredentials) {
    const credPath = path.isAbsolute(env.googleApplicationCredentials)
      ? env.googleApplicationCredentials
      : path.resolve(BACKEND_ROOT, env.googleApplicationCredentials);
    return JSON.parse(readFileSync(credPath, "utf8"));
  }
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

let driveAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

/**
 * Drive access, PLAIN service account — no domain-wide delegation/impersonation, by
 * deliberate design (2026-08-27 incident: a script running under impersonated, full-domain
 * "act as any user" Drive access permanently deleted real production files including both
 * systems' transactions spreadsheets — see docs.google.com history / CLAUDE.md for the full
 * account. Domain-wide delegation for this service account's Client ID was fully revoked in
 * Workspace Admin Console afterward and must not be re-added).
 *
 * A plain (unimpersonated) service account has ZERO Drive storage quota of its own, so it
 * can't own files it creates in a regular "My Drive" folder even one it has Editor access to
 * — this used to be exactly why impersonation existed. The fix instead: every folder this
 * service account writes into (DRIVE_FOLDER_ID on both systems, holding uploaded
 * attachments/generated PDFs) now lives inside a genuine Google Shared Drive (Team Drive),
 * which owns its own files' storage regardless of who creates them — a plain member with
 * Content Manager access can create/edit/delete files there with no quota problem and no
 * impersonation. The service account is a direct member of that Shared Drive (and directly
 * shared, as Editor, on the two Doc templates below) — nothing here can act as any other
 * Workspace user or reach anything outside what it's been explicitly given access to.
 *
 * Every Drive API call against these clients MUST pass `supportsAllDrives: true` (and
 * `includeItemsFromAllDrives: true` for any list/search call) — without it, Shared Drive
 * items are invisible to these endpoints even with otherwise-correct permissions.
 */
function getDriveAuth() {
  if (driveAuth) return driveAuth;
  const credentials = loadCredentials();
  driveAuth = new google.auth.GoogleAuth({ credentials, scopes: DRIVE_SCOPES });
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

let docsAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

/**
 * Docs API access, for filling in the Dispatch Gate Pass / Sale Order templates — plain
 * service account, same "no impersonation, ever" reasoning as getDriveAuth() above. Kept as
 * its own client/scope set (drive + documents) purely to mirror the existing call sites
 * (gatePass.ts, saleOrderDoc.ts) that already ask for this specific combination — there's no
 * domain-wide-delegation coupling concern left to design around now that neither client
 * impersonates anyone.
 */
function getDocsAuth() {
  if (docsAuth) return docsAuth;
  const credentials = loadCredentials();
  docsAuth = new google.auth.GoogleAuth({ credentials, scopes: DOCS_SCOPES });
  return docsAuth;
}

export async function getDocsClient() {
  const auth = getDocsAuth();
  return google.docs({ version: "v1", auth: auth as any });
}

/** The gate pass / sale order pipelines also need Drive calls (copy the template, export to
 * PDF, delete the intermediate Doc) alongside Docs calls — uses the SAME client as
 * getDocsClient() rather than the plain getDriveClient(), so every call in one pipeline
 * shares a single token/scope set instead of juggling two clients for one feature. */
export async function getDriveClientForDocs() {
  const auth = getDocsAuth();
  return google.drive({ version: "v3", auth: auth as any });
}
