import { env } from "../config/env.js";
import { appendRow } from "./sheets.js";

/**
 * Generic price/BOM edit-audit log (build-prompt §5.4 + §8's explicit instruction: "implement
 * once as a generic 'changelog' service, reused across modules instead of one bespoke log
 * table per module"). The workbook's own schema had FOUR separate tabs for this (Price Inputs/
 * Price Logs/Edit Inputs/Collect logs) — deliberately NOT replicated 1:1; one shared
 * `NPD Changelog` tab (on env.sheets.npd) covers all of them, keyed by `Entity`/`Entity ID` so
 * a reader can filter to "every edit on FG-000012" or "every BOM rate change" without needing
 * four different tabs to check.
 */
const TAB = "NPD Changelog";

export interface ChangelogEntry {
  entity: string;
  entityId: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason?: string;
  employeeId: string;
}

export async function logChange(entry: ChangelogEntry): Promise<void> {
  await appendRow(env.sheets.npd, TAB, {
    Timestamp: new Date().toISOString(),
    Useremail: entry.employeeId,
    Entity: entry.entity,
    "Entity ID": entry.entityId,
    Field: entry.field,
    "Old Value": entry.oldValue,
    "New Value": entry.newValue,
    Reason: entry.reason ?? "",
  });
}
