import { PawPrint } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/Button";

export function RegisterPage() {
  const navigate = useNavigate();
  const signUp = useAuthStore((s) => s.signUp);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gdprConsent, setGdprConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // true = registrato ma serve confermare l'email prima di poter accedere
  // (dipende dall'impostazione "Confirm email" del progetto Supabase).
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const hasSession = await signUp({ email, password, firstName, lastName, gdprConsent });
      if (hasSession) navigate("/account");
      else setNeedsConfirmation(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Qualcosa è andato storto. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }

  if (needsConfirmation) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
        <PawPrint className="text-accent" size={40} strokeWidth={1.5} />
        <h1 className="text-2xl font-extrabold text-ink">Controlla la tua email</h1>
        <p className="text-ink-muted">
          Ti abbiamo inviato un link di conferma a <strong className="text-ink">{email}</strong>. Confermalo per
          poter accedere al tuo account.
        </p>
        <Button to="/accedi" variant="secondary" className="mt-2">
          Vai al login
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-16">
      <Link to="/" className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
        <PawPrint className="text-accent" size={24} strokeWidth={2.25} />
        Fido
      </Link>

      <div className="w-full rounded-2xl border border-line bg-surface p-8 shadow-soft">
        <h1 className="text-2xl font-extrabold text-ink">Crea il tuo account</h1>
        <p className="mt-1 text-sm text-ink-muted">Cerca un pet sitter o iscriviti come sitter</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-display font-bold text-ink">Nome</span>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-display font-bold text-ink">Cognome</span>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
              />
            </label>
          </div>

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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
            />
            <span className="text-xs text-ink-faint">Almeno 8 caratteri</span>
          </label>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              required
              checked={gdprConsent}
              onChange={(e) => setGdprConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span className="text-sm text-ink-muted">Accetto il trattamento dei dati personali</span>
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <Button type="submit" disabled={submitting} className="mt-2 w-full">
            {submitting ? "Creazione account…" : "Registrati"}
          </Button>
        </form>
      </div>

      <p className="text-sm text-ink-muted">
        Hai già un account?{" "}
        <Link to="/accedi" className="font-display font-bold text-accent">
          Accedi
        </Link>
      </p>
    </div>
  );
}
