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
 * ============================================================================ */

(function (global) {
  'use strict';

  const RENDER_CAP = 300;

  // sortedAll: array già filtrato e ordinato, pronto per il .map() che
  // genera le righe della tabella — invariato se sotto il limite.
  function capForRender(sortedAll) {
    if (sortedAll.length <= RENDER_CAP) return { shown: sortedAll, hidden: 0 };
    return { shown: sortedAll.slice(0, RENDER_CAP), hidden: sortedAll.length - RENDER_CAP };
  }

  function capNoticeHtml(hidden) {
    if (!hidden) return '';
    const totale = hidden + RENDER_CAP;
    return `<p class="list-cap-notice">Mostrate le prime ${RENDER_CAP} righe su ${totale} risultati — affina la ricerca o i filtri per vedere le altre.</p>`;
  }

  global.SaasListCap = { RENDER_CAP, capForRender, capNoticeHtml };
})(window);
