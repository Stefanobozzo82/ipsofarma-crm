/* ============================================================================
 * biometric-lock.js — Fase 3 del piano app: blocco dell'app con impronta o
 * volto, come nelle app bancarie o di fatturazione (vedi la nota strategica
 * "Da PWA ad app vera" e saas/README.md).
 *
 * Non sostituisce il login: la sessione Supabase resta quella di sempre
 * (persistita in automatico, l'utente NON deve ridigitare la password ogni
 * volta che riapre l'app). Quello che manca senza questo file è un secondo
 * livello: se qualcuno prende in mano un telefono già sbloccato dal
 * proprietario, vede subito fatturato, clienti, tutto — un vero rischio per
 * un'azienda. Qui l'app, quando torna in primo piano dopo essere rimasta in
 * background per un po', chiede di sbloccarla di nuovo con l'impronta.
 *
 * Preferenza LOCALE al dispositivo (localStorage, mai sincronizzata su
 * Supabase — vedi attachToggle più sotto): un blocco con l'impronta ha
 * senso per-telefono, non per-azienda.
 *
 * PERIODO DI GRAZIA (GRACE_MS): l'app va in background anche solo per
 * aprire la fotocamera o il selettore file (es. "📎 Importa da PDF/foto",
 * vedi camera-import.js) — un salto del genere, di pochi secondi, NON deve
 * far ripartire il blocco ad ogni ritorno, altrimenti l'impronta verrebbe
 * chiesta continuamente durante l'uso normale. Si blocca solo se il tempo
 * fuori dall'app supera la soglia: un abbandono vero (tasca, un'altra app),
 * non un rimbalzo veloce.
 * ============================================================================ */

(function (global) {
  'use strict';

  const LS_ENABLED = 'saas_biometric_enabled';
  const LS_LOCKED = 'saas_biometric_locked';
  const LS_LAST_SEEN = 'saas_biometric_last_seen';
  const GRACE_MS = 30000;

  function nativeBio() {
    return (global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform() && global.Capacitor.Plugins)
      ? global.Capacitor.Plugins.BiometricAuthNative : null;
  }
  function nativeApp() {
    return (global.Capacitor && global.Capacitor.Plugins) ? global.Capacitor.Plugins.App : null;
  }

  function isEnabled() { return localStorage.getItem(LS_ENABLED) === '1'; }
  function setEnabled(v) {
    localStorage.setItem(LS_ENABLED, v ? '1' : '0');
    if (!v) localStorage.setItem(LS_LOCKED, '0');
  }
  function markSeenNow() { localStorage.setItem(LS_LAST_SEEN, String(Date.now())); }

  // Se è passato più del periodo di grazia dall'ultima volta che l'app era
  // sicuramente in primo piano, la marca da sbloccare — non blocca subito
  // (vedi maybeShowLock, chiamata subito dopo da chi usa questa funzione).
  function checkGrace() {
    if (!isEnabled()) return;
    const last = Number(localStorage.getItem(LS_LAST_SEEN) || 0);
    const elapsed = last ? Date.now() - last : Infinity; // mai vista prima in questo dispositivo -> tratta come assenza lunga
    if (elapsed > GRACE_MS) localStorage.setItem(LS_LOCKED, '1');
  }

  // --- overlay di blocco -------------------------------------------------
  function ensureOverlay() {
    let ov = document.getElementById('bio-lock-overlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'bio-lock-overlay';
    ov.hidden = true;
    ov.innerHTML = `
      <div class="bio-lock-box">
        <div class="bio-lock-ic">🔒</div>
        <p>Ipsofarma CRM è bloccata per sicurezza.</p>
        <button type="button" class="primary" id="bio-lock-btn">Sblocca</button>
        <button type="button" class="linklike" id="bio-lock-logout">Esci e accedi di nuovo</button>
        <p class="msg" id="bio-lock-msg" hidden></p>
      </div>`;
    document.body.appendChild(ov);
    document.getElementById('bio-lock-btn').addEventListener('click', attempt);
    document.getElementById('bio-lock-logout').addEventListener('click', async () => {
      try { if (global.SaasStore) await global.SaasStore.signOut(); } catch (e) { /* si esce comunque dal dispositivo, vedi sotto */ }
      localStorage.removeItem('saas_company_id');
      localStorage.removeItem('saas_company_nome');
      localStorage.setItem(LS_LOCKED, '0');
      location.href = 'index.html';
    });
    return ov;
  }

  function setMsg(text) {
    const m = document.getElementById('bio-lock-msg');
    if (m) { m.textContent = text || ''; m.className = 'msg' + (text ? ' error' : ''); m.hidden = !text; }
  }

  async function attempt() {
    const bio = nativeBio();
    if (!bio) return;
    setMsg('');
    try {
      // internalAuthenticate: nome nativo reale del plugin (registrato come
      // "BiometricAuthNative", vedi @CapacitorPlugin nel sorgente Android) —
      // il metodo "authenticate()" descritto nella documentazione del
      // pacchetto esiste solo nel suo bundle JS compilato, mai caricato qui
      // perché la pagina è servita da saas/web (server.url), non dal
      // bundle dell'app nativa. Il bridge di Capacitor espone comunque
      // direttamente ogni plugin registrato lato nativo, senza bisogno di
      // quel bundle: chiamare qui il metodo nativo vero funziona lo stesso.
      // allowDeviceCredential: chi non ha l'impronta impostata ma HA un
      // PIN/pattern del telefono può comunque sbloccare così — mai un
      // vicolo cieco.
      await bio.internalAuthenticate({
        reason: 'Sblocca Ipsofarma CRM',
        cancelTitle: 'Annulla',
        allowDeviceCredential: true,
        androidTitle: 'Sblocca Ipsofarma CRM',
        androidConfirmationRequired: false,
      });
      localStorage.setItem(LS_LOCKED, '0');
      const ov = document.getElementById('bio-lock-overlay');
      if (ov) ov.hidden = true;
    } catch (e) {
      setMsg('Sblocco non riuscito: tocca "Sblocca" per riprovare, oppure esci e accedi di nuovo.');
    }
  }

  function maybeShowLock() {
    if (!isEnabled()) return;
    if (!nativeBio()) return;
    if (!localStorage.getItem('saas_company_id')) return; // non loggato: niente da proteggere
    if (localStorage.getItem(LS_LOCKED) !== '1') return;
    ensureOverlay().hidden = false;
    setMsg('');
    attempt();
  }

  // --- interruttore nella sidebar (account) ------------------------------
  // Chiamata da nav.js dopo aver ricostruito .account-links (stesso
  // aggancio già usato per SaasTour, vedi render() in nav.js) — se questo
  // file non è incluso in una pagina semplicemente non succede nulla,
  // come per il tour.
  async function attachToggle() {
    const bio = nativeBio();
    const box = document.querySelector('.account-links');
    if (!bio || !box || document.getElementById('bio-toggle-btn')) return;
    let info;
    try { info = await bio.checkBiometry(); } catch (e) { return; }
    // Niente impronta/volto configurati E nessun PIN/pattern sul telefono:
    // non c'è nulla che il blocco possa davvero usare, meglio non offrire
    // un interruttore che lascerebbe fuori l'utente al primo tentativo.
    if (!info || (!info.isAvailable && !info.deviceIsSecure)) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'bio-toggle-btn';
    btn.textContent = isEnabled() ? '🔒 Blocco impronta: attivo' : '🔓 Blocco impronta: disattivo';
    box.appendChild(btn);
    btn.addEventListener('click', async () => {
      if (isEnabled()) {
        setEnabled(false);
        btn.textContent = '🔓 Blocco impronta: disattivo';
        return;
      }
      // Si attiva solo DOPO un'autenticazione riuscita: mai un interruttore
      // che si crede attivo senza aver mai verificato che l'impronta
      // dell'utente funzioni davvero su questo telefono.
      try {
        await bio.internalAuthenticate({
          reason: 'Conferma per attivare il blocco con impronta',
          cancelTitle: 'Annulla',
          allowDeviceCredential: true,
          androidTitle: 'Conferma',
        });
        setEnabled(true);
        markSeenNow();
        btn.textContent = '🔒 Blocco impronta: attivo';
      } catch (e) { /* annullato o fallito: resta disattivo, nessun messaggio d'errore per un'azione facoltativa */ }
    });
  }

  function boot() {
    checkGrace();
    maybeShowLock();
    markSeenNow();
    const app = nativeApp();
    if (app && app.addListener) {
      app.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          checkGrace();
          maybeShowLock();
          markSeenNow();
        } else {
          markSeenNow(); // congela il cronometro qui: il periodo di grazia si misura da questo istante
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.SaasBiometric = { isEnabled, setEnabled, attachToggle };
})(window);
