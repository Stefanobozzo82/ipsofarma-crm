import { Quote } from "lucide-react";
import { testimonials } from "@/data/testimonials";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function Testimonials() {
  return (
    <section className="bg-surface-muted/40">
      <div className="mx-auto flex max-w-content flex-col gap-10 px-6 py-16 lg:py-24">
        <SectionHeading title="Cosa dicono di noi" />

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <figure
              key={testimonial.name}
              className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-soft"
            >
              <Quote size={28} className="text-accent-soft" fill="currentColor" strokeWidth={0} />
              <blockquote className="flex-1 text-ink-muted">"{testimonial.quote}"</blockquote>
              <figcaption>
                <p className="font-display font-bold text-ink">{testimonial.name}</p>
                <p className="text-sm text-ink-faint">{testimonial.context}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
