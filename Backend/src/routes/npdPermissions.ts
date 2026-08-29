import { env } from "../config/env.js";
import { readTable } from "../services/sheets.js";

/**
 * NPD has its OWN Users/Permissions tab (`NPD USERS`, on env.sheets.npd — the live
 * "ZOTO/PRODUCT MASTER-RM" spreadsheet), independent from the Sales CRR transactions sheet's
 * `USERS` tab — same reasoning as Checklist's `checklistPermissions.ts`: NPD is a genuinely
 * separate app with its own user base (Design/Quality/Purchase/Finance/Store roles), not a
 * Sales CRR module. Columns: Timestamp / Employee Id / Name / Role (single role token per row,
 * one row per doer — not a comma-separated list like Sales CRR's Permissions_Process).
 */
const USERS_TAB = "NPD USERS";

export type NpdRole =
  | "admin"
  | "design"
  | "quality"
  | "sales"
  | "purchase"
  | "finance"
  | "store"
  | "viewer";

async function getNpdRole(employeeId: string): Promise<NpdRole | null> {
  const rows = await readTable(env.sheets.npd, USERS_TAB, { ttlMs: 15_000 });
  const user = rows.find(
    (r) => r["Employee Id"]?.trim().toLowerCase() === employeeId.trim().toLowerCase()
  );
  const raw = (user?.Role ?? "").trim().toLowerCase();
  const known: NpdRole[] = ["admin", "design", "quality", "sales", "purchase", "finance", "store", "viewer"];
  return (known as string[]).includes(raw) ? (raw as NpdRole) : null;
}

/** Gates base access to `/npd/*` — any recognized role, including viewer. */
export async function hasNpdAccess(employeeId: string): Promise<boolean> {
  const role = await getNpdRole(employeeId);
  return role !== null;
}

export async function isNpdAdmin(employeeId: string): Promise<boolean> {
  const role = await getNpdRole(employeeId);
  return role === "admin";
}

/**
 * Route-level RBAC — Admin always passes; otherwise the doer's role must be in the allowed
 * list. Use this (not per-view email allow-lists) on any route narrower than base access, e.g.
 * `requireNpdRole(["finance"])` on Price Logs writes, `requireNpdRole(["purchase"])` on Tax
 * Invoice/Store In writes. Viewer never passes a role check — it's read-only by construction
 * (routes gated this way are always write routes; list/detail GETs only need requireNpdAccess).
 */
export async function hasNpdRole(employeeId: string, allowed: NpdRole[]): Promise<boolean> {
  const role = await getNpdRole(employeeId);
  if (!role) return false;
  return role === "admin" || allowed.includes(role);
}
