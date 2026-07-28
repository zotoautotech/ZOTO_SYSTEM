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
  { key: "pdi", label: "PDI", icon: "📋" },
  { key: "transport", label: "Transport", icon: "🚚" },
  { key: "transport-reached", label: "Transport Reached", icon: "🕒" },
  { key: "stock-release", label: "Stock Release", icon: "🗄️" },
  { key: "tax-invoice", label: "Tax Invoice", icon: "🧮" },
  { key: "dispatch", label: "Dispatch", icon: "📲" },
  { key: "collect-lr", label: "Collect LR", icon: "📍" },
  { key: "delivery", label: "Delivery", icon: "🏁" },
];
