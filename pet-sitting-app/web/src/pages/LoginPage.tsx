import { PawPrint } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/Button";

/** Stesse etichette italiane di mobile/src/i18n/strings.ts (auth.*) — non
 * un file i18n condiviso (il sito non ne ha bisogno per una sola lingua),
 * ma lo stesso testo per coerenza tra app e sito. */
export function LoginPage() {
  const navigate = useNavigate();
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate("/account");
    } catch {
      setError("Email o password non corretti.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-16">
      <Link to="/" className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
        <PawPrint className="text-accent" size={24} strokeWidth={2.25} />
        Fido
      </Link>

      <div className="w-full rounded-2xl border border-line bg-surface p-8 shadow-soft">
        <h1 className="text-2xl font-extrabold text-ink">Bentornato</h1>
        <p className="mt-1 text-sm text-ink-muted">Accedi per continuare</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-display font-bold text-ink">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-display font-bold text-ink">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
            />
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <Button type="submit" disabled={submitting} className="mt-2 w-full">
            {submitting ? "Accesso in corso…" : "Accedi"}
          </Button>
        </form>
      </div>

      <p className="text-sm text-ink-muted">
        Non hai un account?{" "}
        <Link to="/registrati" className="font-display font-bold text-accent">
          Registrati
        </Link>
      </p>
    </div>
  );
}
