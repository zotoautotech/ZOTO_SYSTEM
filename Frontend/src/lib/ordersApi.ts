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
  preferredZotoVehicleId?: string;
  zotoVehicleDetails?: string;
  zotoVehicleType?: string;
  zotoVehicleNo?: string;
  zotoVehicleSize?: string;
  zotoVehicleDriverName?: string;
  zotoVehicleDriverContactNo?: string;
  items?: NewOrderItem[];
}

export async function createOrder(payload: NewOrderPayload) {
  const res = await api.post<{ orderId: string }>("/orders", payload);
  return res.data;
}

/** Edits an existing punch order. Same payload shape as createOrder — the server replaces
 * the order's items wholesale and recomputes its amounts. Only allowed while the order is
 * still PENDING; later stages are edited through SO Confirmation's Changes flow instead. */
export async function updateOrder(orderId: string, payload: NewOrderPayload) {
  const res = await api.put<{ orderId: string }>(`/orders/${orderId}`, payload);
  return res.data;
}

export interface OrderDiscountItemLine {
  itemId: string;
  type: "Percentage" | "Rupees";
  discountPct?: number;
  discountRs?: number;
}

export type OrderDiscountPayload =
  | { applicable: false }
  | {
      applicable: true;
      reason: string;
      scope: "Invoice";
      type: "Percentage" | "Rupees";
      discountPct?: number;
      discountRs?: number;
    }
  | {
      applicable: true;
      reason: string;
      scope: "Item";
      items: OrderDiscountItemLine[];
    };

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

/** One-click Sale Order generation: server mints the Sale Order No./Date, generates the PDF
 * from the Sale Order Template T1 Google Doc, and completes the stage — replaces the manual
 * upload form's "type in the four fields yourself" flow entirely. */
export async function createSaleOrder(orderId: string) {
  const res = await api.post<{
    orderId: string;
    saleOrderId: string;
    saleOrderNo: string;
    saleOrderDate: string;
    attachmentFileId: string;
  }>(`/orders/${orderId}/create-sale-order`);
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
  preferredZotoVehicleId?: string;
  zotoVehicleDetails?: string;
  zotoVehicleType?: string;
  zotoVehicleNo?: string;
  zotoVehicleSize?: string;
  zotoVehicleDriverName?: string;
  zotoVehicleDriverContactNo?: string;
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

export interface DispatchApprovalItemRow {
  ORDER_ID: string;
  ITEM_ID: string;
  SO_CONFIRMATION_TIME: string;
  CUSTOMER_NAME: string;
  PART_NAME: string;
  ORDER_QTY: string;
  /** Undecided quantity remaining on this item, across however many Dispatch Approval
   * rounds have happened so far — equals ORDER_QTY the first time, shrinks with each
   * partial round, and this row disappears from the pending list once it hits 0. */
  BALANCE_QTY: string;
  UOM: string;
  /** True when this item's latest decision is "Dispatch Extended" (a hold, not a real
   * decision) — still shows in the pending queue, unlike a real decision. */
  DISPATCH_EXTENDED: boolean;
  NEXT_EXTENDED_DATE: string;
  /** At least one real decision round has already happened but balance remains (the "12
   * ordered, 10 approved, 2 still pending" case) — vs. genuinely untouched. */
  PARTIALLY_DECIDED: boolean;
}

/** Item-level rows (one per item, not per order) for the pending Dispatch Approval table. */
export async function listDispatchApprovalItems() {
  const res = await api.get<DispatchApprovalItemRow[]>("/orders/dispatch-approvals/items");
  return res.data;
}

export interface DispatchApprovalPayload {
  outcome: "Dispatch Today" | "Dispatch Extended" | "Short Quantity" | "Excess Quantity";
  approvedQty?: number;
  shortQty?: number;
  excessQty?: number;
  nextExtendedDate?: string;
  remarks: string;
  // Manually typed for now (no Inventory Management System connected yet) — availableStockQty
  // has nowhere to persist to (no matching sheet column), balanceDispatchQty/unit do.
  availableStockQty?: number;
  balanceDispatchQty?: number;
  unit?: string;
}

/** Per-item — approving one item never advances the rest of the order's items. */
export async function submitDispatchApproval(orderId: string, itemId: string, payload: DispatchApprovalPayload) {
  const res = await api.post<{ orderId: string; itemId: string; orderCompleted: boolean; remainingBalance: number }>(
    `/orders/${orderId}/items/${itemId}/dispatch-approval`,
    payload
  );
  return res.data;
}

export interface DispatchApprovalLogRow {
  CREATED_AT: string;
  ORDER_ID: string;
  ITEM_ID: string;
  PART_NAME: string;
  PART_NO: string;
  DISPATCH_APPROVAL: string;
  APPROVED_QTY: string;
  SHORT_QTY: string;
  EXCESS_QTY: string;
  BALANCE_DISPATCH_QTY: string;
  NEXT_EXTENDED_DATE: string;
  DISPATCH_REMARKS: string;
  STATUS: string;
  [key: string]: string;
}

/** Full "Dispatch Items Approval" log history for one item, oldest first — used by the
 * item-level Dispatch Approval detail page's Quantity Details + Follow-ups table. */
export async function listItemDispatchApprovalLog(orderId: string, itemId: string) {
  const res = await api.get<DispatchApprovalLogRow[]>(`/orders/${orderId}/items/${itemId}/dispatch-approval-log`);
  return res.data;
}

/** Generic queue for any of the 8 pipeline stages after Dispatch Approval (PDI, Transport,
 * Transport Reached, Stock Release, Tax Invoice, Dispatch, Collect LR, Delivery) — see
 * Frontend/src/lib/stages.ts and Backend/src/routes/stageRoutes.ts. */
export async function listStageOrders(stageKey: string, status?: string) {
  const res = await api.get<OrderRecord[]>(`/orders/${stageKey}`, { params: { status } });
  return res.data;
}

export async function submitStageForm(stageKey: string, orderId: string, payload: Record<string, string | number>) {
  const res = await api.post<{ orderId: string; stageId: string; status: string }>(`/orders/${orderId}/${stageKey}`, payload);
  return res.data;
}

/** PDI is per-item — doing PDI for one item never advances the rest of the order's items. */
export async function submitPdiItemForm(orderId: string, itemId: string, payload: Record<string, string | number>) {
  const res = await api.post<{ orderId: string; itemId: string; orderCompleted: boolean }>(
    `/orders/${orderId}/items/${itemId}/pdi`,
    payload
  );
  return res.data;
}

export interface PdiItemRow {
  CREATED_AT: string;
  ORDER_ID: string;
  ITEM_ID: string;
  /** The Dispatch Approval round this PDI row belongs to — an item split across rounds
   * has one PDI row per round, each with its own quantity. */
  DISP_CONF_ITEM_ID: string;
  PART_NAME: string;
  CUSTOMER_NAME: string;
  BUYER_GSTIN: string;
  QTY: string;
  UOM: string;
  PDI_NO: string;
  PDI_UPDATE_TIME: string;
  PDI_DATE: string;
  PDI_ATTACHMENT_URL: string;
  BOX_QUANTITY: string;
  PRODUCT_WEIGHT: string;
  SAMPLE_SIZE: string;
  LOAD_DEFLECTION_ATTACHMENT_URL: string;
  BOX_MARKING_ATTACHMENT_URL: string;
  PDI_REMARKS: string;
}

/** Item-level rows (one per item, not per order) for the PDI queue's table, matching the old
 * CRR reference view — used for both the pending and Completed toggle states. */
export async function listPdiItems(status?: string) {
  const res = await api.get<PdiItemRow[]>("/orders/pdi/items", { params: { status } });
  return res.data;
}
