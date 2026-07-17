import { api } from "./api";

export interface OrderRecord {
  ORDER_ID: string;
  PO_NO: string;
  PO_DATE: string;
  CUST_ID: string;
  CUSTOMER_NAME: string;
  BUYER_GSTIN: string;
  ORDER_TYPE: string;
  PAYMENT_TYPE: string;
  ADVANCE_PCT: string;
  CURRENT_STAGE: string;
  STATUS: string;
  CREATED_AT: string;
  BASIC_AMOUNT: string;
  TAX_AMOUNT: string;
  TOTAL_AMOUNT: string;
  [key: string]: string;
}

export interface OrderItemRecord {
  ITEM_ID: string;
  ORDER_ID: string;
  FG_ID: string;
  PART_NO: string;
  PART_NAME: string;
  QTY: string;
  UOM: string;
  PRICE: string;
  BASIC_AMOUNT: string;
  TAX_AMOUNT: string;
  TOTAL_AMOUNT: string;
  [key: string]: string;
}

export async function listOrders(params: { stage?: string; status?: string }) {
  const res = await api.get<OrderRecord[]>("/orders", { params });
  return res.data;
}

export async function getOrder(orderId: string) {
  const res = await api.get<{ order: OrderRecord; items: OrderItemRecord[]; dispatchPlan: unknown[] }>(
    `/orders/${orderId}`
  );
  return res.data;
}

export async function getLatestOrderForCustomer(custId: string) {
  try {
    const res = await api.get<OrderRecord>("/orders/latest", { params: { custId } });
    return res.data;
  } catch {
    return null;
  }
}

export interface NewOrderItem {
  fgId: string;
  partNo?: string;
  partName?: string;
  segment?: string;
  category?: string;
  price: number;
  qty: number;
  uom: string;
  gstSlabPct?: number;
  remarks?: string;
}

export interface NewOrderPayload {
  poNo?: string;
  poDate?: string;
  poAttachmentUrl?: string;
  otherAttachmentUrl?: string;
  poRemarks?: string;
  orderType?: "Order Incoming" | "Order Outgoing";
  paymentType?: "Credit" | "Advance";
  advancePct?: number;
  custId?: string;
  customerName?: string;
  buyerGstin?: string;
  clientClassification?: "Existing" | "New" | "Prospective";
  billingAddress?: string;
  billingState?: string;
  billingPincode?: string;
  shippingSame?: "Yes" | "No";
  shippingAddress?: string;
  shippingState?: string;
  shippingPincode?: string;
  preferredDeliveryMode?: string;
  preferredTransportMode?: string;
  freightPaidBy?: string;
  freightOnInvoice?: "Yes" | "No";
  preferredTptId?: string;
  items?: NewOrderItem[];
}

export async function createOrder(payload: NewOrderPayload) {
  const res = await api.post<{ orderId: string }>("/orders", payload);
  return res.data;
}
