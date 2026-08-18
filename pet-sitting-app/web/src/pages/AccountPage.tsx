import { LogOut, PawPrint } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/Button";
import { LoadingView } from "@/components/ui/LoadingView";

/**
 * Il sito non ha una vera "area personale" (nessuna prenotazione/profilo
 * da gestire qui, solo l'app li ha) — questa pagina è volutamente minima:
 * conferma che l'account esiste ed è lo stesso dell'app, con un invito a
 * scaricarla. Nome/cognome vengono da session.user.user_metadata, non da
 * una chiamata autenticata al backend (vedi store/auth-store.ts).
 */
export function AccountPage() {
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  useEffect(() => {
    if (status === "signedOut") navigate("/accedi", { replace: true });
  }, [status, navigate]);

  if (status === "loading" || status === "signedOut" || !session) {
    return <LoadingView />;
  }

  const firstName = (session.user.user_metadata?.first_name as string | undefined) || "";

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
        <PawPrint size={28} className="text-accent" strokeWidth={2} />
      </div>

      <div>
        <h1 className="text-2xl font-extrabold text-ink">Ciao{firstName ? `, ${firstName}` : ""}!</h1>
        <p className="mt-1 text-ink-muted">{session.user.email}</p>
      </div>

      <div className="w-full rounded-2xl border border-line bg-surface p-6 text-sm text-ink-muted shadow-soft">
        Il tuo account è pronto — è lo stesso che userai nell'app Fido. Scarica l'app (presto su App Store e
        Google Play) per cercare un sitter o gestire i tuoi animali.
      </div>

      <div className="flex w-full flex-col gap-2">
        <Button to="/diventa-sitter" variant="secondary" className="w-full">
          Diventa un sitter
        </Button>
        <Button to="/diventa-sitter/servizi" variant="text">
          Sei già un sitter? Gestisci servizi e tariffe
        </Button>
      </div>

      <Button onClick={handleSignOut} variant="secondary" className="gap-2">
        <LogOut size={16} />
        Esci
      </Button>
    </div>
  );
}
