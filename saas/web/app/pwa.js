/* ============================================================================
 * pwa.js — registra sw.js perché il browser offra "Installa app": manifest
 * (link rel="manifest") + service worker registrato sono i due requisiti di
 * Chrome/Edge per l'installabilità desktop, che è tutto quello che serve
 * qui — nessun caching offline, vedi il commento in cima a sw.js.
 *
 * Un file a sé (non dentro nav.js) perché serve anche su index.html, che
 * non carica nav.js (non ha ancora una sidebar/azienda scelta).
 *
 * sw.js sta in cima a saas/web/, non in app/: registrandolo da qui il suo
 * scope di default copre l'intera cartella (tutte le pagine), non solo
 * app/. Il percorso 'sw.js' qui sotto si risolve rispetto alla pagina che
 * include questo script (tutte in saas/web/), non rispetto a questo file.
 * ============================================================================ */

(function () {
  'use strict';
  if ('serviceWorker' in navigator) {
    // silenzioso di proposito: niente service worker (browser vecchio,
    // contesto non sicuro, ecc.) non deve mai bloccare il gestionale — è
    // solo un requisito per il pulsante "Installa", non una dipendenza.
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
