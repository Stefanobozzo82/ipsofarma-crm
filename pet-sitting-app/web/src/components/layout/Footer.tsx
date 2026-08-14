import { Camera, PawPrint, Send, Share2, Video } from "lucide-react";
import { useState, type FormEvent } from "react";

const columns: { title: string; links: string[] }[] = [
  { title: "Chi siamo", links: ["La nostra storia", "Come funziona", "Lavora con noi", "Blog"] },
  { title: "Assistenza", links: ["Centro assistenza", "Contattaci", "Sicurezza e fiducia", "Garanzia"] },
  { title: "Legale", links: ["Termini di servizio", "Privacy", "Cookie", "Politica di cancellazione"] },
  { title: "Per i sitter", links: ["Diventa sitter", "Requisiti", "Guadagni e pagamenti", "Risorse per sitter"] },
];

export function Footer() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    // Nessun invio reale ancora — nessun endpoint newsletter esiste oggi
    // lato backend. Segnaposto visivo, come il resto della pagina.
    setSubmitted(true);
  }

  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-content px-6 py-16">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:grid-cols-6">
          <div className="col-span-2 flex flex-col gap-4 lg:col-span-2">
            <a href="#" className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
              <PawPrint className="text-accent" size={24} strokeWidth={2.25} />
              Fido
            </a>
            <p className="max-w-xs text-sm text-ink-muted">
              Pet sitting e passeggiate cani di fiducia, con sitter verificati vicino a te.
            </p>

            <form onSubmit={handleSubmit} className="flex max-w-xs flex-col gap-2">
              <label htmlFor="newsletter-email" className="text-sm font-display font-bold text-ink">
                Resta aggiornato
              </label>
              <div className="flex gap-2">
                <input
                  id="newsletter-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="La tua email"
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                />
                <button
                  type="submit"
                  aria-label="Iscriviti alla newsletter"
                  className="flex shrink-0 items-center justify-center rounded-xl bg-accent px-3 text-accent-ink transition hover:bg-accent/90"
                >
                  <Send size={16} />
                </button>
              </div>
              {submitted ? <p className="text-xs text-success">Grazie! Controlla la tua email a breve.</p> : null}
            </form>
          </div>

          {columns.map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <h4 className="font-display font-bold text-ink">{column.title}</h4>
              <ul className="flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-ink-muted hover:text-accent">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-line pt-6 sm:flex-row">
          <p className="text-sm text-ink-faint">© {new Date().getFullYear()} Fido. Tutti i diritti riservati.</p>
          {/* lucide-react non include più i loghi dei brand (rimossi dalla
           * libreria) — icone generiche con aria-label esplicito al posto
           * dei loghi reali di Instagram/Facebook/YouTube. */}
          <div className="flex items-center gap-4 text-ink-faint">
            <a href="#" aria-label="Instagram" className="hover:text-accent">
              <Camera size={20} />
            </a>
            <a href="#" aria-label="Facebook" className="hover:text-accent">
              <Share2 size={20} />
            </a>
            <a href="#" aria-label="YouTube" className="hover:text-accent">
              <Video size={20} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
