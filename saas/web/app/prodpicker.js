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
  function fdate(d) { return d ? new Date(d).toLocaleDateString('it-IT') : ''; }
  // Stessa aritmetica dello sconto usata in ogni modulo documento (cascata
  // "N+M" inclusa) — qui serve solo per decidere COME mostrarlo nel
  // tooltip dello storico prezzi, non per calcolare un totale.
  function scFactor(s) { return String(s == null ? '' : s).split('+').map(x => parseFloat(String(x).trim()) || 0).reduce((f, p) => f * (1 - p / 100), 1); }
  function scEff(s) { return +(((1 - scFactor(s)) * 100).toFixed(2)); }
  function scLabel(s) { const e = scEff(s); if (e <= 0) return '—'; return String(s).includes('+') ? String(s).replace(/\s/g, '') + ' %' : e + '%'; }

  // ---------------------------------------------------------------------------
  // Storico prezzi al passaggio del mouse sul codice di un prodotto — porta
  // diretta di priceHistTipShow()/priceHistTipHide() nel vecchio gestionale:
  // un tooltip con le ultime volte che quel prodotto è comparso in un
  // documento (data, numero, prezzo, sconto), sia sul codice di un
  // suggerimento appena cercato sia sul codice già scritto in una riga.
  // Un solo elemento condiviso da tutte le pagine (appeso a document.body
  // al volo la prima volta che serve, non nell'HTML di ogni pagina), come
  // il resto di questo file è un unico posto invece di codice ripetuto in
  // ogni modulo documento.
  //
  // Il DATO invece resta pagina-specifico: opts.priceHistory(cod), se
  // passato, deve restituire {title, rows} — rows: [{data,prezzo,sconto,num}],
  // già filtrato per cliente/fornitore e ordinato dal più recente (vedi
  // clientPriceHistory()/acqPriceHistory() in ordini.html/ordini-fornitore.html
  // ecc.) — qui non c'è idea di "quale cliente", solo di come mostrarlo.
  // Pagine che non lo passano restano senza tooltip, come prima.
  let tipEl = null;
  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'price-hist-tip';
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function showTip(ev, title, rows) {
    const tip = ensureTip();
    if (!rows || !rows.length) { tip.classList.remove('show'); return; }
    tip.innerHTML = `<div class="pht-h">${esc(title || '')}</div>` +
      rows.map(r => `<div class="pht-r"><span>${fdate(r.data)} · ${esc(r.num || '')}</span><b>${eur(r.prezzo)}${scEff(r.sconto) > 0 ? ' (' + scLabel(r.sconto) + ')' : ''}</b></div>`).join('');
    tip.classList.add('show');
    // Stessa logica dell'originale: posiziona fuori schermo, misura le
    // dimensioni VERE (ora che ha un contenuto), poi lo sposta accanto al
    // mouse senza sporgere oltre i bordi della finestra.
    tip.style.left = '-9999px'; tip.style.top = '-9999px';
    const x = ev.clientX || 0, y = ev.clientY || 0;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 16, top = y + 16;
    if (left + w > vw - 8) left = x - w - 16;
    if (top + h > vh - 8) top = y - h - 16;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.classList.remove('show'); }

  // input: il campo di ricerca. sugg: il contenitore dei suggerimenti
  // (va posizionato subito dopo l'input, dentro un contenitore
  // position:relative — vedi .prod-pick in theme.css).
  // opts: { companyId, priceField: 'listinoVen'|'listinoAcq', onPick(prodotto),
  //         priceHistory(cod) opzionale — vedi sopra }
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
        // Niente equivalente touch qui sul codice del suggerimento: su
        // schermo touch un tocco È già la scelta del prodotto (mousedown
        // con preventDefault() sotto, che intercetta il gesto prima che
        // un eventuale "click" sul solo <span class="code"> possa mai
        // scattare) — non c'è un gesto separato "sfiora per vedere,
        // tocca per scegliere" da ricavare sullo stesso elemento senza
        // cambiare cosa fa un tocco qui. Resta un miglioramento solo
        // desktop (mouse), niente di meno di prima su mobile.
        el.addEventListener('mousedown', e => { e.preventDefault(); pick(el.dataset.cod); });
        if (opts.priceHistory) {
          const codeEl = el.querySelector('.code');
          codeEl.addEventListener('mouseenter', e => {
            const h = opts.priceHistory(el.dataset.cod) || {};
            showTip(e, h.title, h.rows);
          });
          codeEl.addEventListener('mouseleave', hideTip);
        }
      });
    }
    // Stesso tooltip anche sul codice GIÀ scelto in questo campo (non solo
    // sui suggerimenti prima di sceglierlo) — es. passando il mouse sul
    // campo "Codice" di una riga già compilata. Se il campo è vuoto o
    // contiene testo digitato a metà (non un codice reale), priceHistory()
    // non trova righe e il tooltip semplicemente non appare.
    //
    // Su schermo touch "mouseenter"/"mouseleave" non scattano MAI (non
    // esiste hover senza un mouse vero) — qui il campo è un <input> vero,
    // quindi un tocco può mostrare lo storico senza impedire poi il
    // comportamento normale (mette a fuoco, apre la tastiera): stesso
    // principio già in questo prodotto per il grafico della dashboard
    // (onmousemove+onclick sullo stesso hit-target, vedi dashboard.html),
    // qui "click" — che il browser genera anche per un tocco, non solo
    // per un vero clic del mouse — al posto di "mousemove continuo".
    // Sparisce da solo dopo pochi secondi: un tocco non ha un "mouseleave"
    // naturale con cui abbinare la sparizione.
    if (opts.priceHistory) {
      let hideTimer = null;
      const trigger = e => {
        const cod = input.value.trim();
        if (!cod) return;
        const h = opts.priceHistory(cod) || {};
        showTip(e, h.title, h.rows);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hideTip, 4000);
      };
      input.addEventListener('mouseenter', trigger);
      input.addEventListener('mouseleave', () => { clearTimeout(hideTimer); hideTip(); });
      input.addEventListener('click', trigger);
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
