import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { useAuth } from "../lib/auth";

const zotoLogo = "/zoto-logo.png";

function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPasswordInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Email not recognized or incorrect password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: "#fbfbfc",
        color: "#171717",
      }}
    >
      {/* concentric ring background, matching the reference layout */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-radial-gradient(circle at 18% 38%, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 68px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          position: "relative",
          maxWidth: 1180,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            paddingLeft: 24,
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "nowrap" }}>
            <h1 style={{ margin: 0, fontSize: 56, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap" }}>
              Welcome to
            </h1>
            <img src={zotoLogo} alt="ZOTO" style={{ height: 140, width: "auto", marginTop: -90 }} />
          </div>
          <div style={{ borderTop: "1px solid #e6e6e9", margin: "24px 0", maxWidth: 560 }} />
          <p style={{ margin: 0, color: "#5c5f6a", fontSize: 18, maxWidth: 560 }}>
            Leading Manufacturers in Car Accessories
          </p>
        </div>

        <div
          style={{
            flex: "0 0 460px",
            marginLeft: 24,
            background: "#ffffff",
            border: "1px solid #e6e6e9",
            boxShadow: "0 12px 32px rgba(16,24,40,0.08)",
            borderRadius: 24,
            padding: "40px 44px",
          }}
        >
          <h2 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 700 }}>Login</h2>
          <p style={{ margin: "0 0 32px", color: "#5c5f6a", fontSize: 14 }}>
            Sign in with your work email and password.
          </p>

          <form onSubmit={onSubmit}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "#5c5f6a",
                marginBottom: 8,
              }}
            >
              Email
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#f5f5f7",
                border: "1px solid #e0e0e5",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 20,
              }}
            >
              <span style={{ opacity: 0.5, display: "flex" }}>
                <MailIcon />
              </span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@theairtrap.com"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#171717",
                  fontSize: 15,
                }}
              />
            </div>

            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "#5c5f6a",
                marginBottom: 8,
              }}
            >
              Password
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#f5f5f7",
                border: "1px solid #e0e0e5",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 24,
              }}
            >
              <span style={{ opacity: 0.5, display: "flex" }}>
                <LockIcon />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#171717",
                  fontSize: 15,
                }}
              />
            </div>

            {error && (
              <p style={{ color: "#d32f2f", fontSize: 13, marginTop: -12, marginBottom: 20 }}>{error}</p>
            )}

            <button
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px 0",
                borderRadius: 10,
                border: "none",
                background: "#e53935",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 0.5,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading ? "SIGNING IN…" : "ENTER WORKSPACE"}
              {!loading && <span>→</span>}
            </button>
          </form>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          borderTop: "1px solid #e6e6e9",
          padding: "16px 6vw",
          fontSize: 11,
          color: "#8a8d98",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>© 2026 ZOTO AUTOTECH PRIVATE LIMITED</span>
        <span style={{ display: "flex", gap: 20 }}>
          <a href="/privacy-policy" style={{ color: "#8a8d98", textDecoration: "none", fontWeight: 600, letterSpacing: 0.5 }}>
            PRIVACY
          </a>
          <a href="/terms-of-use" style={{ color: "#8a8d98", textDecoration: "none", fontWeight: 600, letterSpacing: 0.5 }}>
            TERMS
          </a>
        </span>
      </div>
    </div>
  );
}
