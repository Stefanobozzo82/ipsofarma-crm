import { HeartHandshake, ShieldCheck, Headset } from "lucide-react";
import { Button } from "@/components/ui/Button";

const points = [
  {
    icon: ShieldCheck,
    title: "Sitter verificati",
    description: "Ogni candidatura viene esaminata a mano dal nostro team prima di comparire in ricerca.",
  },
  {
    icon: HeartHandshake,
    title: "Garanzia e assicurazione",
    description: "Stiamo lavorando a una copertura dedicata per ogni prenotazione — i dettagli arriveranno presto qui.",
  },
  {
    icon: Headset,
    title: "Assistenza clienti dedicata",
    description: "Il nostro team è raggiungibile in chat prima, durante e dopo ogni prenotazione.",
  },
];

function TrustIllustration() {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-lg overflow-hidden rounded-3xl bg-gradient-to-br from-success-soft to-accent-soft">
      <div className="absolute inset-0 flex items-center justify-center">
        <ShieldCheck size={120} strokeWidth={1.5} className="text-success/60" />
      </div>
    </div>
  );
}

export function TrustSection() {
  return (
    <section className="bg-bg">
      <div className="mx-auto grid max-w-content items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div className="flex flex-col gap-8">
          <h2 className="text-3xl font-extrabold text-ink sm:text-4xl">Perché scegliere Fido</h2>

          <ul className="flex flex-col gap-6">
            {points.map((point) => {
              const Icon = point.icon;
              return (
                <li key={point.title} className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
                    <Icon size={22} className="text-accent" strokeWidth={2} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-display font-bold text-ink">{point.title}</h3>
                    <p className="text-sm text-ink-muted">{point.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div>
            <Button href="#hero-search" variant="primary">
              Trova un sitter vicino a te
            </Button>
          </div>
        </div>

        <TrustIllustration />
      </div>
    </section>
  );
}
