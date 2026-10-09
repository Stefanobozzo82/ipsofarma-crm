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
  // Preferenza: 'light', 'dark' o 'auto' (nessuna scelta salvata = come il
  // telefono/computer, prefers-color-scheme). get() dà il tema in uso.
  var mq = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function pref() {
    try { var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : 'auto'; }
    catch (e) { return 'auto'; }
  }

  function get() {
    var p = pref();
    if (p !== 'auto') return p;
    return mq && mq.matches ? 'dark' : 'light';
  }

  function apply(theme) {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }

  function changed() {
    apply(get());
    global.dispatchEvent(new CustomEvent('saas-theme-change', { detail: { theme: get() } }));
  }

  function set(p) {
    p = p === 'dark' || p === 'light' ? p : 'auto';
    try {
      if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p);
    } catch (e) { /* privato/pieno: il tema resta solo per questa visita */ }
    changed();
  }

  // In automatico si segue il telefono anche mentre la pagina è aperta
  // (es. passaggio al tema scuro la sera).
  if (mq) {
    var onSystem = function () { if (pref() === 'auto') changed(); };
    if (mq.addEventListener) mq.addEventListener('change', onSystem); else if (mq.addListener) mq.addListener(onSystem);
  }

  apply(get()); // idempotente: lo snippet anti-lampo in <head> l'ha già applicato
  global.SaasTheme = { get: get, set: set, pref: pref };
})(window);
