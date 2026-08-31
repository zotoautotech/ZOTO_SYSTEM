import { Link } from "react-router-dom";

interface CardDef {
  to: string;
  icon: string;
  label: string;
}

// All 11 cards removed on explicit user instruction (31 Aug 2026) — every route below still
// exists and works (Projects Board /npd/projects, Product Master /npd/product-master,
// Categories & Taxonomy /npd/taxonomy, RM Part Code Generator /npd/rm-part-code, New Part Code
// Request /npd/part-code-requests, BOM Builder /npd/bom, Price & BOM Change Log
// /npd/price-changes, Customer Onboarding & KYC /npd/customer-onboarding, Purchase
// /npd/purchase, Stock & WIP Dashboard /npd/dashboard, Notifications /npd/notifications) —
// only this landing-page grid was asked to go. Don't re-add entries here without being asked.
const CARDS: CardDef[] = [];

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
