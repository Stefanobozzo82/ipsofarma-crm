import { CreditCard, HeartHandshake, Search } from "lucide-react";
import { SectionHeading } from "@/components/ui/SectionHeading";

const steps = [
  {
    icon: Search,
    title: "Cerca e confronta",
    description: "Filtra per servizio e zona, confronta profili, prezzi e recensioni dei sitter vicino a te.",
  },
  {
    icon: HeartHandshake,
    title: "Fai un incontro conoscitivo",
    description: "Richiedi un Meet & Greet gratuito prima di prenotare, per conoscere il sitter senza impegno.",
  },
  {
    icon: CreditCard,
    title: "Prenota e paga in sicurezza",
    description: "Conferma la prenotazione e paga in app: il sitter riceve l'accredito solo dopo la conferma.",
  },
];

export function HowItWorks() {
  return (
    <section className="bg-bg">
      <div className="mx-auto flex max-w-content flex-col gap-12 px-6 py-16 lg:py-24">
        <SectionHeading eyebrow="Come funziona" title="Prenotare un sitter in 3 passaggi" />

        <div className="grid gap-10 sm:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="flex flex-col items-center gap-4 text-center">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft">
                  <Icon size={28} className="text-accent" strokeWidth={2} />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-display font-bold text-accent-ink">
                    {index + 1}
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold text-ink">{step.title}</h3>
                <p className="max-w-xs text-sm text-ink-muted">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
