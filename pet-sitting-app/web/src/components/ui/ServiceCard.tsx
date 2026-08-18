import type { ServiceContent } from "@/data/services";

/**
 * Solo informativa, non un link: non c'è (ancora) una pagina di dettaglio
 * dietro ogni servizio, e tutto quello che il sito sa (dove si svolge, per
 * quali animali, descrizione) è già scritto qui per intero — un "Scopri di
 * più" avrebbe portato solo a se stesso (era un'ancora #servizi-{slug} che
 * puntava alla card stessa, vedi ServicesGrid.tsx). Gli anchor da Header/
 * MobileNavDrawer verso #servizi-{slug} restano validi: scorrono qui da
 * un'altra parte della pagina, un caso diverso dal self-link rimosso. */
export function ServiceCard({ service }: { service: ServiceContent }) {
  const Icon = service.icon;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-soft">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft">
        <Icon size={24} strokeWidth={2} className="text-accent" />
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-display font-bold text-ink">{service.label}</h3>
        <p className="text-sm text-ink-faint">
          {service.where} · {service.forAnimals}
        </p>
      </div>

      <p className="text-sm text-ink-muted">{service.description}</p>
    </div>
  );
}
