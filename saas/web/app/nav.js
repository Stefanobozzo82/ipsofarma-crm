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

  const GROUPS = [
    { label: 'Clienti', items: [
      { id: 'clienti', label: 'Clienti', href: 'clienti.html' },
      { id: 'ordini', label: 'Ordini', href: 'ordini.html' },
      { id: 'ddt', label: 'DDT', href: 'ddt.html' },
      { id: 'fatture', label: 'Fatture', href: 'fatture.html' },
      { id: 'note-credito', label: 'Note di credito', href: 'note-credito.html' },
    ] },
    { label: 'Fornitori', items: [
      { id: 'fornitori', label: 'Fornitori', href: 'fornitori.html' },
      { id: 'ordini-fornitore', label: 'Ordini', href: 'ordini-fornitore.html' },
      { id: 'fatture-fornitore', label: 'Fatture', href: 'fatture-fornitore.html' },
      { id: 'note-credito-fornitore', label: 'Note di credito', href: 'note-credito-fornitore.html' },
    ] },
    { label: 'Azienda', items: [
      { id: 'abbonamento', label: 'Abbonamento', href: 'abbonamento.html' },
    ] },
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
        <p class="label">${esc(g.label)}</p>
        ${g.items.map(it => `<a class="navlink ${it.id === currentId ? 'on' : ''}" href="${it.href}"><span class="dot"></span>${esc(it.label)}</a>`).join('')}
      </div>
    `).join('');

    el.innerHTML = `
      <div class="brand">
        <p class="eyebrow">Gestionale</p>
        <h1>${esc(opts.companyName || 'Azienda')}</h1>
      </div>
      <nav>${groupsHtml}</nav>
      <div class="account">
        <p class="email">${esc(opts.email || '')}</p>
        <div class="account-links">
          <a href="index.html">Cambia azienda</a>
          <button id="nav-logout" type="button">Esci</button>
        </div>
      </div>
    `;

    const logoutBtn = document.getElementById('nav-logout');
    if (logoutBtn && opts.onLogout) {
      logoutBtn.addEventListener('click', () => { opts.onLogout(); });
    }
  }

  global.SaasNav = { render };
})(window);
