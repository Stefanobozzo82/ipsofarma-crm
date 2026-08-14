import { ChevronDown, Menu, PawPrint, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { services } from "@/data/services";
import { preventPlaceholderNav } from "@/lib/placeholder-link";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/Button";
import { MobileNavDrawer } from "@/components/layout/MobileNavDrawer";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const status = useAuthStore((s) => s.status);
  const signOut = useAuthStore((s) => s.signOut);

  // Ombra che compare dopo i primi px di scroll, non da subito — un header
  // sticky con ombra fissa sembra "attaccato" anche quando si è in cima
  // alla pagina, dove invece deve leggersi come parte dell'hero.
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 bg-surface/95 backdrop-blur transition-shadow ${scrolled ? "shadow-soft" : ""}`}
    >
      <div className="mx-auto flex max-w-content items-center justify-between gap-6 px-6 py-4">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
          <PawPrint className="text-accent" size={24} strokeWidth={2.25} />
          Fido
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {/* Verso l'home + un'ancora: un href assoluto (non "#hero-search")
           * funziona sia già in home (scrolla e basta) sia da un'altra
           * pagina come /accedi (naviga in home e poi scrolla, comportamento
           * nativo del browser sui fragment, nessun JS in più necessario). */}
          <a href="/#hero-search" className="rounded-lg px-3 py-2 font-display font-bold text-ink hover:text-accent">
            Cerca sitter
          </a>
          <a
            href="#"
            onClick={preventPlaceholderNav}
            className="rounded-lg px-3 py-2 font-display font-bold text-ink hover:text-accent"
          >
            Diventa un sitter
          </a>

          <div
            className="relative"
            onMouseEnter={() => setServicesOpen(true)}
            onMouseLeave={() => setServicesOpen(false)}
          >
            <button
              type="button"
              onClick={() => setServicesOpen((v) => !v)}
              aria-expanded={servicesOpen}
              className="flex items-center gap-1 rounded-lg px-3 py-2 font-display font-bold text-ink hover:text-accent"
            >
              I nostri servizi
              <ChevronDown size={16} className={`transition-transform ${servicesOpen ? "rotate-180" : ""}`} />
            </button>

            <div
              className={`absolute left-1/2 top-full w-64 -translate-x-1/2 pt-2 transition ${
                servicesOpen ? "visible opacity-100" : "invisible opacity-0"
              }`}
            >
              <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-2 shadow-lifted">
                {services.map((service) => (
                  <a
                    key={service.id}
                    href={`/#servizi-${service.slug}`}
                    className="rounded-xl px-3 py-2 text-sm text-ink hover:bg-surface-muted"
                  >
                    {service.label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <a
            href="#"
            onClick={preventPlaceholderNav}
            className="rounded-lg px-3 py-2 font-display font-bold text-ink hover:text-accent"
          >
            Contatti
          </a>
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          {status === "signedIn" ? (
            <>
              <Link
                to="/account"
                className="flex items-center gap-1.5 font-display font-bold text-ink hover:text-accent"
              >
                <User size={17} />
                Il mio account
              </Link>
              <button type="button" onClick={() => signOut()} className="font-display font-bold text-ink-muted hover:text-ink">
                Esci
              </button>
            </>
          ) : (
            <>
              <Link to="/accedi" className="font-display font-bold text-ink-muted hover:text-ink">
                Accedi
              </Link>
              <Link to="/registrati" className="font-display font-bold text-ink-muted hover:text-ink">
                Registrati
              </Link>
              <Button to="/registrati" variant="primary">
                Registrati ora
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Apri menu"
          className="p-1 text-ink lg:hidden"
        >
          <Menu size={26} />
        </button>
      </div>

      <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </header>
  );
}
