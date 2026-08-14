import { services } from "@/data/services";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ServiceCard } from "@/components/ui/ServiceCard";

export function ServicesGrid() {
  return (
    <section id="servizi" className="bg-surface-muted/40">
      <div className="mx-auto flex max-w-content flex-col gap-10 px-6 py-16 lg:py-24">
        <SectionHeading
          eyebrow="I nostri servizi"
          title="Un servizio per ogni esigenza"
          subtitle="Dalla passeggiata quotidiana al soggiorno di più giorni, scegli quello più adatto a te e al tuo animale."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <div key={service.id} id={`servizi-${service.slug}`} className="scroll-mt-24">
              <ServiceCard service={service} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
