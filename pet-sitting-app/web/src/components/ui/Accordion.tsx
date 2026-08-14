import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { FaqItem } from "@/data/faq";

/** Un accordion "single open" (ne apre uno alla volta) è più leggibile su
 * una pagina con 8 domande di uno che le lascia tutte aperte insieme —
 * altezza animata via grid-template-rows, l'unico modo per animare in CSS
 * puro un'altezza che dipende dal contenuto (height:auto non è animabile). */
export function Accordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.question}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="font-display font-bold text-ink">{item.question}</span>
              <ChevronDown
                size={20}
                className={`shrink-0 text-ink-faint transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-200 ease-out"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-4 text-sm text-ink-muted">{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
