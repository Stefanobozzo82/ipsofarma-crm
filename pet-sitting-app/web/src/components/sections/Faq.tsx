import { faqItems } from "@/data/faq";
import { Accordion } from "@/components/ui/Accordion";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function Faq() {
  return (
    <section className="bg-surface-muted/40">
      <div className="mx-auto flex max-w-content flex-col gap-10 px-6 py-16 lg:py-24">
        <SectionHeading title="Domande frequenti" align="center" />
        <div className="mx-auto w-full max-w-2xl">
          <Accordion items={faqItems} />
        </div>
      </div>
    </section>
  );
}
