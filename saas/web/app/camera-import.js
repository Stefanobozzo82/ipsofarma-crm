/* ============================================================================
 * camera-import.js — Fase 3 del piano app (fotocamera per l'import IA, vedi
 * la nota strategica "Da PWA ad app vera" e saas/README.md).
 *
 * Il pulsante "📎 Importa da PDF/foto (AI)" (ordini.html, ordini-fornitore,
 * fatture-fornitore, note-credito-fornitore) è un normalissimo <input
 * type="file" accept="application/pdf,image/*">: in un browser mobile
 * (Chrome/Safari) toccarlo apre già un selettore che include la fotocamera
 * tra le opzioni, quindi lì non serve cambiare nulla. Dentro l'app nativa
 * (WebView di Capacitor) NON è così: la fotocamera compare nel selettore
 * solo se l'<input> ha l'attributo "capture" (vedi il sorgente di Capacitor,
 * BridgeWebChromeClient.java — onShowFileChooser controlla proprio quello),
 * altrimenti si vede solo "File/Galleria". Da qui un secondo pulsante,
 * "📷 Fotocamera", aggiunto SOLO dentro l'app (mai nel browser, dove
 * sarebbe ridondante) e SOLO se la pagina ha già il normale pulsante di
 * import — nessuna pagina deve aggiungerlo a mano, funziona per costruzione
 * anche su una futura pagina con lo stesso pattern id="ai-import-btn" /
 * id="ai-import-file".
 * ============================================================================ */

(function (global) {
  'use strict';

  function isNative() {
    return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
  }

  function setup() {
    if (!isNative()) return;
    const btn = document.getElementById('ai-import-btn');
    const input = document.getElementById('ai-import-file');
    if (!btn || !input || document.getElementById('ai-import-camera-btn')) return;

    const camBtn = document.createElement('button');
    camBtn.type = 'button';
    camBtn.className = 'ghost';
    camBtn.id = 'ai-import-camera-btn';
    camBtn.textContent = '📷 Fotocamera';
    btn.insertAdjacentElement('afterend', camBtn);

    camBtn.addEventListener('click', () => {
      input.setAttribute('capture', 'environment');
      input.click();
    });
    // L'attributo va tolto appena possibile, non lasciato lì: un clic
    // successivo sul pulsante NORMALE deve tornare a offrire anche
    // "Galleria/File", non restare agganciato alla fotocamera. Rimosso sia
    // sul cambio (foto scattata) sia, in fase di cattura (prima ancora del
    // listener della pagina che apre il selettore), quando si clicca il
    // pulsante normale — copre anche il caso in cui l'utente annulla la
    // fotocamera senza scattare, dove "change" potrebbe non scattare mai.
    input.addEventListener('change', () => { input.removeAttribute('capture'); });
    btn.addEventListener('click', () => { input.removeAttribute('capture'); }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})(window);
