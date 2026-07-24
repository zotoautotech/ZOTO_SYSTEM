import type { SheetRow } from "../services/sheets.js";

/**
 * SO_Confirmation / SO_Confirmation_Items / Dispatch_Approval are append-only snapshot
 * logs (one row per SO Confirmation decision / per dispatch-approved item) — NOT the
 * live source of truth, which stays ORDER_PUNCH/SALE_ORDERS/ORDER_ITEMS/SALE_ORDER_ITEMS
 * (those keep being read/written exactly as before). These maps are write-only: internal
 * field name -> the tab's exact header text. Section-header spacer columns ("Buyer
 * Details", "GST Details", etc., matching ORDER_PUNCH's grey-header pattern) are left
 * blank on purpose — they're not part of any map here.
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
  SALE_ORDER_ITEM_ID: "SALE_ORDER_ITEM_ID",
  DISPATCH_ID: "Dispatch_iD",

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
  SHORT_QTY: "Short Quantity",
  EXCESS_QTY: "Excess Quantity",
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

export function soConfirmationToSheet(record: SheetRow): SheetRow {
  return translate(record, SO_CONFIRMATION_MAP);
}

export function soConfirmationItemToSheet(record: SheetRow): SheetRow {
  return translate(record, SO_CONFIRMATION_ITEMS_MAP);
}

export function dispatchApprovalToSheet(record: SheetRow): SheetRow {
  return translate(record, DISPATCH_APPROVAL_MAP);
}
