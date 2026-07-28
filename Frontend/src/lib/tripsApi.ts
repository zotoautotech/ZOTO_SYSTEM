import { api } from "./api";
import type { OrderRecord } from "./ordersApi";

export interface TripRecord {
  Transport_ID: string;
  Status: string;
  [key: string]: string;
}

export async function listTrips(status?: string) {
  const res = await api.get<TripRecord[]>("/transport-trips", { params: { status } });
  return res.data;
}

export async function getTrip(transportId: string) {
  const res = await api.get<{ transport: TripRecord; orders: OrderRecord[] }>(`/transport-trips/${transportId}`);
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
  vehicleType?: string;
  vehicleNo?: string;
  vehicleSize?: string;
  driverName?: string;
  driverContactNo?: string;
  freightApplicableOnInvoice?: string;
  freightCharge?: number;
  description?: string;
}

export async function createTrip(payload: CreateTripPayload) {
  const res = await api.post<{ transportId: string }>("/transport-trips", payload);
  return res.data;
}

export interface AttachOrderItemPick {
  itemId: string;
  qty: number;
}

export interface AttachOrderEntry {
  orderId: string;
  /** Optional per-item quantity picks (the "Load Limit Details" flow) — omit to attach the
   * whole order at its full item quantities. */
  items?: AttachOrderItemPick[];
}

export async function attachOrders(transportId: string, orders: AttachOrderEntry[]) {
  const res = await api.post<{ transportId: string; attached: number }>(`/transport-trips/${transportId}/orders`, { orders });
  return res.data;
}

export async function submitTripStage(transportId: string, action: string, payload: Record<string, string | number>) {
  const res = await api.post<{ transportId: string; status: string }>(`/transport-trips/${transportId}/${action}`, payload);
  return res.data;
}
