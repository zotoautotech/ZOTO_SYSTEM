import type { SheetRow } from "../services/sheets.js";

/**
 * SO_Confirmation / SO_Confirmation_Items / Dispatch_Approval are append-only snapshot
 * logs (one row per SO Confirmation decision / per dispatch-approved item) — NOT the
 * live source of truth, which stays ORDER_PUNCH/SALE_ORDERS/ORDER_ITEMS/SALE_ORDER_ITEMS
 * (those keep being read/written exactly as before). These maps are write-only: internal
 * field name -> the tab's exact header text. Section-header spacer columns ("Buyer
 * Details", "GST Details", etc., matching ORDER_PUNCH's grey-header pattern) are left
 * blank on purpose — they're not part of any map here.
 *
 * All three tabs carry ORDER_ID (and ITEM_ID for line-item rows) directly — the star-
 * schema join key added so every table can be filtered straight to "this order" without
 * resolving through SALE_ORDER_ID/Conf_ID/Conf Item ID chains. Those stage-specific IDs
 * (Conf_ID, Conf Item ID, Dispatch_iD) still exist for uniqueness/audit/display, but
 * they're no longer load-bearing for joins.
 */
export const SO_CONFIRMATION_MAP: Record<string, string> = {
  CREATED_AT: "Timestamp",
  CREATED_BY: "Useremail",
  ORDER_ID: "ORDER_ID",
  SALE_ORDER_ID: "SALE_ORDER_ID",
  CONF_ID: "Conf_ID",

  PO_NO: "Purchase Order No.",
  PO_DATE: "Purchase Order Date",
  PO_ATTACHMENT_URL: "Purchase Order Attachment",
  OTHER_ATTACHMENT_URL: "Other Order Attachment",
  PO_REMARKS: "Purchase Order Remarks",

  ORDER_TYPE: "Order Type",
  SALE_TYPE: "Sale Type",
  PAYMENT_TYPE: "Payment Type",
  ADVANCE_PCT: "Advance Payment (%)",

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

  CUST_ID: "CUST ID",
  CUSTOMER_NAME: "Customer Name",
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

  BILLING_ADDRESS: "Billing Address Line 1",
  BILLING_ADDRESS_2: "Billing Address Line 2",
  BILLING_STATE: "Billing State",
  BILLING_PINCODE: "Billing Pin code",
  BILLING_COUNTRY: "Billing Country",

  SHIPPING_SAME: "Is Shipping Address Same",
  SHIPPING_ADDRESS: "Shipping Address Line 1",
  SHIPPING_ADDRESS_2: "Shipping Address Line 2",
  SHIPPING_STATE: "Shipping State",
  SHIPPING_PINCODE: "Shipping Pin code",
  SHIPPING_COUNTRY: "Shipping Country",

  CONSIGNEE_NAME: "Consignee Name",
  CONSIGNEE_GSTIN: "Consignee GSTIN",
  CONSIGNEE_CONTACT: "Consignee Contact No.",
  CONSIGNEE_EMAIL: "Consignee Email",

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

  INVOICE_DISCOUNT_RS: "Invoice Discount (Rs)",
  BASIC_AMOUNT: "Basic Amount",
  TAX_AMOUNT: "Tax Amount",
  TOTAL_AMOUNT: "Total Amount",

  SO_NO: "Sale Order No.",
  SO_DATE: "Sale Order Date",
  SO_ATTACHMENT_URL: "Sale Order Attachment",
  SO_REMARKS: "Sale Order Remarks",

  CONFIRMATION: "Confirmation",
  RECEIVED_PAYMENT_AMOUNT: "Received Payment Amount",
  PAYMENT_AMOUNT_PCT: "Payment Amount (%)",
  PAYMENT_ATTACHMENT_URL: "Payment Attachment",
  CONFIRMATION_REMARKS: "Confirmation Remarks",
  STATUS: "Status",
};

export const SO_CONFIRMATION_ITEMS_MAP: Record<string, string> = {
  CREATED_AT: "Timestamp",
  CREATED_BY: "Useremail",
  ORDER_ID: "ORDER_ID",
  ITEM_ID: "ITEM_ID",
  SALE_ORDER_ID: "SALE_ORDER_ID",
  SALE_ORDER_ITEM_ID: "SALE_ORDER_ITEM_ID",
  CONF_ID: "Conf_ID",
  CONF_ITEM_ID: "Conf Item ID",

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

export const DISPATCH_APPROVAL_MAP: Record<string, string> = {
  CREATED_AT: "Timestamp",
  CREATED_BY: "Useremail",
  ORDER_ID: "ORDER_ID",
  ITEM_ID: "ITEM_ID",
  SALE_ORDER_ID: "SALE_ORDER_ID",
  // Was a second column literally named "ITEM_ID" (a duplicate header — appendRows can only
  // ever fill the first of two identically-named columns) until the live sheet was renamed
  // to this unique name, matching SO_Confirmation_Items' own column.
  SALE_ORDER_ITEM_ID: "SALE_ORDER_ITEM_ID",
  CONF_ID: "Conf_ID",
  CONF_ITEM_ID: "Conf Item ID",
  DISPATCH_ID: "Disp Conf Item ID",

  CUST_ID: "CUST ID",
  CUSTOMER_NAME: "Customer Name",
  BUSINESS_SEGMENT: "Business Segment",
  TYPE_OF_CUSTOMER: "Type of Customer",
  SALE_TYPE: "Sale Type",
  BUYER_GSTIN: "Buyer GSTIN No.",

  SEGMENT: "Segment",
  CATEGORY: "Category",
  PART_NAME: "Part Name",
  PART_NO: "Part No.",
  SPECIAL_INSTRUCTIONS: "Special Instructions",
  PACKING_REQUIREMENTS: "Packing Requirements",
  NOTES: "Additional Notes",

  ORDER_QTY: "Order Quantity",
  UOM: "Unit",
  DISPATCH_APPROVAL: "Dispatch Approval",
  APPROVED_QTY: "Approved Quantity",
  // PDI is on hold for now (see tripRoutes.ts's unattachedDispatchApprovedRounds) — Box
  // Quantity moved up to this form instead of being collected on the (now-skipped) PDI form,
  // since Transport eligibility reads it straight off this tab now.
  BOX_QUANTITY: "Box Quantity",
  SHORT_QTY: "Short Quantity",
  EXCESS_QTY: "Excess Quantity",
  BALANCE_DISPATCH_QTY: "Balance Dispatch Approval Qty",
  NEXT_EXTENDED_DATE: "Next Extended Date",
  DISPATCH_REMARKS: "Dispatch Remarks",
  STATUS: "Status",
};

function translate(record: SheetRow, map: Record<string, string>): SheetRow {
  const out: SheetRow = {};
  for (const [key, value] of Object.entries(record)) {
    const header = map[key];
    if (header) out[header] = value;
  }
  return out;
}

function reverseTranslate(record: SheetRow, map: Record<string, string>): SheetRow {
  const out: SheetRow = {};
  for (const [key, header] of Object.entries(map)) {
    if (record[header] !== undefined) out[key] = record[header];
  }
  return out;
}

export function soConfirmationToSheet(record: SheetRow): SheetRow {
  return translate(record, SO_CONFIRMATION_MAP);
}

export function soConfirmationItemToSheet(record: SheetRow): SheetRow {
  return translate(record, SO_CONFIRMATION_ITEMS_MAP);
}

export function dispatchApprovalToSheet(record: SheetRow): SheetRow {
  return translate(record, DISPATCH_APPROVAL_MAP);
}

/** Reads a "Dispatch Items Approval" log row back — used for the item-level detail page's
 * Quantity Details (latest Approved/Short/Excess/Balance Qty) and Follow-ups history table.
 * This tab is otherwise write-only from the app's perspective (see file header). */
export function dispatchApprovalFromSheet(record: SheetRow): SheetRow {
  return reverseTranslate(record, DISPATCH_APPROVAL_MAP);
}
