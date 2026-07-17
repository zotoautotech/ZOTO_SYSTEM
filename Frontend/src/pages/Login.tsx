import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Login() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email);
      navigate("/");
    } catch {
      setError("Email not recognized. Check with your Admin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg-page)",
      }}
    >
      <form onSubmit={onSubmit} className="card" style={{ padding: 32, width: 360 }}>
        <h2 style={{ marginTop: 0 }}>ZOTO SALES CRR</h2>
        <label style={{ fontSize: 14 }}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@theairtrap.com"
          style={{
            width: "100%",
            padding: 12,
            margin: "8px 0 16px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
          }}
        />
        {error && <p style={{ color: "var(--color-error)", fontSize: 13 }}>{error}</p>}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
