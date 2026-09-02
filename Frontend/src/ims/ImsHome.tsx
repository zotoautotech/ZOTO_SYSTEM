import { Link } from "react-router-dom";

/** IMS landing page — a simple nav grid to every built area. Matches the flat top-level-route
 * pattern Checklist/NPD use (App.tsx registers "ims", "ims/masters/:type", etc. directly,
 * not nested under /modules). Production/Requisitions/KYC/Inventory/Settings have working
 * backend routes (Backend/src/routes/ims/*.ts) but no frontend page yet — listed here as
 * "backend ready" rather than hidden, since hiding a built API behind no UI at all is worse
 * than an honest placeholder. */
const AREAS: { label: string; to: string; ready: boolean }[] = [
  { label: "Masters (FG / RM / WIP / Customer)", to: "/ims/masters/fg", ready: true },
  { label: "Stock — FG Record Entry", to: "/ims/stock/fg", ready: true },
  { label: "Stock — RM Record Entry", to: "/ims/stock/rm", ready: true },
  { label: "Stock — WIP Record Entry", to: "/ims/stock/wip", ready: true },
  { label: "Stock — Other Record Entry", to: "/ims/stock/other", ready: true },
  { label: "Racks", to: "/ims/racks", ready: true },
  { label: "Production (batches, assembly)", to: "/ims/production", ready: false },
  { label: "Requisitions", to: "/ims/requisitions", ready: false },
  { label: "Customer KYC", to: "/ims/kyc", ready: false },
  { label: "Inventory (balances, snapshots)", to: "/ims/inventory", ready: false },
  { label: "Settings", to: "/ims/settings", ready: false },
];

export function ImsHome() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>IMS — Inventory Management System</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {AREAS.map((a) => (
          <Link
            key={a.to}
            to={a.ready ? a.to : "/ims"}
            style={{
              display: "block",
              padding: 16,
              borderRadius: 8,
              border: "1px solid var(--border, #ddd)",
              textDecoration: "none",
              color: "inherit",
              opacity: a.ready ? 1 : 0.55,
              cursor: a.ready ? "pointer" : "default",
            }}
            onClick={(e) => {
              if (!a.ready) e.preventDefault();
            }}
          >
            <div style={{ fontWeight: 500 }}>{a.label}</div>
            {!a.ready && <div style={{ fontSize: 12, marginTop: 4 }}>Backend ready — frontend coming soon</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
