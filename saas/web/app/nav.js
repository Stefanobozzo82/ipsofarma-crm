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
  // etichetta per voce, raggruppate per significato. Le icone (ICONS sopra)
  // ricalcano il soggetto di quelle dell'originale (clinica per i clienti,
  // camion per i DDT), così chi già lo conosce si orienta subito.
  // Icone a linea (24×24, tratto uguale per tutte), al posto delle emoji:
  // stesso disegno su ogni sistema operativo e colore che segue il tema.
  const ICONS = {
    'dashboard': '<rect x="3.5" y="3.5" width="7" height="9" rx="1"/><rect x="13.5" y="3.5" width="7" height="5" rx="1"/><rect x="13.5" y="11.5" width="7" height="9" rx="1"/><rect x="3.5" y="15.5" width="7" height="5" rx="1"/>',
    'calendar': '<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M8 13.5h2M14 13.5h2M8 17h2"/>',
    'bank': '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
    'chart': '<path d="M4 20.5h16"/><path d="M7 17v-6M12 17V7M17 17v-9"/>',
    'spark': '<path d="M12 3.5l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    'clinic': '<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M12 7.5v6M9 10.5h6"/><path d="M9.5 20.5v-3.5h5v3.5"/>',
    'quote': '<path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/><path d="M9 12.5h6M9 16h4"/>',
    'order': '<rect x="5" y="4.5" width="14" height="16" rx="1.5"/><path d="M9 3h6v3H9z"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
    'truck': '<path d="M3 6.5h11v9.5H3z"/><path d="M14 9.5h4l3 3.5v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    'invoice': '<path d="M6 3.5h12v17l-2.5-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 20.5z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
    'credit': '<path d="M9 7.5 5 11.5l4 4"/><path d="M5 11.5h9.5a4.5 4.5 0 0 1 0 9H12"/>',
    'cash-in': '<rect x="3" y="6.5" width="18" height="11" rx="1.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
    'factory': '<path d="M3.5 20.5V10l5 3V10l5 3V5.5h7v15z"/><path d="M7.5 17h2M12.5 17h2M16.5 9h1"/>',
    'box': '<path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9z"/><path d="M4 7.5l8 4 8-4M12 11.5v9"/>',
    'doc': '<path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/><path d="M9 12h6M9 15.5h6"/>',
    'card': '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="M3 9.5h18M6.5 14.5h4"/>',
    'grid': '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
    'warehouse': '<path d="M3 20.5V9l9-5 9 5v11.5"/><path d="M7 20.5V13h10v7.5M7 16.5h10"/>',
    'settings': '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    'renew': '<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1"/><path d="M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path d="M17.5 3.5v3.4h-3.4M6.5 20.5v-3.4h3.4"/>',
    'more': '<path d="M4 7h16M4 12h16M4 17h16"/>',
  };
  function icon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }

  const GROUPS = [
    { label: null, items: [
      { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html', ic: 'dashboard' },
      { id: 'scadenziario', label: 'Scadenziario', href: 'scadenziario.html', ic: 'calendar' },
      { id: 'riconciliazione', label: 'Riconciliazione bancaria', href: 'riconciliazione.html', ic: 'bank' },
      { id: 'report', label: 'Report & Analisi', href: 'report.html', ic: 'chart' },
      { id: 'assistente-ai', label: 'Assistente AI', href: 'assistente-ai.html', ic: 'spark' },
    ] },
    { label: 'Clienti', items: [
      { id: 'clienti', label: 'Clienti', href: 'clienti.html', ic: 'clinic' },
      { id: 'preventivi', label: 'Preventivi', href: 'preventivi.html', ic: 'quote' },
      { id: 'ordini', label: 'Ordini', href: 'ordini.html', ic: 'order' },
      { id: 'ddt', label: 'DDT', href: 'ddt.html', ic: 'truck' },
      { id: 'fatture', label: 'Fatture', href: 'fatture.html', ic: 'invoice' },
      { id: 'note-credito', label: 'Note di credito', href: 'note-credito.html', ic: 'credit' },
      { id: 'incassi', label: 'Incassi', href: 'incassi.html', ic: 'cash-in' },
    ] },
    { label: 'Fornitori', items: [
      { id: 'fornitori', label: 'Fornitori', href: 'fornitori.html', ic: 'factory' },
      { id: 'ordini-fornitore', label: 'Ordini', href: 'ordini-fornitore.html', ic: 'box' },
      // Stessa posizione di "DDT" nel gruppo Clienti sopra (tra Ordini e
      // Fatture): "DDT fornitore" — il DDT cartaceo che arriva col pacco
      // (0016_ddt_fornitore.sql), non generato da noi ma digitalizzato,
      // come fatture-fornitore.html.
      { id: 'ddt-fornitore', label: 'DDT', href: 'ddt-fornitore.html', ic: 'truck' },
      { id: 'fatture-fornitore', label: 'Fatture', href: 'fatture-fornitore.html', ic: 'doc' },
      { id: 'note-credito-fornitore', label: 'Note di credito', href: 'note-credito-fornitore.html', ic: 'credit' },
      { id: 'pagamenti', label: 'Pagamenti', href: 'pagamenti.html', ic: 'card' },
    ] },
    { label: 'Catalogo', items: [
      { id: 'prodotti', label: 'Prodotti', href: 'prodotti.html', ic: 'grid' },
      { id: 'magazzino', label: 'Magazzino', href: 'magazzino.html', ic: 'warehouse' },
    ] },
    { label: 'Azienda', items: [
      { id: 'impostazioni-azienda', label: 'Impostazioni', href: 'impostazioni-azienda.html', ic: 'settings' },
      { id: 'abbonamento', label: 'Abbonamento', href: 'abbonamento.html', ic: 'renew' },
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
    { id: 'dashboard', label: 'Home', href: 'dashboard.html', ic: 'dashboard' },
    { id: 'ordini', label: 'Ordini', href: 'ordini.html', ic: 'order' },
    { id: 'fatture', label: 'Fatture', href: 'fatture.html', ic: 'invoice' },
    { id: 'assistente-ai', label: 'Assistente', href: 'assistente-ai.html', ic: 'spark' },
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
        ${g.items.map(it => `<a class="navlink ${it.id === currentId ? 'on' : ''}" href="${it.href}"><span class="ic">${icon(it.ic)}</span>${esc(it.label)}</a>`).join('')}
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
    bar.innerHTML = BOTTOM_ITEMS.map(it => `<a class="${it.id === currentId ? 'on' : ''}" href="${it.href}"><span class="ic">${icon(it.ic)}</span>${esc(it.label)}</a>`).join('')
      + `<button type="button" class="${isDirect ? '' : 'on'}" id="nav-more-btn"><span class="ic">${icon('more')}</span>Altro</button>`;
    const moreBtn = document.getElementById('nav-more-btn');
    const sidebar = document.getElementById('sidebar');
    if (moreBtn && sidebar) {
      moreBtn.onclick = () => { sidebar.classList.toggle('open'); };
    }
  }

  global.SaasNav = { render };
})(window);
