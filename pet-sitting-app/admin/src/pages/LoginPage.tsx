import { useState } from "react";
import { useAuthStore } from "../store/auth-store";

export function LoginPage() {
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di accesso");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="centered">
      <form onSubmit={handleSubmit} className="card" style={{ width: 340 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🐾 Fido Admin</div>
        <p style={{ color: "var(--ink-muted)", marginTop: 0, marginBottom: 24 }}>Accesso riservato agli amministratori</p>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={loading || !email || !password}>
          {loading ? "Accesso in corso…" : "Accedi"}
        </button>
      </form>
    </div>
  );
}
