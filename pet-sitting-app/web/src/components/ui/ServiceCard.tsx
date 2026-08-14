import { ArrowRight } from "lucide-react";
import type { ServiceContent } from "@/data/services";

export function ServiceCard({ service }: { service: ServiceContent }) {
  const Icon = service.icon;

  return (
    <a
      href={`#servizi-${service.slug}`}
      className="group flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-soft transition hover:-translate-y-1 hover:shadow-lifted"
    >
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

      <span className="mt-auto inline-flex items-center gap-1 text-sm font-display font-bold text-accent">
        Scopri di più
        <ArrowRight size={15} className="transition group-hover:translate-x-1" />
      </span>
    </a>
  );
}
