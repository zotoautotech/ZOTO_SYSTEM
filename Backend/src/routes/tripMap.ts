import type { SheetRow } from "../services/sheets.js";

/**
 * Transport / Transport_SO / Transport_Products / Transport_Reached / STOCK_RELEASE /
 * TAX_INVOICE / Tax_Invoice_SO / Tax_Invoice_Products / Pre Dispatch / Vehicle Dispatch /
 * Dispatch / LR / DELIVERY all repeat the same denormalized buyer/billing/shipping/
 * consignee/GST/logistics/vehicle columns on every row (matching ORDER_PUNCH's own
 * section headers almost verbatim). Rather than one map per tab, these two shared maps
 * translate an internal-keyed order (from punchFromSheet) and a TRANSPORT row into a
 * single combined snapshot — appendRow silently drops whichever keys don't match a given
 * tab's actual headers, so the same spread works for every trip-family tab.
 */
export const ORDER_SNAPSHOT_MAP: Record<string, string> = {
  CUST_ID: "CUST ID",
  CUSTOMER_NAME: "Customer Name",
  BUSINESS_SEGMENT: "Business Segment",
  TYPE_OF_CUSTOMER: "Type of Customer",
  SALE_TYPE: "Sale Type",
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
  INVOICE_DISCOUNT_RS: "Invoice Discount (Rs)",
  BASIC_AMOUNT: "Basic Amount",
  TAX_AMOUNT: "Tax Amount",
  TOTAL_AMOUNT: "Total Amount",
};

function translate(record: SheetRow, map: Record<string, string>): SheetRow {
  const out: SheetRow = {};
  for (const [key, value] of Object.entries(record)) {
    const header = map[key];
    if (header) out[header] = value;
  }
  return out;
}

/** order: internal-keyed row from punchFromSheet(). Produces the shared buyer/billing/
 * shipping/consignee/GST snapshot columns, keyed by their real (shared) header text. */
export function orderSnapshotToSheet(order: SheetRow): SheetRow {
  return translate(order, ORDER_SNAPSHOT_MAP);
}

/** transportRow: raw sheet row from the TRANSPORT tab (already header-keyed, no
 * translation needed there — just rename the couple of columns that differ,
 * e.g. TRANSPORT's own "Transporter Type" already matches). Produces the shared
 * logistics/vehicle snapshot columns. */
export function vehicleSnapshotToSheet(transportRow: SheetRow): SheetRow {
  return {
    "Delivery Mode": transportRow["Vehicle Arrange for"] ?? "",
    "Freight Paid by": "",
    "Freight Paid at": "",
    "Transport Mode": "",
    "Transporter Type": transportRow["Transporter Type"] ?? "",
    "Transporter ID": transportRow["Transporter ID"] ?? "",
    "Transporter Name": transportRow["Transporter Name"] ?? "",
    "Vehicle type": transportRow["Vehicle type"] ?? "",
    "Vehicle No.": transportRow["Vehicle No."] ?? "",
    "Vehicle Size (Ft)": transportRow["Vehicle Size (Ft)"] ?? "",
    "Driver Name": transportRow["Driver Name"] ?? "",
    "Driver Contact No.": transportRow["Driver Contact No."] ?? "",
    "Freight Applicable On Invoice": transportRow["Freight Applicable On Invoice?"] ?? "",
    "Freight Applicable On Invoice?": transportRow["Freight Applicable On Invoice?"] ?? "",
    "Freight Charge": transportRow["Freight Charge"] ?? "",
  };
}
