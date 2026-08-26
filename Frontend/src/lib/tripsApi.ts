import { api } from "./api";
import type { OrderRecord } from "./ordersApi";

export interface TripRecord {
  Transport_ID: string;
  Status: string;
  [key: string]: string;
}

export async function listTrips(
  status?: string,
  opts?: { excludeIfInTab?: string; includeIfInTab?: string }
) {
  const res = await api.get<TripRecord[]>("/transport-trips", {
    params: { status, excludeIfInTab: opts?.excludeIfInTab, includeIfInTab: opts?.includeIfInTab },
  });
  return res.data;
}

/** Item-level view of the SAME trips listTrips() would return for this status — one row per
 * Transport_Products item instead of one per trip. Raw sheet-header keys, same convention as
 * listStageRows(), since the caller picks its own display columns. */
export async function listTripItems(status?: string, opts?: { excludeIfInTab?: string }) {
  const res = await api.get<Record<string, string>[]>("/transport-trips", {
    params: { status, excludeIfInTab: opts?.excludeIfInTab, itemLevel: "true" },
  });
  return res.data;
}

/** A stage's own completed rows, straight off its own sheet tab — raw sheet-header keys,
 * since these six tabs have very different column sets and no shared field-name map. The
 * caller picks which columns to show via that stage's own `completedColumns`. */
export async function listStageRows(tab: string) {
  const res = await api.get<Record<string, string>[]>("/transport-trips/stage-rows", { params: { tab } });
  return res.data;
}

export interface TripDispatchRow {
  orderId: string;
  transportSoId: string;
  customerName: string;
  timestamp: string;
}

export interface TripItemDispatchRow {
  partNo: string;
  partName: string;
  totalQtyOfOrder: string;
  loadQty: string;
  unit: string;
  loadBoxes: string;
}

/** Tax Invoice's own item breakdown — Price/Basic/Tax/Total Amount, already scaled to this
 * row's own load quantity (not the item's full order quantity) server-side, so these can be
 * shown as-is. See tripRoutes.ts's scaledItemFields for why that scaling matters. */
export interface TripTaxInvoiceItemRow {
  partName: string;
  qty: string;
  unit: string;
  price: string;
  basicAmount: string;
  taxAmount: string;
  totalAmount: string;
  remarks: string;
}

export async function getTrip(transportId: string) {
  const res = await api.get<{
    transport: TripRecord;
    orders: OrderRecord[];
    /** The first attached order's own Transport_SO row — raw sheet headers, carries the
     * buyer/billing/shipping/consignee/logistics snapshot as it was at attach time (several
     * fields, like Freight Paid by/at and Transporter GSTIN/PAN, aren't on ORDER_PUNCH at
     * all since they're per-trip choices, not order defaults). Null if nothing's attached. */
    orderSnapshot: Record<string, string> | null;
    dispatches: TripDispatchRow[];
    items: TripItemDispatchRow[];
    // Optional defensively — absent entirely if this request happens to hit a backend
    // deploy older than this frontend bundle (two separate Vercel projects, deployed
    // separately). Every consumer defaults this to [] rather than assuming it's present.
    taxInvoiceItems?: TripTaxInvoiceItemRow[];
    stockReleaseDone: boolean;
    taxInvoiceDone: boolean;
    gatePassFileId?: string;
    stockReleaseAttachmentFileId?: string;
    stockReleaseFrom?: string;
    stockReleaseStatus?: string;
    taxInvoiceNo?: string;
    taxInvoiceDate?: string;
  }>(`/transport-trips/${transportId}`);
  return res.data;
}

export async function listEligibleOrders() {
  const res = await api.get<OrderRecord[]>("/transport-trips/eligible-orders");
  return res.data;
}

export interface EligibleItemRow {
  CREATED_AT: string;
  ORDER_ID: string;
  ITEM_ID: string;
  CUST_ID: string;
  CUSTOMER_NAME: string;
  PART_NO: string;
  PART_NAME: string;
  QTY: string;
  UOM: string;
  STATUS_LABEL: string;
}

/** Item-level view of orders waiting for (status omitted/"Transport Pending") or already
 * picked up by ("Vehicle Arrange Completed") vehicle arrangement — one row per item. */
export async function listEligibleItems(status?: string) {
  const res = await api.get<EligibleItemRow[]>("/transport-trips/eligible-items", { params: { status } });
  return res.data;
}

export interface CreateTripPayload {
  vehicleArrangeFor: string;
  sendThrough?: string;
  transporterId?: string;
  transporterName?: string;
  transporterType?: string;
  zotoVehicleId?: string;
  vehicleType?: string;
  vehicleNo?: string;
  vehicleSize?: string;
  driverName?: string;
  driverContactNo?: string;
  freightApplicableOnInvoice?: string;
  freightCharge?: number;
  freightGstApplicable?: string;
  description?: string;
}

export async function createTrip(payload: CreateTripPayload) {
  const res = await api.post<{ transportId: string }>("/transport-trips", payload);
  return res.data;
}

export interface AttachOrderItemPick {
  itemId: string;
  qty: number;
  loadBoxes?: number;
}

export interface AttachOrderEntry {
  orderId: string;
  /** Optional per-item quantity picks (the "Load Limit Details" flow) — omit to attach the
   * whole order at its full item quantities. */
  items?: AttachOrderItemPick[];
  /** The Transport Form's own Logistic Details tab — editable per order. */
  preferredDeliveryMode?: string;
  freightPaidBy?: string;
  freightPaidAt?: string;
}

export async function attachOrders(transportId: string, orders: AttachOrderEntry[]) {
  const res = await api.post<{ transportId: string; attached: number }>(`/transport-trips/${transportId}/orders`, { orders });
  return res.data;
}

export async function submitTripStage(transportId: string, action: string, payload: Record<string, string | number>) {
  const res = await api.post<{ transportId: string; status: string }>(`/transport-trips/${transportId}/${action}`, payload);
  return res.data;
}
