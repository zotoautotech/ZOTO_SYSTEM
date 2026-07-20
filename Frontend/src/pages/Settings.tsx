import { useState } from "react";
import { useAuth } from "../lib/auth";

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="5" />
      <path d="M8.5 13 7 21l5-2.5L17 21l-1.5-8" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="1.8">
      <path d="M12 3 4 6v6c0 4.5 3.2 7.7 8 9 4.8-1.3 8-4.5 8-9V6l-8-3Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  async function copy() {
    await navigator.clipboard.writeText(value!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 0",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: "var(--color-primary-tint)",
          color: "var(--color-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-muted" style={{ fontSize: 12 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
      </div>
      <button
        onClick={copy}
        title="Copy"
        style={{
          border: "1px solid var(--color-border)",
          background: "var(--color-bg-page)",
          borderRadius: 8,
          width: 30,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: copied ? "#2e7d32" : "var(--color-text-muted)",
          flexShrink: 0,
        }}
      >
        {copied ? "✓" : <CopyIcon />}
      </button>
    </div>
  );
}

export function Settings() {
  const { user } = useAuth();
  const initials = (user?.name || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div style={{ maxWidth: 680, marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 24,
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "var(--color-primary-tint)",
              color: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initials}
          </span>
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>{user?.name ?? "Account"}</h2>
            <span
              style={{
                display: "inline-block",
                background: "var(--color-bg-page)",
                border: "1px solid var(--color-border)",
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {user?.role ?? "User"}
            </span>
            <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
              View and manage your personal information and account details.
            </p>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--color-bg-page)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: "10px 16px",
          }}
        >
          <ShieldCheckIcon />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Account Verified</div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              Your account is secure
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "8px 24px 4px" }}>
        <div style={{ padding: "16px 0", borderBottom: "1px solid var(--color-border)" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Personal Information</h3>
          <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            Your personal and account details
          </p>
        </div>
        <InfoRow icon={<PersonIcon />} label="Name" value={user?.name} />
        <InfoRow icon={<MailIcon />} label="Email" value={user?.email} />
        <InfoRow icon={<BadgeIcon />} label="Role" value={user?.role} />
      </div>
    </div>
  );
}
