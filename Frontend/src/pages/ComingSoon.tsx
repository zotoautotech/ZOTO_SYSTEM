import { useLocation } from "react-router-dom";

export function ComingSoon() {
  const location = useLocation();
  const name = (location.state as { name?: string } | null)?.name;

  return (
    <div
      style={{
        height: "calc(100vh - var(--topbar-height) - 60px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚧</div>
        <h2 style={{ margin: 0, fontWeight: 600 }}>Coming soon</h2>
        <p className="text-muted" style={{ marginTop: 8 }}>
          {name ? `${name} is under construction.` : "This page is under construction."}
        </p>
      </div>
    </div>
  );
}
