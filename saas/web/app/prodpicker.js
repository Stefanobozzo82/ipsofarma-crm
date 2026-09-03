/* ============================================================================
 * prodpicker.js — autocompletamento riga da catalogo prodotti, porta diretta
 * di prodSearch()/prodKeyNav()/addProdToOrder() in index.html: un campo di
 * ricerca sopra l'editor delle righe, con un menu di suggerimenti (codice,
 * descrizione, prezzo) navigabile da tastiera; scegliendo un prodotto (clic
 * o Invio) aggiunge una riga precompilata.
 *
 * La stessa attach() serve anche per l'autocompletamento DENTRO il campo
 * "Codice" di una riga gia' presente nell'editor (non solo nella barra di
 * ricerca separata sopra la tabella): in quel caso opts.clearOnPick:false
 * lascia che sia onPick a decidere cosa scrivere nel campo (il codice
 * scelto, non una casella vuota) invece di svuotarlo come fa la barra di
 * ricerca dedicata.
 *
 * Differenza dall'originale: lì la ricerca è su un array in memoria
 * (allProdotti()); qui il catalogo può avere ~21.000 righe (vedi
 * prodotti.html), quindi la ricerca passa da store.searchProdotti() —
 * server-side, limitata — come già fa prodotti.html. Conseguenza pratica:
 * il "match esatto su Invio" dell'originale considera SOLO i risultati già
 * arrivati dal server (di solito sufficiente — un codice cercato per intero
 * finisce quasi sempre tra i primi risultati), non l'intero catalogo.
 * ============================================================================ */

(function (global) {
  'use strict';

  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function eur(n) { return (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }); }

  // input: il campo di ricerca. sugg: il contenitore dei suggerimenti
  // (va posizionato subito dopo l'input, dentro un contenitore
  // position:relative — vedi .prod-pick in theme.css).
  // opts: { companyId, priceField: 'listinoVen'|'listinoAcq', onPick(prodotto) }
  function attach(input, sugg, opts) {
    let idx = -1;
    let timer = null;
    let lastList = [];

    function render(list) {
      lastList = list;
      sugg.innerHTML = list.length
        ? list.map(p => `<div class="sugg-item" data-cod="${esc(p.cod)}"><span class="code">${esc(p.cod)}</span><span class="sugg-d">${esc(p.descr)}</span><span class="sugg-pr">${eur(p[opts.priceField])}</span></div>`).join('')
        : '<div class="sugg-empty">Nessun prodotto trovato</div>';
      sugg.querySelectorAll('.sugg-item').forEach(el => {
        el.addEventListener('mousedown', e => { e.preventDefault(); pick(el.dataset.cod); });
      });
    }

    function pick(cod) {
      const p = lastList.find(x => x.cod === cod);
      if (!p) return;
      opts.onPick(p);
      if (opts.clearOnPick !== false) input.value = '';
      sugg.innerHTML = '';
      idx = -1;
      input.focus();
    }

    // Campo vuoto (prima ancora di scrivere qualcosa, o tornati vuoti a
    // forza di backspace): mostra subito i primi prodotti del catalogo
    // invece di un menu vuoto — searchProdotti(query:'') salta il filtro
    // e ritorna semplicemente i primi N per codice (store.js), lo stesso
    // giro già usato per una ricerca vera. Richiesta reale: prima bisognava
    // sempre scrivere qualcosa prima di vedere un solo prodotto.
    async function showDefault() {
      try {
        const list = await global.SaasStore.searchProdotti(opts.companyId, '', 12);
        // come sotto: se nel frattempo è stato scritto qualcosa, questa
        // risposta arrivata in ritardo non deve sovrascriverlo.
        if (input.value.trim() !== '') return;
        render(list);
      } catch (e) { /* silenzioso: niente elenco iniziale, non blocca la digitazione */ }
    }
    // 'focus' copre l'apertura normale del campo; 'click' serve a
    // riaprirlo quando è già a fuoco ma vuoto e il menu è stato appena
    // chiuso (Esc, o una scelta già fatta) — 'focus' da solo non
    // rifirerebbe in quel caso.
    const maybeShowDefault = () => { if (!input.value.trim() && !sugg.innerHTML) showDefault(); };
    input.addEventListener('focus', maybeShowDefault);
    input.addEventListener('click', maybeShowDefault);

    input.addEventListener('input', () => {
      const q = input.value.trim();
      idx = -1;
      clearTimeout(timer);
      if (!q) { showDefault(); return; }
      timer = setTimeout(async () => {
        try {
          const list = await global.SaasStore.searchProdotti(opts.companyId, q, 12);
          // Se nel frattempo il campo è cambiato (o svuotato), questa
          // risposta è ormai obsoleta: non sovrascrivere un risultato più
          // recente (o assente) con uno vecchio arrivato in ritardo.
          if (input.value.trim() !== q) return;
          render(list);
        } catch (e) { sugg.innerHTML = ''; }
      }, 200);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = input.value.trim().toLowerCase();
        const exact = q && lastList.find(p => (p.cod || '').toLowerCase() === q);
        const items = [...sugg.querySelectorAll('.sugg-item')];
        if (exact) { pick(exact.cod); return; }
        if (idx >= 0 && items[idx]) { pick(items[idx].dataset.cod); }
        else if (items.length === 1) { pick(items[0].dataset.cod); }
        return;
      }
      const items = [...sugg.querySelectorAll('.sugg-item')];
      if (!items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); }
      else if (e.key === 'Escape') { sugg.innerHTML = ''; idx = -1; return; }
      else return;
      items.forEach((it, i) => it.classList.toggle('active', i === idx));
      if (idx >= 0) items[idx].scrollIntoView({ block: 'nearest' });
    });
  }

  global.SaasProdPicker = { attach };
})(window);
