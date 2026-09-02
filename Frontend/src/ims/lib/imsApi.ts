import { api } from "../../lib/api";

export type SheetRow = Record<string, string>;

// ---- Masters ------------------------------------------------------------------------------
export const listFgMasters = () => api.get<SheetRow[]>("/ims/masters/fg").then((r) => r.data);
export const createFgMaster = (body: Record<string, string>) => api.post("/ims/masters/fg", body).then((r) => r.data);

export const listRmMasters = () => api.get<SheetRow[]>("/ims/masters/rm").then((r) => r.data);
export const createRmMaster = (body: Record<string, string>) => api.post("/ims/masters/rm", body).then((r) => r.data);

export const listOtherMasters = () => api.get<SheetRow[]>("/ims/masters/other").then((r) => r.data);
export const createOtherMaster = (body: Record<string, string>) => api.post("/ims/masters/other", body).then((r) => r.data);

export const listWipMasters = () => api.get<SheetRow[]>("/ims/masters/wip").then((r) => r.data);
export const createWipMaster = (body: Record<string, string>) => api.post("/ims/masters/wip", body).then((r) => r.data);
export const setCastedWeight = (idS: string, body: { weightGrams: string; imageUrl?: string }) =>
  api.patch(`/ims/masters/wip/${encodeURIComponent(idS)}/casted-weight`, body).then((r) => r.data);

export const listImsCustomers = () => api.get<SheetRow[]>("/ims/masters/customers").then((r) => r.data);
export const createImsCustomer = (body: Record<string, string>) => api.post("/ims/masters/customers", body).then((r) => r.data);

// ---- Stock (Record Entry) ------------------------------------------------------------------
export type ImsProductType = "fg" | "rm" | "wip" | "other";

export const listStockRecords = (type: ImsProductType) => api.get<SheetRow[]>(`/ims/stock/${type}/records`).then((r) => r.data);
export const createStockRecord = (type: ImsProductType, body: Record<string, string>) =>
  api.post(`/ims/stock/${type}/records`, body).then((r) => r.data);

// ---- Racks --------------------------------------------------------------------------------
export const listRacks = () => api.get<SheetRow[]>("/ims/racks").then((r) => r.data);
export const createRack = (body: Record<string, string>) => api.post("/ims/racks", body).then((r) => r.data);
export const rackFgBalance = (rackNo: string) =>
  api.get<{ oldPartNo: string; balance: number }[]>(`/ims/racks/${encodeURIComponent(rackNo)}/fg-balance`).then((r) => r.data);

// ---- Inventory (balances / snapshots) --------------------------------------------------------
export const listBalances = (type: ImsProductType) =>
  api.get<{ part: string; balance: number }[]>(`/ims/inventory/${type}/balances`).then((r) => r.data);
export const listSnapshots = (type: ImsProductType) => api.get<SheetRow[]>(`/ims/inventory/${type}/snapshots`).then((r) => r.data);

// ---- Production -----------------------------------------------------------------------------
export const listBatches = () => api.get<SheetRow[]>("/ims/production/batches").then((r) => r.data);
export const createBatch = (body: Record<string, string>) => api.post("/ims/production/batches", body).then((r) => r.data);
export const setCastedParts = (batchId: string, body: Record<string, string>) =>
  api.patch(`/ims/production/batches/${encodeURIComponent(batchId)}/casted`, body).then((r) => r.data);
export const createBatchFollowup = (batchId: string, body: Record<string, string>) =>
  api.post(`/ims/production/batches/${encodeURIComponent(batchId)}/followups`, body).then((r) => r.data);

export const listAssemblies = () => api.get<SheetRow[]>("/ims/production/assemblies").then((r) => r.data);
export const createAssembly = (body: Record<string, string>) => api.post("/ims/production/assemblies", body).then((r) => r.data);
export const createAssemblyFollowup = (assemblyId: string, body: Record<string, string>) =>
  api.post(`/ims/production/assemblies/${encodeURIComponent(assemblyId)}/followups`, body).then((r) => r.data);

export const createProducedPart = (body: Record<string, string>) => api.post("/ims/production/produced-parts", body).then((r) => r.data);
export const warehouseInProducedPart = (productionId: string, body: { quantity: string }) =>
  api.post(`/ims/production/produced-parts/${encodeURIComponent(productionId)}/warehouse-in`, body).then((r) => r.data);

// ---- Requisitions -----------------------------------------------------------------------------
export const listProductionRequisitions = () => api.get<SheetRow[]>("/ims/requisitions/production").then((r) => r.data);
export const listAssemblyRequisitions = () => api.get<SheetRow[]>("/ims/requisitions/assembly").then((r) => r.data);
export const requestProductionRequisition = (batchId: string) =>
  api.post(`/ims/requisitions/production/${encodeURIComponent(batchId)}/request`).then((r) => r.data);
export const requestAssemblyRequisition = (assemblyId: string) =>
  api.post(`/ims/requisitions/assembly/${encodeURIComponent(assemblyId)}/request`).then((r) => r.data);
export const releaseRequisition = (body: Record<string, string | string[]>) =>
  api.post("/ims/requisitions/release", body).then((r) => r.data);
export const undoRelease = (releaseId: string) => api.delete(`/ims/requisitions/release/${encodeURIComponent(releaseId)}`).then((r) => r.data);

// ---- KYC -----------------------------------------------------------------------------------
export const listPendingKyc = () => api.get<SheetRow[]>("/ims/kyc/pending").then((r) => r.data);
export const searchKycCustomers = (q: string) => api.get<SheetRow[]>("/ims/kyc/search", { params: { q } }).then((r) => r.data);
export const createKyc = (customerCode: string) => api.post("/ims/kyc/create", { customerCode }).then((r) => r.data);

// ---- Settings -----------------------------------------------------------------------------
export const getRequisitionEmailSettings = () =>
  api.get<{ recipients: string[] }>("/ims/settings/requisition-email").then((r) => r.data);
export const setRequisitionEmailSettings = (recipients: string[]) =>
  api.put("/ims/settings/requisition-email", { recipients }).then((r) => r.data);
