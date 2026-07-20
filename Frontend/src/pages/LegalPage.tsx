import { useNavigate } from "react-router-dom";

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: "#fbfbfc", color: "#171717" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 80px" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            border: "none",
            background: "none",
            color: "#5c5f6a",
            fontSize: 14,
            cursor: "pointer",
            marginBottom: 24,
            padding: 0,
          }}
        >
          ‹ Back
        </button>
        <h1 style={{ margin: "0 0 4px", fontSize: 32, fontWeight: 800 }}>{title}</h1>
        <p style={{ margin: "0 0 32px", color: "#8a8d98", fontSize: 13 }}>Last updated: {lastUpdated}</p>
        <div style={{ fontSize: 15, lineHeight: 1.7, color: "#2c2e33" }}>{children}</div>
      </div>
    </div>
  );
}
