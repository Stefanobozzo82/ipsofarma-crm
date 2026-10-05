/* ============================================================================
 * list-cap.js — limita il numero di righe DISEGNATE in una tabella elenco,
 * senza toccare i dati caricati né le azioni di massa.
 *
 * Perché serve ora: prima dell'import dello storico Maestro Gold, ogni
 * elenco (fatture, DDT, ordini fornitore...) aveva al più poche centinaia di
 * righe. Con lo storico, fatture_cliente/ddt/ordini_fornitore sono arrivate
 * a migliaia di righe per azienda — e ogni renderResults() ricostruisce
 * l'INTERA tabella (stringa HTML + querySelectorAll().forEach per gli
 * event listener) ad ogni tasto premuto nella ricerca, ogni click su una
 * spunta, ogni cambio di ordinamento. Migliaia di <tr> ricreati di continuo
 * sono pesanti ovunque, ma si sentono di più nella WebView Android
 * dell'app (stesso motore di rendering, meno margine di CPU/RAM).
 *
 * L'elenco COMPLETO filtrato/ordinato resta quello vero per conteggi e
 * azioni di massa (query "seleziona tutti" o bottoni bulk): qui si taglia
 * solo l'array passato al .map() che genera le righe <tr> a video.
 *
 * Nessun documento resta nascosto: le prime 300 righe compaiono subito, le
 * altre si aggiungono da sole a blocchi di 300 quando si scorre vicino al
 * fondo dell'elenco, e "Mostra tutte" le disegna tutte in una volta. Il
 * numero di righe già mostrate resta finché si resta sulla pagina.
 * ============================================================================ */

(function (global) {
  'use strict';

  const RENDER_CAP = 300;
  let limit = RENDER_CAP;      // righe disegnate ora (cresce scorrendo)
  let rerender = null;         // renderResults() della pagina
  let observer = null;

  // sortedAll: array già filtrato e ordinato, pronto per il .map() che
  // genera le righe della tabella — invariato se sotto il limite.
  // onMore: la funzione della pagina che ridisegna l'elenco.
  function capForRender(sortedAll, onMore) {
    if (onMore) rerender = onMore;
    if (observer) { observer.disconnect(); observer = null; }
    if (sortedAll.length <= limit) return { shown: sortedAll, hidden: 0 };
    watchBottom();
    return { shown: sortedAll.slice(0, limit), hidden: sortedAll.length - limit };
  }

  function capNoticeHtml(hidden) {
    if (!hidden) return '';
    const totale = hidden + limit;
    return `<p class="list-cap-notice">Mostrate ${limit} righe su ${totale}: le altre compaiono scorrendo in fondo all'elenco. ` +
      `<button type="button" class="ghost list-cap-all" data-list-cap-all>Mostra tutte (${totale})</button></p>`;
  }

  function more(n) {
    limit = n;
    if (rerender) rerender();
  }

  // Dopo il disegno: quando l'ultima riga si avvicina allo schermo, si
  // aggiungono altre RENDER_CAP righe.
  function watchBottom() {
    if (typeof IntersectionObserver !== 'function') return;
    requestAnimationFrame(() => {
      const notice = document.querySelector('.list-cap-notice');
      const last = notice && notice.parentElement.querySelector('.elenco-table tbody tr:last-of-type');
      if (!last) return;
      observer = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        observer.disconnect(); observer = null;
        more(limit + RENDER_CAP);
      }, { rootMargin: '800px 0px' });
      observer.observe(last);
    });
  }

  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('[data-list-cap-all]')) more(Infinity);
  });

  global.SaasListCap = { RENDER_CAP, capForRender, capNoticeHtml };
})(window);
