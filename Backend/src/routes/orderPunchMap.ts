import type { SheetRow } from "../services/sheets.js";

/**
 * The ORDER_PUNCH tab (renamed from ORDERS) uses human-readable headers with grey
 * "section header" spacer columns mixed in. To avoid renaming fields across the whole
 * app, we keep the API/frontend's internal field names and translate to/from the sheet's
 * real header names here — one map, used on every read and write.
 *
 * Left = internal field name (what the frontend/API use). Right = exact ORDER_PUNCH header.
 */
export const ORDER_PUNCH_MAP: Record<string, string> = {
  ORDER_ID: "ORDER_ID",
  CREATED_AT: "Timestamp",
  CREATED_BY: "Useremail",

  PO_NO: "Purchase Order No.",
  PO_DATE: "Purchase Order Date",
  PO_ATTACHMENT_URL: "Purchase Order Attachment",
  OTHER_ATTACHMENT_URL: "Other Order Attachment",
  PO_REMARKS: "Purchase Order Remarks",

  ORDER_TYPE: "Order Type",
  SALE_TYPE: "Sale Type",
  PAYMENT_TYPE: "Payment Type",
  ADVANCE_PCT: "Advance Payment (%)",

  // Seller Details — auto-filled from SALLER_MASTER on save.
  BRANCH_ID: "Branch ID",
  BRANCH_NAME: "Branch Name",
  SELLER_GSTIN: "Seller GSTIN No.",
  SELLER_EMAIL: "Seller Email ID",
  SELLER_CONTACT: "Seller Contact No.",
  SELLER_ADDRESS_1: "Seller Address Line 1",
  SELLER_ADDRESS_2: "Seller Address Line 2",
  SELLER_STATE: "Seller State",
  SELLER_PINCODE: "Seller Pin code",
  SELLER_COUNTRY: "Seller Country",

  // Buyer Details
  CUST_ID: "CUST ID",
  CUSTOMER_NAME: "Cutomer Name",
  BUSINESS_SEGMENT: "Business Segment",
  TYPE_OF_CUSTOMER: "Type of Customer",
  BUYER_GSTIN: "Buyer GSTIN No.",
  BUYER_EMAIL: "Buyer Email ID",
  BUYER_CONTACT: "Buyer Contact No.",
  PAYMENT_TERMS: "Payment Terms",
  THIS_ORDER_PAYMENT_TERMS: "This Order Payment Terms",
  CONTACT_PERSON: "Contact Person Name",
  CONTACT_NO: "Contact Person Contact No.",
  SALE_STAFF_NAME: "Sale Staff Name",
  ORDER_GIVEN_BY: "Order given by",
  SHIP_TO_CONSIGNEE: "Ship to Consignee",

  // Billing Address (frontend uses a single line -> Line 1)
  BILLING_ADDRESS: "Billing Address Line 1",
  BILLING_ADDRESS_2: "Billing Address Line 2",
  BILLING_STATE: "Billing State",
  BILLING_PINCODE: "Billing Pin code",
  BILLING_COUNTRY: "Billing Country",

  IS_SHIPPING_SAME: "Is Shipping Address Same",
  SHIPPING_SAME: "Is Shipping Address Same",

  // Shipping Address
  SHIPPING_ADDRESS: "Shipping Address Line 1",
  SHIPPING_ADDRESS_2: "Shipping Address Line 2",
  SHIPPING_STATE: "Shipping State",
  SHIPPING_PINCODE: "Shipping Pin code",
  SHIPPING_COUNTRY: "Shipping Country",

  // Consignee Details
  CONSIGNEE_NAME: "Consignee Name",
  CONSIGNEE_GSTIN: "Consignee GSTIN",
  CONSIGNEE_CONTACT: "Consignee Contact No.",
  CONSIGNEE_EMAIL: "Consignee Email",

  // Logistics Details
  PREFERRED_DELIVERY_MODE: "Preferred Delivery Mode",
  PREFERRED_TRANSPORT_MODE: "Preferred Transportation Mode",
  FREIGHT_PAID_BY: "Freight Paid by",
  FREIGHT_ON_INVOICE: "Freight Applicable On Invoice?",
  PREFERRED_TPT_ID: "Preferred Transporter ID",
  PREFERRED_TPT_NAME: "Preferred Transporter Name",
  TRANSPORTER_TYPE: "Transporter Type",
  TRANSPORTER_CONTACT: "Transporter Contact No.",
  TRANSPORTER_PERSON_NAME: "Transporter Person Name",
  TRANSPORTER_PERSON_CONTACT: "Transporter Person Contact No.",
  TRANSPORTER_ADDRESS: "Transporter Address",

  // GST Details
  INVOICE_DISCOUNT_RS: "Invoice Discount (rs)",
  BASIC_AMOUNT: "Basic Amount",
  TAX_AMOUNT: "Tax Amount",
  TOTAL_AMOUNT: "Total Amount",

  // Approval Details
  APPROVAL_TIME: "Approval Time",
  APPROVAL_STATUS: "Approval Status",
  APPROVAL_REMARKS: "Approval Remarks",
  STATUS: "Status",
};

// SHIPPING_SAME + IS_SHIPPING_SAME both map to one column — pick one canonical name for reads.
const READ_HEADER_TO_INTERNAL: Record<string, string> = {};
for (const [internal, header] of Object.entries(ORDER_PUNCH_MAP)) {
  if (!(header in READ_HEADER_TO_INTERNAL)) READ_HEADER_TO_INTERNAL[header] = internal;
}

/**
 * SALE_ORDERS mirrors ORDER_PUNCH's columns (same header names) plus SALE_ORDER_ID and a
 * "Sale Order Details" section, and it names the discount column "Invoice_Discount" (not
 * "Invoice_Discount_(rs)"). Reuse the punch map and override just those differences.
 */
export const SALE_ORDER_MAP: Record<string, string> = {
  ...ORDER_PUNCH_MAP,
  INVOICE_DISCOUNT_RS: "Invoice Discount (Rs)",
  SALE_ORDER_ID: "SALE_ORDER_ID",
  SO_NO: "Sale Order No.",
  SO_DATE: "Sale Order Date",
  SO_ATTACHMENT_URL: "Sale Order Attachment",
  SO_REMARKS: "Sale Order Remarks",
};

function translate(record: SheetRow, map: Record<string, string>): SheetRow {
  const out: SheetRow = {};
  for (const [key, value] of Object.entries(record)) {
    const header = map[key];
    if (header) out[header] = value;
  }
  return out;
}

/** Translate an internal-keyed record into one keyed by ORDER_PUNCH sheet headers (for writes). */
export function punchToSheet(record: SheetRow): SheetRow {
  return translate(record, ORDER_PUNCH_MAP);
}

/** Translate an internal-keyed record into one keyed by SALE_ORDERS sheet headers (for writes). */
export function saleOrderToSheet(record: SheetRow): SheetRow {
  return translate(record, SALE_ORDER_MAP);
}

/** Translate a sheet row (keyed by ORDER_PUNCH headers) back into internal field names (for reads). */
export function punchFromSheet(row: SheetRow): SheetRow {
  const out: SheetRow = {};
  for (const [header, value] of Object.entries(row)) {
    const internal = READ_HEADER_TO_INTERNAL[header];
    if (internal) out[internal] = value;
  }
  // The new sheet has no CURRENT_STAGE column; the app filters lists by it, so synthesize
  // it from the tab (ORDER_PUNCH = the Punch stage) to keep existing filtering working.
  out.CURRENT_STAGE = "Punch";
  return out;
}

const SALE_ORDER_HEADER_TO_INTERNAL: Record<string, string> = {};
for (const [internal, header] of Object.entries(SALE_ORDER_MAP)) {
  if (!(header in SALE_ORDER_HEADER_TO_INTERNAL)) SALE_ORDER_HEADER_TO_INTERNAL[header] = internal;
}

/** Translate a SALE_ORDERS sheet row back into internal field names (for reads). */
export function saleOrderFromSheet(row: SheetRow): SheetRow {
  const out: SheetRow = {};
  for (const [header, value] of Object.entries(row)) {
    const internal = SALE_ORDER_HEADER_TO_INTERNAL[header];
    if (internal) out[internal] = value;
  }
  return out;
}
