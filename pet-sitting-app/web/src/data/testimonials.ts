/** Citazioni placeholder — da sostituire con recensioni reali quando ci
 * saranno (idealmente collegate a shared/src/types/review.ts via backend,
 * non testo statico come oggi). */
export interface Testimonial {
  quote: string;
  name: string;
  context: string;
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "Ho trovato una sitter per il mio cane in meno di un giorno. Ci ha mandato foto e aggiornamenti per tutta la passeggiata, mi sono sentita tranquilla dal primo minuto.",
    name: "Giulia R.",
    context: "Proprietaria di Nina, meticcia",
  },
  {
    quote:
      "Dovevo partire da un giorno all'altro e non sapevo a chi lasciare i miei gatti. Ho prenotato le visite a domicilio ed è andato tutto benissimo.",
    name: "Marco T.",
    context: "Proprietario di Miao e Birba, gatti",
  },
  {
    quote:
      "Il Meet & Greet prima di prenotare mi ha fatto capire subito se mi fidavo. Ora il nostro sitter è diventato di famiglia.",
    name: "Elena B.",
    context: "Proprietaria di Leo, labrador",
  },
];
