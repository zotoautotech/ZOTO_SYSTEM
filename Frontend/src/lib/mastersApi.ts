import { api } from "./api";
import type { SelectOption } from "../components/form/SearchableSelect";

export interface CustomerRow {
  "CUST ID": string;
  "CUSTOMER NAME": string;
  "Company GSTIN NO.": string;
  [key: string]: string;
}

export interface CustomerDetail {
  customer: CustomerRow;
  addresses: Record<string, string>[];
  contacts: Record<string, string>[];
}

export interface GoodsRow {
  "FG ID": string;
  "PART NO.": string;
  Name: string;
  SEGMENT: string;
  CATEGORY: string;
  UNIT: string;
  price: string;
  [key: string]: string;
}

export interface BillingStrategyRow {
  "Strategy ID": string;
  "CUST ID": string;
  "Customer Name": string;
  "Part Code": string;
  "Part Name": string;
  "Default Rate T1": string;
  [key: string]: string;
}

export interface DropdownRow {
  Column: string;
  "Value (Text)": string;
  [key: string]: string;
}

export interface TransporterRow {
  "Transporter ID": string;
  Name: string;
  "Transporter Type": string;
  "Contact No.": string;
  "Contact Person Name": string;
  "Contact Person Contact No.": string;
  "Transporter Address": string;
  [key: string]: string;
}

export async function listCustomers(): Promise<CustomerRow[]> {
  const res = await api.get<CustomerRow[]>("/masters/customers");
  return res.data;
}

export function customersToOptions(customers: CustomerRow[]): SelectOption[] {
  return customers
    .filter((c) => c["CUST ID"])
    .map((c) => ({
      value: c["CUST ID"],
      label: c["CUSTOMER NAME"] || c["CUST ID"],
      subtitle: c["CUST ID"],
    }));
}

export async function getCustomerDetail(custId: string): Promise<CustomerDetail> {
  const res = await api.get<CustomerDetail>(`/masters/customers/${custId}`);
  return res.data;
}

export interface NewCustomerPayload {
  customerName: string;
  gstin?: string;
  panNo?: string;
  contactPersonName?: string;
  contactNo?: string;
  email?: string;
  paymentTermsDays?: number;
  billingAddressLine1: string;
  billingAddressLine2?: string;
  billingCity?: string;
  billingState: string;
  billingStateCode?: string;
  billingPincode: string;
  billingCountry?: string;
}

export async function createCustomer(payload: NewCustomerPayload) {
  const res = await api.post("/masters/customers", payload);
  return res.data as { custId: string; customerName: string; billingAddressLine1: string; billingState: string; billingPincode: string; billingCountry: string };
}

export async function listGoods(): Promise<GoodsRow[]> {
  const res = await api.get<GoodsRow[]>("/masters/goods");
  return res.data;
}

export function goodsToOptions(goods: GoodsRow[]): SelectOption[] {
  return goods
    .filter((g) => g["FG ID"])
    .map((g) => ({
      value: g["FG ID"],
      label: g.Name || `FG-${g["FG ID"]}`,
      subtitle: g["PART NO."] || undefined,
    }));
}

export interface NewPartPayload {
  partName: string;
  partNo?: string;
  segment?: string;
  category?: string;
  unit?: string;
  price?: number;
}

export async function createPart(payload: NewPartPayload) {
  const res = await api.post("/masters/goods", payload);
  return res.data as { fgId: string; partName: string; partNo?: string; segment?: string; category?: string; unit?: string; price?: number };
}

export async function listDropdowns(): Promise<DropdownRow[]> {
  const res = await api.get<DropdownRow[]>("/masters/dropdowns");
  return res.data;
}

/** Pulls the option list for one dropdown "Column" (e.g. "UOM") from the CRR DD master. */
export function dropdownValues(rows: DropdownRow[], column: string): string[] {
  return rows.filter((r) => r.Column === column && r["Value (Text)"]).map((r) => r["Value (Text)"]);
}

export async function listBillingStrategies(): Promise<BillingStrategyRow[]> {
  const res = await api.get<BillingStrategyRow[]>("/masters/billing-strategies");
  return res.data;
}

export async function listTransporters(): Promise<TransporterRow[]> {
  const res = await api.get<TransporterRow[]>("/masters/transporters");
  return res.data;
}

export function transportersToOptions(transporters: TransporterRow[]): SelectOption[] {
  return transporters
    .filter((t) => t["Transporter ID"])
    .map((t) => ({
      value: t["Transporter ID"],
      label: t.Name || t["Transporter ID"],
      subtitle: t["Transporter Type"] || undefined,
    }));
}
