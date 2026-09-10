/* ============================================================================
 * scan-import.js — "🖨 Scansiona da PC", il lato browser dell'agente locale
 * (windows-agent/scan-agent.ps1). Richiesta reale: dopo aver provato la
 * fotocamera del telefono ("ho provato con la foto e fa qualche errore di
 * trascrizione perché la foto è troppo piccola"), l'utente ha chiesto un
 * programma da installare per scansionare col vero scanner collegato al PC
 * — più risoluzione, meno errori di lettura AI.
 *
 * Un sito web non può parlare direttamente con i driver di uno scanner
 * (TWAIN/WIA) — nessun sito lo può fare, è un limite deliberato dei
 * browser, non uno di questo gestionale. Da qui l'agente locale: un
 * piccolo server in ascolto SOLO su questo PC (http://localhost, mai
 * raggiungibile da fuori), che fa da ponte verso lo scanner tramite le
 * API Windows già incluse nel sistema (WIA) — non serve installare driver
 * o programmi aggiuntivi oltre all'agente stesso. A differenza
 * dell'agente di stampa (print-agent.ps1) non serve NESSUNA
 * configurazione — niente token da incollare: questo script fa solo da
 * ponte hardware, il resto (login, lettura AI, salvataggio) lo fa già il
 * browser con la sessione dell'utente collegato. Per questo lo stesso
 * identico file può essere distribuito a qualunque cliente del
 * gestionale, senza modificarlo — pensato per un prodotto venduto a più
 * aziende, non per un'installazione su misura.
 *
 * Aggiunto SOLO nel browser desktop (mai dentro l'app nativa — lì il
 * telefono stesso è già "lo scanner", vedi camera-import.js) e SOLO se la
 * pagina ha già il normale pulsante di import — nessuna pagina deve
 * aggiungerlo a mano, funziona per costruzione su ogni pagina con lo
 * stesso pattern id="ai-import-btn" / id="ai-import-file", come
 * camera-import.js.
 *
 * Una volta ricevuta l'immagine scansionata, invece di scrivere un
 * percorso di lettura a sé per ogni pagina, si simula la scelta manuale
 * di quel file sullo stesso <input> che la pagina già ascolta (evento
 * "change" via DataTransfer) — zero codice nuovo in ciascuna pagina,
 * stesso identico percorso di sempre (verifica catalogo, collegamento
 * automatico all'ordine, tutto).
 * ============================================================================ */

(function (global) {
  'use strict';

  // Deve combaciare con $PORT in windows-agent/scan-agent.ps1.
  const AGENT_ORIGIN = 'http://localhost:18245';

  function isNative() {
    return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
  }

  // Controllo rapido "l'agente è avviato?" prima di lanciarsi in una vera
  // scansione — timeout breve apposta: se non risponde quasi subito, è
  // quasi certamente spento/non installato, non ha senso aspettare oltre.
  async function ping(timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(AGENT_ORIGIN + '/ping', { signal: ctrl.signal });
      return res.ok;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  // Nessun timeout stretto qui: la finestra di scansione nativa di
  // Windows resta aperta finché l'utente non posiziona il foglio e
  // conferma — può richiedere anche minuti, non è un'attesa di rete
  // normale. Il limite serve solo da rete di sicurezza contro una
  // richiesta davvero bloccata per sempre.
  async function requestScan() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5 * 60 * 1000);
    try {
      const res = await fetch(AGENT_ORIGIN + '/scan', { signal: ctrl.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || ('errore HTTP ' + res.status));
      }
      return await res.blob();
    } finally {
      clearTimeout(t);
    }
  }

  function setup() {
    if (isNative()) return; // sul telefono lo "scanner" è già la fotocamera, vedi camera-import.js
    const btn = document.getElementById('ai-import-btn');
    const input = document.getElementById('ai-import-file');
    const statusEl = document.getElementById('ai-import-status');
    if (!btn || !input || document.getElementById('ai-import-scan-btn')) return;

    const scanBtn = document.createElement('button');
    scanBtn.type = 'button';
    scanBtn.className = 'ghost';
    scanBtn.id = 'ai-import-scan-btn';
    scanBtn.textContent = '🖨 Scansiona da PC';
    btn.insertAdjacentElement('afterend', scanBtn);

    // Stesso paragrafo di stato già usato dalla pagina per l'esito
    // dell'import (aiImportStatus() lì) — qui solo per i messaggi PRIMA
    // che il file sia pronto: appena si simula la scelta del file più
    // sotto, è la pagina stessa a riprendersi la proprietà del messaggio
    // coi propri esiti (fornitore riconosciuto, righe da verificare...).
    function setStatus(text, kind) {
      if (!statusEl) return;
      if (!text) { statusEl.hidden = true; return; }
      statusEl.textContent = text; statusEl.className = 'msg ' + (kind || 'info'); statusEl.hidden = false;
    }

    scanBtn.addEventListener('click', async () => {
      scanBtn.disabled = true;
      setStatus('Verifico il programma di scansione sul PC…', 'info');
      const online = await ping(1500);
      if (!online) {
        setStatus('Programma di scansione non trovato sul PC: installalo e avvialo (vedi saas/README.md — "DDT: scansione da PC con lo scanner"), poi riprova.', 'error');
        scanBtn.disabled = false;
        return;
      }
      setStatus('Scansione in corso — segui le indicazioni nella finestra dello scanner…', 'info');
      try {
        const blob = await requestScan();
        // Un File vero, non solo il Blob: le pagine leggono già file.name/
        // file.type per riconoscere PDF/immagini — qui è sempre
        // un'immagine, ma resta indistinguibile da un file scelto a mano.
        const file = new File([blob], 'scansione-' + Date.now() + '.png', { type: blob.type || 'image/png' });
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        setStatus('Scansione non riuscita: ' + (err.message || err), 'error');
      } finally {
        scanBtn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})(window);
