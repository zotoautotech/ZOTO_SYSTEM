import { api } from "../../lib/api";

/** NPD module API client — mirrors checklistApi.ts's shape. Every NPD endpoint hangs off
 * /npd (see Backend/src/routes/npd/index.ts). Taxonomy tables are generic (see
 * Backend/src/routes/npd/taxonomy.ts) — the field/label metadata comes straight from the
 * backend so the frontend never hardcodes a table's real sheet-header field names. */

export interface TaxonomyTableMeta {
  key: string;
  label: string;
  idColumn: string;
  fields: string[];
  requiredFields: string[];
  /** false for FG/RM SKU catalogs — new rows there come only from an approved Part Code
   * Request, not this generic form. Editing an existing row is still allowed either way. */
  allowCreate: boolean;
  /** Field names (subset of `fields`) the backend always computes itself on create — e.g.
   * rm-category/rm-category-dd's CODE/AGAINST ID, real AppSheet App Formula columns (see
   * Backend/src/services/npdPartCode.ts). Hidden from the create form (nothing for a doer to
   * fill in — the value is decided server-side), but still shown/editable when editing an
   * existing row, for a manual correction. */
  computedFields: string[];
}

export type TaxonomyRow = Record<string, string>;

export async function listTaxonomyTables() {
  const res = await api.get<{ tables: TaxonomyTableMeta[] }>("/npd/taxonomy");
  return res.data.tables;
}

export async function listTaxonomyRows(key: string) {
  const res = await api.get<{ rows: TaxonomyRow[] }>(`/npd/taxonomy/${encodeURIComponent(key)}`);
  return res.data.rows;
}

export async function createTaxonomyRow(key: string, body: TaxonomyRow) {
  const res = await api.post<{ id: string } & TaxonomyRow>(`/npd/taxonomy/${encodeURIComponent(key)}`, body);
  return res.data;
}

export async function updateTaxonomyRow(key: string, id: string, body: TaxonomyRow) {
  await api.put(`/npd/taxonomy/${encodeURIComponent(key)}/${encodeURIComponent(id)}`, body);
}

export async function deleteTaxonomyRow(key: string, id: string) {
  await api.delete(`/npd/taxonomy/${encodeURIComponent(key)}/${encodeURIComponent(id)}`);
}

// --- New Part Code Request (build-prompt §5.2) ---

export interface PartCodeRequestRecord {
  Timestamp: string;
  Useremail: string;
  "Part Request ID": string;
  "Part Type": "FG" | "RM";
  "Customer Name": string;
  "Old Part Code": string;
  Segment: string;
  Category: string;
  "Sub Category": string;
  "Part Name": string;
  "Part Description": string;
  Attachment: string;
  Remarks: string;
  "Part Code": string;
  Status: "Requested" | "Approved" | "Rejected";
  "Assign Note": string;
  [key: string]: string;
}

export interface CreatePartCodeRequestPayload {
  partType: "FG" | "RM";
  customerName?: string;
  oldPartCode?: string;
  segment?: string;
  category: string;
  subCategory: string;
  partName: string;
  partDescription?: string;
  attachment?: string;
  remarks?: string;
}

export async function listPartCodeRequests(status?: string) {
  const res = await api.get<{ requests: PartCodeRequestRecord[] }>("/npd/part-code-requests", {
    params: status ? { status } : undefined,
  });
  return res.data.requests;
}

export async function createPartCodeRequest(payload: CreatePartCodeRequestPayload) {
  const res = await api.post<{ id: string }>("/npd/part-code-requests", payload);
  return res.data;
}

export async function approvePartCodeRequest(id: string) {
  const res = await api.post<{ id: string; partCode: string; catalogId: string }>(
    `/npd/part-code-requests/${encodeURIComponent(id)}/approve`
  );
  return res.data;
}

export async function rejectPartCodeRequest(id: string, note: string) {
  await api.post(`/npd/part-code-requests/${encodeURIComponent(id)}/reject`, { note });
}

// --- BOM Builder (build-prompt §5.3) ---

export interface BomLine {
  Timestamp: string;
  Useremail: string;
  "Unique ID": string;
  "FG ID": string;
  "FG Code": string;
  Category: string;
  "Sub Category": string;
  "RM ID": string;
  "RM Code": string;
  Quantity: string;
  Units: string;
  Levels: string;
  "Level Sorting": string;
  Rate: string;
  "Rate x Quantity Price": string;
  Status: "Draft" | "Verified";
  [key: string]: string;
}

export interface CreateBomLinePayload {
  fgId: string;
  rmId: string;
  quantity: number;
  units: string;
  level?: string;
  levelSorting?: number;
  rate?: number;
}

export interface UpdateBomLinePayload {
  quantity?: number;
  units?: string;
  level?: string;
  levelSorting?: number;
  rate?: number;
}

export async function listBomLines(fgId: string) {
  const res = await api.get<{ lines: BomLine[] }>("/npd/bom", { params: { fgId } });
  return res.data.lines;
}

export async function createBomLine(payload: CreateBomLinePayload) {
  const res = await api.post<{ id: string; costOfGoods: number }>("/npd/bom", payload);
  return res.data;
}

export async function updateBomLine(id: string, payload: UpdateBomLinePayload) {
  const res = await api.put<{ id: string; costOfGoods: number }>(`/npd/bom/${encodeURIComponent(id)}`, payload);
  return res.data;
}

export async function deleteBomLine(id: string) {
  const res = await api.delete<{ deleted: number; costOfGoods: number }>(`/npd/bom/${encodeURIComponent(id)}`);
  return res.data;
}

export async function verifyBomLine(id: string) {
  await api.post(`/npd/bom/${encodeURIComponent(id)}/verify`);
}

// --- NPD Changelog / Price Change Queue (build-prompt §5.4, §7 screen 8) ---

export interface ChangelogEntry {
  Timestamp: string;
  Useremail: string;
  Entity: string;
  "Entity ID": string;
  Field: string;
  "Old Value": string;
  "New Value": string;
  Reason: string;
  [key: string]: string;
}

export async function listChangelog(params?: { entity?: string; entityId?: string }) {
  const res = await api.get<{ entries: ChangelogEntry[] }>("/npd/changelog", { params });
  return res.data.entries;
}

// --- Projects board (build-prompt §5.1, §7 screen 2) ---

export type ProjectStatus = "Open" | "In Review" | "Pending Customer" | "Closed";

export interface ProjectRecord {
  Timestamp: string;
  Useremail: string;
  "Project ID": string;
  Segment: string;
  "Project Name": string;
  "Project Description": string;
  "Project Deadline": string;
  "Customer Name": string;
  "Assigned By": string;
  "Assigned To": string;
  Priority: string;
  Status: ProjectStatus;
  "Closing Remarks": string;
  [key: string]: string;
}

export interface CreateProjectPayload {
  segment?: string;
  projectName: string;
  projectDescription?: string;
  projectDeadline?: string;
  customerName?: string;
  assignedTo?: string;
  priority?: string;
}

export async function listProjects(status?: string) {
  const res = await api.get<{ projects: ProjectRecord[] }>("/npd/projects", { params: status ? { status } : undefined });
  return res.data.projects;
}

export async function getProject(id: string) {
  const res = await api.get<{ project: ProjectRecord }>(`/npd/projects/${encodeURIComponent(id)}`);
  return res.data.project;
}

export async function createProject(payload: CreateProjectPayload) {
  const res = await api.post<{ id: string }>("/npd/projects", payload);
  return res.data;
}

export async function updateProject(id: string, payload: Partial<CreateProjectPayload>) {
  await api.put(`/npd/projects/${encodeURIComponent(id)}`, payload);
}

export async function closeProject(id: string, remarks: string) {
  await api.post(`/npd/projects/${encodeURIComponent(id)}/close`, { remarks });
}

export interface ConversationMessage {
  Timestamp: string;
  Useremail: string;
  "Project ID": string;
  Message: string;
  [key: string]: string;
}

export async function listConversation(projectId: string) {
  const res = await api.get<{ messages: ConversationMessage[] }>(`/npd/projects/${encodeURIComponent(projectId)}/conversation`);
  return res.data.messages;
}

export async function postConversationMessage(projectId: string, message: string) {
  await api.post(`/npd/projects/${encodeURIComponent(projectId)}/conversation`, { message });
}

// --- NPD Attachment review (build-prompt §5.1, §7 screen 3) ---

export interface NpdAttachmentRecord {
  Timestamp: string;
  Useremail: string;
  "Attachment ID": string;
  "Project ID": string;
  "Doc Type": string;
  File: string;
  "Quality Review": "" | "Approved" | "Rejected";
  "Quality Review Remarks": string;
  "Quality Review Timestamp": string;
  "Design HOD Review": "" | "Approved" | "Rejected";
  "Design HOD Review Remarks": string;
  "Design HOD Review Timestamp": string;
  [key: string]: string;
}

export async function listNpdAttachments(projectId: string) {
  const res = await api.get<{ attachments: NpdAttachmentRecord[] }>("/npd/npd-attachments", { params: { projectId } });
  return res.data.attachments;
}

export async function createNpdAttachment(payload: { projectId: string; docType: string; file: string }) {
  const res = await api.post<{ id: string }>("/npd/npd-attachments", payload);
  return res.data;
}

export async function submitQualityReview(id: string, decision: "Approved" | "Rejected", remarks?: string) {
  await api.post(`/npd/npd-attachments/${encodeURIComponent(id)}/quality-review`, { decision, remarks });
}

export async function submitDesignHodReview(id: string, decision: "Approved" | "Rejected", remarks?: string) {
  await api.post(`/npd/npd-attachments/${encodeURIComponent(id)}/design-hod-review`, { decision, remarks });
}

// --- Customer Onboarding & KYC (build-prompt §5.5) ---

export interface RaiseRequestRecord {
  Timestamp: string;
  Useremail: string;
  "Request ID": string;
  "Customer Name": string;
  "Contact No.": string;
  Email: string;
  Address: string;
  "Credit Days": string;
  "Grace Period": string;
  "TDS TCS Applicable": string;
  Status: string;
  Remarks: string;
  [key: string]: string;
}

export interface CreateRaiseRequestPayload {
  customerName: string;
  contactNo?: string;
  email?: string;
  address?: string;
  creditDays?: number;
  gracePeriod?: number;
  tdsTcsApplicable?: string;
}

export async function listRaiseRequests() {
  const res = await api.get<{ requests: RaiseRequestRecord[] }>("/npd/customer/raise-requests");
  return res.data.requests;
}

export async function createRaiseRequest(payload: CreateRaiseRequestPayload) {
  const res = await api.post<{ id: string }>("/npd/customer/raise-requests", payload);
  return res.data;
}

export interface KycRecord {
  Timestamp: string;
  Useremail: string;
  "KYC ID": string;
  "Request ID": string;
  "Customer Name": string;
  GSTIN: string;
  PAN: string;
  "Name on PAN": string;
  "Registered Email": string;
  "Registered Contact No.": string;
  "Firm Type": string;
  Documents: string;
  "KYC Status": string;
  Remarks: string;
  [key: string]: string;
}

export interface CreateKycPayload {
  requestId?: string;
  customerName: string;
  gstin?: string;
  pan?: string;
  nameOnPan?: string;
  registeredEmail?: string;
  registeredContactNo?: string;
  firmType?: string;
  documents?: string;
}

export async function listKyc() {
  const res = await api.get<{ kyc: KycRecord[] }>("/npd/customer/kyc");
  return res.data.kyc;
}

export async function createKyc(payload: CreateKycPayload) {
  const res = await api.post<{ id: string }>("/npd/customer/kyc", payload);
  return res.data;
}

export async function decideKyc(id: string, decision: "Approved" | "Rejected", remarks?: string) {
  const res = await api.post<{ id: string; decision: string; customerId?: string }>(
    `/npd/customer/kyc/${encodeURIComponent(id)}/decide`,
    { decision, remarks }
  );
  return res.data;
}

// --- Purchase (build-prompt §5.6) ---

export interface TaxInvoiceRecord {
  Timestamp: string;
  Useremail: string;
  "Invoice ID": string;
  "Vendor ID": string;
  "Vendor Name": string;
  "Invoice No.": string;
  "Invoice Date": string;
  "Basic Amount": string;
  CGST: string;
  SGST: string;
  IGST: string;
  TDS: string;
  Discount: string;
  "Total Amount Inc Tax": string;
  Status: string;
  [key: string]: string;
}

export interface CreateTaxInvoicePayload {
  vendorId: string;
  invoiceNo: string;
  invoiceDate?: string;
  basicAmount: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  tds?: number;
  discount?: number;
}

export async function listTaxInvoices() {
  const res = await api.get<{ invoices: TaxInvoiceRecord[] }>("/npd/purchase/tax-invoices");
  return res.data.invoices;
}

export async function createTaxInvoice(payload: CreateTaxInvoicePayload) {
  const res = await api.post<{ id: string; totalAmountIncTax: number }>("/npd/purchase/tax-invoices", payload);
  return res.data;
}

export interface StoreInRecord {
  Timestamp: string;
  Useremail: string;
  "Store In ID": string;
  "Invoice ID": string;
  "RM ID": string;
  "RM Code": string;
  Quantity: string;
  "QC Status": string;
  "Weight Check Image": string;
  Remarks: string;
  [key: string]: string;
}

export interface CreateStoreInPayload {
  invoiceId: string;
  rmId: string;
  quantity: number;
  qcStatus: "Passed" | "Failed";
  weightCheckImage?: string;
  remarks?: string;
}

export async function listStoreIn(invoiceId?: string) {
  const res = await api.get<{ entries: StoreInRecord[] }>("/npd/purchase/store-in", { params: invoiceId ? { invoiceId } : undefined });
  return res.data.entries;
}

export async function createStoreIn(payload: CreateStoreInPayload) {
  const res = await api.post<{ id: string }>("/npd/purchase/store-in", payload);
  return res.data;
}

// --- Stock & WIP Dashboard + Notifications (build-prompt §7 screen 12, §8) ---

export interface StockItem {
  fgId: string;
  name: string;
  category: string;
  subCategory: string;
  unit: string;
  openingStock: number;
  minStock: number;
  maxStock: number;
  costOfGoods: number;
  lowStock: boolean;
}

export async function listStock() {
  const res = await api.get<{ items: StockItem[] }>("/npd/dashboard/stock");
  return res.data.items;
}

export interface NotificationsSummary {
  pendingAttachments: { attachmentId: string; projectId: string; docType: string; needsQuality: boolean; needsDesignHod: boolean }[];
  pendingKyc: { kycId: string; customerName: string }[];
  lowStockFg: { fgId: string; name: string; openingStock: number; minStock: number }[];
  recentPriceChanges: ChangelogEntry[];
}

export async function getNotifications() {
  const res = await api.get<NotificationsSummary>("/npd/dashboard/notifications");
  return res.data;
}

// RM SKU creation (the real "Raw Material SKU Form", RmSkuForm.tsx) now goes through the
// generic `createTaxonomyRow("rm-sku", ...)` above, same as every other taxonomy table — the
// server computes PART NO. itself (see Backend/src/services/npdPartCode.ts's generateRmPartCode()
// doc comment for the real, verified App Formula this replicates). The old dedicated
// /npd/rm-part-code/generate endpoint + RmPartCodeGenerator.tsx page are gone.
