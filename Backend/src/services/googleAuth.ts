import { google } from "googleapis";
import { env } from "../config/env.js";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

let authClient: InstanceType<typeof google.auth.GoogleAuth> | null = null;

export function getGoogleAuth() {
  if (authClient) return authClient;

  if (env.googleServiceAccountKeyJson) {
    const credentials = JSON.parse(env.googleServiceAccountKeyJson);
    authClient = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  } else if (env.googleApplicationCredentials) {
    authClient = new google.auth.GoogleAuth({
      keyFile: env.googleApplicationCredentials,
      scopes: SCOPES,
    });
  } else {
    throw new Error(
      "No Google credentials configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_JSON or GOOGLE_APPLICATION_CREDENTIALS in .env"
    );
  }

  return authClient;
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
  const auth = getGoogleAuth();
  return google.drive({ version: "v3", auth: auth as any });
}
