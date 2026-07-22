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

  PO_NO: "Purchase_Order_No.",
  PO_DATE: "Purchase_Order_Date",
  PO_ATTACHMENT_URL: "Purchase_Order_Attachment",
  OTHER_ATTACHMENT_URL: "Other_Order_Attachment",
  PO_REMARKS: "Purchase_Order_Remarks",

  ORDER_TYPE: "Order_Type",
  SALE_TYPE: "Sale_Type",
  PAYMENT_TYPE: "Payment_Type",
  ADVANCE_PCT: "Advance_Payment_(%)",

  // Seller Details — auto-filled from SALLER_MASTER on save.
  BRANCH_ID: "Branch_ID",
  BRANCH_NAME: "Branch_Name",
  SELLER_GSTIN: "Seller_GSTIN_No.",
  SELLER_EMAIL: "Seller_Email_ID",
  SELLER_CONTACT: "Seller_Contact_No.",
  SELLER_ADDRESS_1: "Seller_Address_Line 1",
  SELLER_ADDRESS_2: "Seller_Address_Line 2",
  SELLER_STATE: "Seller_State",
  SELLER_PINCODE: "Seller_Pin_code",
  SELLER_COUNTRY: "Seller_Country",

  // Buyer Details
  CUST_ID: "CUST_ID",
  CUSTOMER_NAME: "Cutomer_Name",
  BUSINESS_SEGMENT: "Business_Segment",
  TYPE_OF_CUSTOMER: "Type_of_Customer",
  BUYER_GSTIN: "Buyer_GSTIN_No.",
  BUYER_EMAIL: "Buyer_Email_ID",
  BUYER_CONTACT: "Buyer_Contact_No.",
  PAYMENT_TERMS: "Payment_Terms",
  THIS_ORDER_PAYMENT_TERMS: "This_Order_Payment_Terms",
  CONTACT_PERSON: "Contact_Person_Name",
  CONTACT_NO: "Contact_Person_Contact_No.",
  SALE_STAFF_NAME: "Sale_Staff_Name",
  ORDER_GIVEN_BY: "Order_given_by",
  SHIP_TO_CONSIGNEE: "Ship_to_Consignee",

  // Billing Address (frontend uses a single line -> Line 1)
  BILLING_ADDRESS: "Billing_Address_Line_1",
  BILLING_ADDRESS_2: "Billing_Address_Line_2",
  BILLING_STATE: "Billing_State",
  BILLING_PINCODE: "Billing_Pin_code",
  BILLING_COUNTRY: "Billing_Country",

  IS_SHIPPING_SAME: "Is_Shipping_Address_Same",
  SHIPPING_SAME: "Is_Shipping_Address_Same",

  // Shipping Address
  SHIPPING_ADDRESS: "Shipping_Address_Line_1",
  SHIPPING_ADDRESS_2: "Shipping_Address_Line_2",
  SHIPPING_STATE: "Shipping_State",
  SHIPPING_PINCODE: "Shipping_Pin_code",
  SHIPPING_COUNTRY: "Shipping_Country",

  // Consignee Details
  CONSIGNEE_NAME: "Consignee_Name",
  CONSIGNEE_GSTIN: "Consignee_GSTIN",
  CONSIGNEE_CONTACT: "Consignee_Contact_No.",
  CONSIGNEE_EMAIL: "Consignee_Email",

  // Logistics Details
  PREFERRED_DELIVERY_MODE: "Preferred_Delivery_Mode",
  PREFERRED_TRANSPORT_MODE: "Preferred_Transportation_Mode",
  FREIGHT_PAID_BY: "Freight_Paid_by",
  FREIGHT_ON_INVOICE: "Freight_Applicable_On_Invoice?",
  PREFERRED_TPT_ID: "Preferred_Transporter_ID",
  PREFERRED_TPT_NAME: "Preferred_Transporter_Name",
  TRANSPORTER_TYPE: "Transporter_Type",
  TRANSPORTER_CONTACT: "Transporter_Contact_No.",
  TRANSPORTER_PERSON_NAME: "Transporter_Person_Name",
  TRANSPORTER_PERSON_CONTACT: "Transporter_Person_Contact_No.",
  TRANSPORTER_ADDRESS: "Transporter_Address",

  // GST Details
  INVOICE_DISCOUNT_RS: "Invoice_Discount_(rs)",
  BASIC_AMOUNT: "Basic_Amount",
  TAX_AMOUNT: "Tax_Amount",
  TOTAL_AMOUNT: "Total_Amount",

  // Approval Details
  APPROVAL_TIME: "Approval_Time",
  APPROVAL_STATUS: "Approval_Status",
  APPROVAL_REMARKS: "Approval_Remarks",
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
  INVOICE_DISCOUNT_RS: "Invoice_Discount",
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
