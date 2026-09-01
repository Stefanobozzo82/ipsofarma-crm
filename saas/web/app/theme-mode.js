/* ============================================================================
 * theme-mode.js — tema chiaro/scuro scelto dall'utente, applicato a TUTTO
 * (sidebar inclusa) tramite l'attributo data-theme sull'elemento <html> —
 * vedi le variabili --* ridefinite sotto :root[data-theme="dark"] in
 * app/theme.css. La scelta si salva in localStorage: è una preferenza per
 * questo dispositivo/browser, non un dato dell'azienda (due persone della
 * stessa azienda possono scegliere temi diversi, ognuno sul proprio schermo).
 *
 * L'applicazione VERA e propria (prima del primo disegno della pagina, per
 * evitare un lampo del tema sbagliato) avviene con un piccolo script inline
 * in testa a ogni pagina, PRIMA del foglio di stile — questo file arriva
 * dopo (con gli altri app/*.js) e serve solo a chi deve LEGGERE o CAMBIARE
 * il tema durante l'uso: la pagina Impostazioni (il selettore) e la
 * dashboard (che deve ridisegnare il grafico SVG, i cui colori sono letti
 * dalle variabili CSS al momento del disegno, non ereditati come farebbe
 * un elemento HTML normale).
 * ============================================================================ */

(function (global) {
  'use strict';

  var KEY = 'saas_theme';

  function get() {
    try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; }
    catch (e) { return 'light'; }
  }

  function apply(theme) {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }

  function set(theme) {
    theme = theme === 'dark' ? 'dark' : 'light';
    try { localStorage.setItem(KEY, theme); } catch (e) { /* privato/pieno: il tema resta solo per questa visita */ }
    apply(theme);
    global.dispatchEvent(new CustomEvent('saas-theme-change', { detail: { theme: theme } }));
  }

  apply(get()); // idempotente: lo snippet anti-lampo in <head> l'ha già applicato
  global.SaasTheme = { get: get, set: set };
})(window);
