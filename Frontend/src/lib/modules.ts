export const UOM_OPTIONS = [
  "KGS", "MTR", "NOS", "UNT", "PCS", "PAC", "LTR", "SET", "BDL", "BAG", "BOX", "ROL", "DRM", "GRM", "FET",
];

export interface ModuleDef {
  key: string;
  label: string;
  icon: string;
}

// 14 confirmed module cards + Production (added per docs/07-SHEET-REDESIGN-PLAN.md §B.6)
export const MODULES: ModuleDef[] = [
  { key: "punch-order", label: "Punch Order", icon: "🧾" },
  { key: "sale-order", label: "Sale Order", icon: "📄" },
  { key: "so-confirmation", label: "SO Confirmation", icon: "✅" },
  { key: "dispatch-approval", label: "Dispatch Approval", icon: "📦" },
  { key: "production", label: "Production", icon: "🏭" },
  { key: "pdi", label: "PDI", icon: "📋" },
  { key: "transport", label: "Transport", icon: "🚚" },
  { key: "transport-reached", label: "Transport Reached", icon: "🕒" },
  { key: "stock-release", label: "Stock Release", icon: "🗄️" },
  { key: "tax-invoice", label: "Tax Invoice", icon: "🧮" },
  { key: "dispatch", label: "Dispatch", icon: "📲" },
  { key: "collect-lr", label: "Collect LR", icon: "📍" },
  { key: "delivery", label: "Delivery", icon: "🏁" },
  { key: "remarks", label: "Remarks", icon: "💬" },
  { key: "sample", label: "Sample", icon: "🖐️" },
];
