import type { SheetRow } from "../services/sheets.js";

/**
 * ORDER_ITEMS and SALE_ORDER_ITEMS (same columns, SALE_ORDER_ITEMS is a literal copy)
 * used to have ALL_CAPS headers matching the app's internal field names directly — no
 * translation needed. The live sheet's "final" pass renamed them to Title Case (e.g.
 * "Part No.", "Basic Amount"), so every place that reads/writes these tabs needs this map
 * now, same as ORDER_PUNCH already required (see orderPunchMap.ts). Internal field name
 * (left) -> the tab's exact header text (right).
 */
export const ORDER_ITEMS_MAP: Record<string, string> = {
  CREATED_AT: "Timestamp",
  CREATED_BY: "Useremail",
  ORDER_ID: "ORDER_ID",
  ITEM_ID: "ITEM_ID",
  SEGMENT: "Segment",
  CATEGORY: "Category",
  PART_NAME: "Part Name",
  PART_NO: "Part No.",
  PRICE: "Price",
  QTY: "Quantity",
  UOM: "Unit",
  DISCOUNT_ON: "Default Discount on",
  DISCOUNT_RS: "Discount (Rs)",
  DISCOUNT_PCT: "Discount (%)",
  BASIC_AMOUNT: "Basic Amount",
  GST_SLAB_PCT: "GST Slab (%)",
  CGST: "CGST",
  SGST: "SGST",
  IGST: "IGST",
  TAX_AMOUNT: "Tax Amount",
  TOTAL_AMOUNT: "Total Amount",
  SPECIAL_INSTRUCTIONS: "Special Instructions",
  PACKING_REQUIREMENTS: "Packing Requirements",
  NOTES: "Additional Notes",
  STATUS: "Status",
};

const READ_HEADER_TO_INTERNAL: Record<string, string> = {};
for (const [internal, header] of Object.entries(ORDER_ITEMS_MAP)) {
  if (!(header in READ_HEADER_TO_INTERNAL)) READ_HEADER_TO_INTERNAL[header] = internal;
}

function translate(record: SheetRow, map: Record<string, string>): SheetRow {
  const out: SheetRow = {};
  for (const [key, value] of Object.entries(record)) {
    const header = map[key];
    if (header) out[header] = value;
  }
  return out;
}

/** Translate an internal-keyed item into one keyed by ORDER_ITEMS/SALE_ORDER_ITEMS headers (for writes). */
export function itemToSheet(record: SheetRow): SheetRow {
  return translate(record, ORDER_ITEMS_MAP);
}

/** Translate an ORDER_ITEMS/SALE_ORDER_ITEMS sheet row back into internal field names (for reads). */
export function itemFromSheet(row: SheetRow): SheetRow {
  const out: SheetRow = {};
  for (const [header, value] of Object.entries(row)) {
    const internal = READ_HEADER_TO_INTERNAL[header];
    if (internal) out[internal] = value;
  }
  return out;
}
