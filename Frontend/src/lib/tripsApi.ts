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

export async function attachOrders(transportId: string, orderIds: string[]) {
  const res = await api.post<{ transportId: string; attached: number }>(`/transport-trips/${transportId}/orders`, { orderIds });
  return res.data;
}

export async function submitTripStage(transportId: string, action: string, payload: Record<string, string | number>) {
  const res = await api.post<{ transportId: string; status: string }>(`/transport-trips/${transportId}/${action}`, payload);
  return res.data;
}
