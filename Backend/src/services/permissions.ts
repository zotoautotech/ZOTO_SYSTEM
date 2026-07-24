import { env } from "../config/env.js";
import { readTable } from "./sheets.js";

export interface UserPermissions {
  modules: string[] | "ALL";
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Friendly-name aliases so the sheet can use the same process names as the old
 * AppSheet "Permissions" tab (e.g. "Order Punch") instead of internal keys
 * ("punch-order"). Matching is case-insensitive with spaces/hyphens ignored.
 */
const MODULE_ALIASES: Record<string, string> = {
  orderpunch: "punch-order",
  punchorder: "punch-order",
  saleorder: "sale-order",
  salesorder: "sale-order",
  soconfirmation: "so-confirmation",
  dispatchapproval: "dispatch-approval",
  production: "production",
  productionconf: "production",
  productionconfirmation: "production",
  pdi: "pdi",
  transport: "transport",
  transportreached: "transport-reached",
  stockrelease: "stock-release",
  taxinvoice: "tax-invoice",
  dispatch: "dispatch",
  collectlr: "collect-lr",
  lrcollection: "collect-lr",
  delivery: "delivery",
  remarks: "remarks",
  sample: "sample",
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[\s\-_]+/g, "");
}

export function parseModules(raw: string | undefined): string[] | "ALL" {
  const value = (raw ?? "").trim();
  if (!value || value.toUpperCase() === "ALL") return "ALL";
  // "Admin" anywhere in the list = full access, matching the USERS sheet's Permissions_Process column.
  const parts = value.split(",").map((m) => m.trim()).filter(Boolean);
  if (parts.some((p) => normalize(p) === "admin")) return "ALL";
  const keys = parts
    .map((p) => {
      const n = normalize(p);
      return MODULE_ALIASES[n] ?? n;
    })
    // "Home"/"Sales CRR"/"Masters"/"Dashboard" are navigation groupings, not modules — ignore.
    .filter((k) => !["home", "salescrr", "masters", "dashboard"].includes(k));
  return keys;
}

export function parseBool(raw: string | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "yes" || value === "true" || value === "1";
}

/**
 * Live permission lookup, AppSheet-style: reads the USERS sheet (short TTL cache)
 * every time instead of trusting stale JWT claims, so editing Permissions_Process/
 * CAN_ADD/CAN_EDIT/CAN_DELETE in the sheet takes effect within seconds — no
 * re-login needed. Returns null if the Employee Id row is missing.
 */
export async function getPermissions(employeeId: string): Promise<UserPermissions | null> {
  const users = await readTable(env.sheets.transactions, "USERS", { ttlMs: 15_000 });
  const user = users.find(
    (u) => u["Employee Id"]?.trim().toLowerCase() === employeeId.trim().toLowerCase()
  );
  if (!user) return null;
  return {
    modules: parseModules(user.Permissions_Process),
    canAdd: parseBool(user.CAN_ADD),
    canEdit: parseBool(user.CAN_EDIT),
    canDelete: parseBool(user.CAN_DELETE),
  };
}
