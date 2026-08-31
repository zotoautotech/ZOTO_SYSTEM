import { Link } from "react-router-dom";

interface CardDef {
  to: string;
  icon: string;
  label: string;
}

const CARDS: CardDef[] = [
  { to: "/npd/projects", icon: "📋", label: "Projects Board" },
  { to: "/npd/taxonomy", icon: "🗂️", label: "Categories, Taxonomy & SKU Catalogs" },
  { to: "/npd/rm-part-code", icon: "🏷️", label: "RM Part Code Generator" },
  { to: "/npd/part-code-requests", icon: "🔖", label: "New Part Code Request" },
  { to: "/npd/bom", icon: "🧩", label: "BOM Builder" },
  { to: "/npd/price-changes", icon: "📈", label: "Price & BOM Change Log" },
  { to: "/npd/customer-onboarding", icon: "🧾", label: "Customer Onboarding & KYC" },
  { to: "/npd/purchase", icon: "🚚", label: "Purchase" },
  { to: "/npd/dashboard", icon: "📦", label: "Stock & WIP Dashboard" },
  { to: "/npd/notifications", icon: "🔔", label: "Notifications" },
];

/** NPD app landing page — one card per shipped section, matching HOME's own tile-grid pattern
 * one level down. Add a new CARDS entry (not a copy-pasted <Link> block) as future sprints
 * ship more sections. */
export function NpdHome() {
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 16,
              textDecoration: "none",
              color: "var(--color-text)",
            }}
          >
            <span style={{ fontSize: 24 }}>{card.icon}</span>
            <span style={{ fontWeight: 500 }}>{card.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
