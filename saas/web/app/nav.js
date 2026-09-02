/* ============================================================================
 * nav.js — la barra laterale condivisa da tutte le pagine del gestionale.
 *
 * Prima, ogni pagina portava l'HTML dei link di navigazione scritto a mano
 * (11 voci): aggiungere una pagina significava editare tutte le altre nove
 * per aggiungere il link, a mano, con margine reale di dimenticarsene una
 * (è già successo, prima di questo file). Qui la lista vive una volta sola.
 * ============================================================================ */

(function (global) {
  'use strict';

  // Stessa idea della sidebar del gestionale Ipsofarma (index.html): icona +
  // etichetta per voce, raggruppate per significato. Le icone qui ricalcano
  // apposta quelle già usate là dove il modulo è lo stesso (es. 🏥 clienti,
  // 🚚 DDT), così chi già conosce il gestionale originale si orienta subito.
  const GROUPS = [
    { label: null, items: [
      { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html', ic: '◫' },
      { id: 'scadenziario', label: 'Scadenziario', href: 'scadenziario.html', ic: '📅' },
      { id: 'riconciliazione', label: 'Riconciliazione bancaria', href: 'riconciliazione.html', ic: '🏦' },
      { id: 'report', label: 'Report & Analisi', href: 'report.html', ic: '📊' },
      { id: 'assistente-ai', label: 'Assistente AI', href: 'assistente-ai.html', ic: '🤖' },
    ] },
    { label: 'Clienti', items: [
      { id: 'clienti', label: 'Clienti', href: 'clienti.html', ic: '🏥' },
      { id: 'preventivi', label: 'Preventivi', href: 'preventivi.html', ic: '📝' },
      { id: 'ordini', label: 'Ordini', href: 'ordini.html', ic: '🛒' },
      { id: 'ddt', label: 'DDT', href: 'ddt.html', ic: '🚚' },
      { id: 'fatture', label: 'Fatture', href: 'fatture.html', ic: '🧾' },
      { id: 'note-credito', label: 'Note di credito', href: 'note-credito.html', ic: '↩' },
      { id: 'incassi', label: 'Incassi', href: 'incassi.html', ic: '💶' },
    ] },
    { label: 'Fornitori', items: [
      { id: 'fornitori', label: 'Fornitori', href: 'fornitori.html', ic: '🏢' },
      { id: 'ordini-fornitore', label: 'Ordini', href: 'ordini-fornitore.html', ic: '📦' },
      { id: 'fatture-fornitore', label: 'Fatture', href: 'fatture-fornitore.html', ic: '📑' },
      { id: 'note-credito-fornitore', label: 'Note di credito', href: 'note-credito-fornitore.html', ic: '↩' },
      { id: 'pagamenti', label: 'Pagamenti', href: 'pagamenti.html', ic: '💳' },
    ] },
    { label: 'Catalogo', items: [
      { id: 'prodotti', label: 'Prodotti', href: 'prodotti.html', ic: '⊞' },
      { id: 'magazzino', label: 'Magazzino', href: 'magazzino.html', ic: '🏬' },
    ] },
    { label: 'Azienda', items: [
      { id: 'impostazioni-azienda', label: 'Impostazioni', href: 'impostazioni-azienda.html', ic: '⚙' },
      { id: 'abbonamento', label: 'Abbonamento', href: 'abbonamento.html', ic: '🔁' },
    ] },
  ];

  // Barra in basso, solo sotto gli 860px (telefono): le 4 destinazioni più
  // frequenti per chi controlla l'azienda "in movimento" (vedi la nota
  // strategica sull'app — Fase 2), raggiungibili con un tocco del
  // pollice senza dover aprire il cassetto laterale. "Altro" apre lo
  // stesso cassetto di sempre per tutto il resto (Clienti, Fornitori,
  // Magazzino, Scadenziario...) — sostituisce il vecchio pulsante ☰ in
  // cima alla pagina, che serviva solo a quello. Assistente AI al posto
  // di Scadenziario su richiesta esplicita, per averlo a un tocco anche
  // dall'app installata sul telefono.
  const BOTTOM_ITEMS = [
    { id: 'dashboard', label: 'Home', href: 'dashboard.html', ic: '◫' },
    { id: 'ordini', label: 'Ordini', href: 'ordini.html', ic: '🛒' },
    { id: 'fatture', label: 'Fatture', href: 'fatture.html', ic: '🧾' },
    { id: 'assistente-ai', label: 'Assistente', href: 'assistente-ai.html', ic: '🤖' },
  ];

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // currentId: quale voce evidenziare. opts: { companyName, email, onLogout }.
  function render(currentId, opts) {
    opts = opts || {};
    const el = document.getElementById('sidebar');
    if (!el) return;

    const groupsHtml = GROUPS.map(g => `
      <div class="navgroup">
        ${g.label ? `<p class="label">${esc(g.label)}</p>` : ''}
        ${g.items.map(it => `<a class="navlink ${it.id === currentId ? 'on' : ''}" href="${it.href}"><span class="ic">${it.ic}</span>${esc(it.label)}</a>`).join('')}
      </div>
    `).join('');

    const nome = opts.companyName || 'Azienda';
    el.innerHTML = `
      <div class="brand">
        <div class="mark">${esc(nome.charAt(0).toUpperCase() || 'A')}</div>
        <div class="nm">${esc(nome)}<small>Gestionale</small></div>
      </div>
      <nav>${groupsHtml}</nav>
      <div class="account">
        <p class="email">${esc(opts.email || '')}</p>
        <div class="account-links">
          <a href="index.html">Cambia azienda</a>
          <button id="nav-logout" type="button">Esci</button>
          <button id="nav-tour" type="button">🎓 Rifai il tour</button>
        </div>
      </div>
    `;

    const logoutBtn = document.getElementById('nav-logout');
    if (logoutBtn && opts.onLogout) {
      logoutBtn.addEventListener('click', () => { opts.onLogout(); });
    }
    const tourBtn = document.getElementById('nav-tour');
    if (tourBtn) {
      tourBtn.addEventListener('click', () => { if (global.SaasTour) global.SaasTour.start(); });
    }
    // Interruttore del blocco con impronta (app/biometric-lock.js, Fase 3
    // del piano app) — stesso aggancio del tour: se il file non è incluso
    // in questa pagina, o si è nel browser invece che nell'app nativa,
    // semplicemente non compare nulla.
    if (global.SaasBiometric) global.SaasBiometric.attachToggle();

    ensureMobileBottombar(currentId);
    renderOverdueBadge();
    // Tour guidato al primo accesso (app/tour.js) — un solo punto di
    // innesco per tutte le pagine, invece di doverlo aggiungere all'init()
    // di ognuna. Se lo script non è incluso in questa pagina (non
    // dovrebbe succedere: va aggiunto ovunque c'è nav.js) semplicemente
    // non parte, senza errori.
    if (global.SaasTour) global.SaasTour.maybeStart();
  }

  // Il badge rosso sulla voce "Scadenziario" (quante fatture cliente sono
  // scadute e non incassate) — stessa idea di overdueCount() nel
  // gestionale originale, calcolata qui invece che in ogni singola pagina:
  // così tutte la mostrano senza che ognuna debba rifare la stessa query.
  // Asincrono e silenzioso di proposito: se fallisce (rete, azienda ancora
  // senza fatture...) la sidebar resta comunque utilizzabile, semplicemente
  // senza badge — non deve mai bloccare la navigazione.
  async function renderOverdueBadge() {
    try {
      const companyId = localStorage.getItem('saas_company_id');
      if (!companyId || !global.SaasStore) return;
      const [clienti, fatture] = await Promise.all([
        global.SaasStore.loadCollection('clienti', companyId),
        global.SaasStore.loadCollection('fattureCliente', companyId),
      ]);
      const clientiById = Object.fromEntries(clienti.map(c => [c.id, c]));
      const oggi = new Date().toISOString().slice(0, 10);
      const count = fatture.filter(f => {
        if (f.paid) return false;
        const cliente = clientiById[f.clienteId];
        const days = cliente && cliente.term != null && cliente.term !== '' ? parseInt(cliente.term) : 30;
        const d = new Date((f.data || oggi) + 'T00:00:00');
        d.setDate(d.getDate() + (isNaN(days) ? 30 : days));
        return d.toISOString().slice(0, 10) < oggi;
      }).length;
      if (count <= 0) return;
      const link = document.querySelector('.sidebar a.navlink[href="scadenziario.html"]');
      if (!link || link.querySelector('.overdue-badge')) return;
      const badge = document.createElement('span');
      badge.className = 'overdue-badge';
      badge.textContent = String(count);
      link.appendChild(badge);
    } catch (e) { /* silenzioso di proposito, vedi sopra */ }
  }

  // Sotto gli 860px il menu laterale esce dal flusso della pagina e resta
  // nascosto a sinistra (vedi theme.css: .sidebar diventa position:fixed,
  // translateX(-100%)) — un cassetto che scorre sopra il contenuto, non lo
  // sposta. Per aprirlo c'era un pulsante ☰ in cima alla pagina: sostituito
  // da una barra fissa in fondo allo schermo (Fase 2 del piano app — vedi
  // la nota strategica) con le 4 destinazioni più raggiunte al tocco del
  // pollice, più "Altro" che apre lo stesso cassetto di sempre per il
  // resto — stessa area del pollice dove il settore (banche, app di
  // fatturazione) mette da anni la navigazione principale su telefono,
  // invece che in cima dove serve allungare la mano. Creata una volta
  // sola, appesa a document.body (position:fixed non dipende da dove sta
  // nel DOM, e così evita qualunque contenitore che possa "intrappolarla").
  function ensureMobileBottombar(currentId) {
    let bar = document.getElementById('mobile-bottombar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'mobile-bottombar';
      bar.className = 'mobile-bottombar';
      document.body.appendChild(bar);
    }
    const isDirect = BOTTOM_ITEMS.some(it => it.id === currentId);
    bar.innerHTML = BOTTOM_ITEMS.map(it => `<a class="${it.id === currentId ? 'on' : ''}" href="${it.href}"><span class="ic">${it.ic}</span>${esc(it.label)}</a>`).join('')
      + `<button type="button" class="${isDirect ? '' : 'on'}" id="nav-more-btn"><span class="ic">☰</span>Altro</button>`;
    const moreBtn = document.getElementById('nav-more-btn');
    const sidebar = document.getElementById('sidebar');
    if (moreBtn && sidebar) {
      moreBtn.onclick = () => { sidebar.classList.toggle('open'); };
    }
  }

  global.SaasNav = { render };
})(window);
