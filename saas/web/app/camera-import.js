/* ============================================================================
 * camera-import.js — Fase 3 del piano app (fotocamera per l'import IA, vedi
 * la nota strategica "Da PWA ad app vera" e saas/README.md).
 *
 * Il pulsante "Importa" (menu — vedi app/import-menu.js) apre un <input
 * type="file" accept="application/pdf,image/*">: in un browser mobile
 * (Chrome/Safari) toccarlo apre già un selettore che include la fotocamera
 * tra le opzioni, quindi lì non serve cambiare nulla. Dentro l'app nativa
 * (WebView di Capacitor) NON è così: la fotocamera compare nel selettore
 * solo se l'<input> ha l'attributo "capture" (vedi il sorgente di Capacitor,
 * BridgeWebChromeClient.java — onShowFileChooser controlla proprio quello),
 * altrimenti si vede solo "File/Galleria". Da qui una voce in più nel menu
 * "Importa", "📷 Fotocamera", aggiunta SOLO dentro l'app (mai nel browser,
 * dove sarebbe ridondante) e SOLO se la pagina ha già il menu import —
 * nessuna pagina deve aggiungerla a mano, funziona per costruzione anche su
 * una futura pagina con lo stesso pattern id="ai-import-btn"/
 * id="ai-import-file".
 * ============================================================================ */

(function (global) {
  'use strict';

  function isNative() {
    return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
  }

  function setup() {
    if (!isNative()) return;
    const input = document.getElementById('ai-import-file');
    if (!global.SaasImportMenu || !input || document.getElementById('ai-import-camera-opt')) return;

    global.SaasImportMenu.addImportOption('📷 Fotocamera', () => {
      input.setAttribute('capture', 'environment');
      input.click();
    }, 'ai-import-camera-opt');

    // L'attributo va tolto appena possibile, non lasciato lì — copre il
    // caso in cui l'utente annulla la fotocamera senza scattare: la voce
    // "📄 Da file" del menu lo toglie comunque prima di aprire l'input (vedi
    // import-menu.js), questo qui serve solo per il cambio (foto scattata).
    input.addEventListener('change', () => { input.removeAttribute('capture'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})(window);
