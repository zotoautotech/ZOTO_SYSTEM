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

/** Sale Orders that have been saved and are awaiting SO Confirmation. */
export async function listSaleOrders() {
  const res = await api.get<OrderRecord[]>("/orders/sale-orders");
  return res.data;
}

export async function getOrder(orderId: string) {
  const res = await api.get<{ order: OrderRecord; items: OrderItemRecord[]; dispatchPlan: unknown[] }>(
    `/orders/${orderId}`
  );
  return res.data;
}

export async function deleteOrders(orderIds: string[]) {
  const res = await api.delete<{ deleted: number }>("/orders", { data: { orderIds } });
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
  notes?: string;
}

export interface NewOrderPayload {
  poNo?: string;
  poDate?: string;
  poAttachmentUrl?: string;
  otherAttachmentUrl?: string;
  poRemarks?: string;
  saleType?: "Order" | "Sample" | "Return Order";
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
  billingCountry?: string;
  shippingSame?: "Yes" | "No";
  shippingAddress?: string;
  shippingState?: string;
  shippingPincode?: string;
  preferredDeliveryMode?: string;
  preferredTransportMode?: string;
  freightPaidBy?: string;
  freightOnInvoice?: "Yes" | "No";
  preferredTptId?: string;
  preferredTptName?: string;
  transporterType?: string;
  transporterContactNo?: string;
  transporterPersonName?: string;
  transporterPersonContactNo?: string;
  transporterAddress?: string;
  items?: NewOrderItem[];
}

export async function createOrder(payload: NewOrderPayload) {
  const res = await api.post<{ orderId: string }>("/orders", payload);
  return res.data;
}

export interface OrderDiscountPayload {
  reason: string;
  description?: string;
  type: "Percentage" | "Rupees";
  discountPct?: number;
  discountRs?: number;
}

export async function applyOrderDiscount(orderId: string, payload: OrderDiscountPayload) {
  const res = await api.post<{ orderId: string; discountRs: string; totalAmount: string }>(
    `/orders/${orderId}/discount`,
    payload
  );
  return res.data;
}

export interface SaleOrderFormPayload {
  soNo: string;
  soDate: string;
  soAttachmentUrl: string;
  soRemarks?: string;
}

export async function uploadSaleOrderForm(orderId: string, payload: SaleOrderFormPayload) {
  const res = await api.post<{ orderId: string; saleOrderId: string }>(
    `/orders/${orderId}/sale-order-form`,
    payload
  );
  return res.data;
}

/** The SALE_ORDERS row for an order once its Sale Order form is saved, or null. */
export async function getSaleOrder(orderId: string) {
  const res = await api.get<Record<string, string> | null>(`/orders/${orderId}/sale-order`);
  return res.data;
}

export interface SoConfirmationChanges {
  poNo?: string;
  poDate?: string;
  poAttachmentUrl?: string;
  otherAttachmentUrl?: string;
  poRemarks?: string;
  saleType?: string;
  orderType?: string;
  paymentType?: string;
  advancePct?: number;
  custId?: string;
  customerName?: string;
  buyerGstin?: string;
  billingAddress?: string;
  billingState?: string;
  billingPincode?: string;
  billingCountry?: string;
  shippingSame?: string;
  shippingAddress?: string;
  shippingState?: string;
  shippingPincode?: string;
  preferredDeliveryMode?: string;
  preferredTransportMode?: string;
  freightPaidBy?: string;
  freightOnInvoice?: string;
  preferredTptId?: string;
  preferredTptName?: string;
  transporterType?: string;
  transporterContactNo?: string;
  transporterPersonName?: string;
  transporterPersonContactNo?: string;
  transporterAddress?: string;
  items?: NewOrderItem[];
  invoiceDiscountRs?: number;
}

export interface SoConfirmationPayload {
  outcome: "Confirmed" | "Changes" | "Cancelled";
  remarks: string;
  receivedPaymentAmount?: string;
  paymentAmountPct?: string;
  paymentAttachmentUrl?: string;
  changes?: SoConfirmationChanges;
}

export async function submitSoConfirmation(orderId: string, payload: SoConfirmationPayload) {
  const res = await api.post<{ orderId: string; status: string; nextStage?: string }>(
    `/orders/${orderId}/so-confirmation`,
    payload
  );
  return res.data;
}

/** Orders confirmed in SO Confirmation, now pending Dispatch Approval. */
export async function listDispatchApprovals(status?: string) {
  const res = await api.get<OrderRecord[]>("/orders/dispatch-approvals", { params: { status } });
  return res.data;
}

export interface DispatchApprovalPayload {
  outcome: "Dispatch Today" | "Dispatch Extended" | "Short Quantity" | "Excess Quantity";
  approvedQty?: number;
  shortQty?: number;
  excessQty?: number;
  nextExtendedDate?: string;
  remarks: string;
}

export async function submitDispatchApproval(orderId: string, payload: DispatchApprovalPayload) {
  const res = await api.post<{ orderId: string; status: string }>(`/orders/${orderId}/dispatch-approval`, payload);
  return res.data;
}
