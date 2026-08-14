import type { MouseEvent } from "react";

/**
 * Per i link che non hanno ancora una destinazione reale (pagine non
 * costruite: "Diventa un sitter", "Contatti", "Accedi", social nel footer,
 * colonne legali…) — senza questo, un `<a href="#">` fa comunque scrollare
 * la pagina in cima al click, un comportamento involontario e confuso
 * anche per un link primario come "Registrati ora". `href="#"` resta per
 * restare un elemento `<a>` semantico/navigabile da tastiera; il
 * preventDefault toglie solo l'effetto collaterale dello scroll.
 */
export function preventPlaceholderNav(event: MouseEvent) {
  event.preventDefault();
}
