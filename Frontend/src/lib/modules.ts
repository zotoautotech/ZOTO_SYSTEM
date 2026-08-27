export const UOM_OPTIONS = [
  "KGS", "MTR", "NOS", "UNT", "PCS", "PAC", "LTR", "SET", "BDL", "BAG", "BOX", "ROL", "DRM", "GRM", "FET",
];

export interface ModuleDef {
  key: string;
  label: string;
  icon: string;
}

export const MODULES: ModuleDef[] = [
  { key: "punch-order", label: "Punch Order", icon: "🧾" },
  { key: "sale-order", label: "Sale Order", icon: "📄" },
  { key: "so-confirmation", label: "SO Confirmation", icon: "✅" },
  { key: "dispatch-approval", label: "Dispatch Approval", icon: "📦" },
  // PDI is on hold for now (explicit user decision) — Box Quantity moved to the Dispatch
  // Approval form instead, and Transport eligibility no longer waits on this stage at all
  // (see Backend/src/routes/tripRoutes.ts's unattachedDispatchApprovedRounds). Tile hidden
  // from the module grid rather than deleted — the route/PdiList.tsx/stageRoutes.ts are all
  // still there in case this needs to come back.
  // { key: "pdi", label: "PDI", icon: "📋" },
  { key: "transport", label: "Transport", icon: "🚚" },
  { key: "transport-reached", label: "Transport Reached", icon: "🕒" },
  { key: "stock-release", label: "Stock Release", icon: "🗄️" },
  { key: "tax-invoice", label: "Tax Invoice", icon: "🧮" },
  { key: "dispatch", label: "Dispatch", icon: "📲" },
  { key: "collect-lr", label: "Collect LR", icon: "📍" },
  { key: "delivery", label: "Delivery", icon: "🏁" },
];
