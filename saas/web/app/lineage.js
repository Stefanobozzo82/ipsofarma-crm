// lineage.js — il box "Documenti collegati" che il vecchio gestionale
// mostrava in ogni scheda documento: un diagramma a nodi cliccabili con
// l'intera filiera, dall'ordine cliente radice fino a fatture e note di
// credito, sia sul lato fornitore (OC -> OF -> FTF -> NCF) sia sul lato
// cliente (OC -> DDT -> FT -> NC). Porta diretta dell'algoritmo di
// lineage()/node() del gestionale originale — qui adattata perché la SaaS
// non è una SPA: ogni modulo è una pagina a sé, quindi cliccare un nodo
// salva {coll, num} in localStorage e naviga alla pagina di quel modulo
// (stesso meccanismo già usato da "Genera fattura" in ddt.html).
(function (global) {
  'use strict';

  const PAGE_FOR_COLL = {
    ordiniCliente: 'ordini.html',
    ordiniFornitore: 'ordini-fornitore.html',
    ddt: 'ddt.html',
    fattureCliente: 'fatture.html',
    fattureFornitore: 'fatture-fornitore.html',
    noteCredito: 'note-credito.html',
    noteCreditoFornitore: 'note-credito-fornitore.html',
  };
  const ALL_COLLS = Object.keys(PAGE_FOR_COLL);

  // Tutte le collection collegabili, con `docs[coll] = [item]` iniettato
  // per il documento corrente (in modo che i lookup locali funzionino
  // anche per lui) tra quelle già caricate dal chiamante — un fetch di
  // rete per ogni apertura di un documento esistente, accettabile: sono
  // elenchi per singola azienda, non l'intero database (come nel vecchio
  // gestionale, dove erano semplicemente già tutti in memoria).
  async function loadAll(store, companyId) {
    const arrays = await Promise.all(ALL_COLLS.map(n => store.loadCollection(n, companyId)));
    const docs = {};
    ALL_COLLS.forEach((n, i) => { docs[n] = arrays[i]; });
    return docs;
  }

  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // Ricostruisce il diagramma per `item` (di tipo `coll`) — ispirato a
  // lineage() dal gestionale originale, ma NON una porta diretta: la SaaS
  // collega i documenti in modo meno uniforme di come faceva l'originale
  // (dove tutto viveva in un solo DB in memoria con ID stabili "OC/2026/1").
  // Qui ogni riferimento va letto per quello che è davvero, verificato nel
  // codice di ogni pagina:
  //  - ddt.ocId, fattureCliente.ocId/ddtId, fattureFornitore.ofId,
  //    noteCredito.fatturaId, noteCreditoFornitore.fatturaId sono colonne
  //    Postgres vere (docToRow/COLLECTIONS in store.js) e contengono l'ID
  //    riga del documento collegato — scritte sempre, ad ogni salvataggio.
  //  - ordiniFornitore.ocId, ordiniCliente.ofIds/ofId invece vivono nella
  //    colonna "extra" e contengono il NUMERO del documento (non l'id) —
  //    scritte solo da cascade.js/generaOrdiniFornitore(), quindi non
  //    affidabili come le colonne vere sopra.
  //  - ordiniFornitore.ftfIds è una colonna vera ma non viene MAI scritta
  //    da nessun percorso della SaaS (verificato: nessun saveDoc la
  //    imposta) — quindi non va usata.
  // Per questo qui si risale la filiera con una scansione all'indietro
  // (trova i figli di X cercando chi ha X come genitore) sui riferimenti
  // realmente scritti, invece di fidarsi di array/numeri lato genitore
  // come faceva l'originale — più lento ma sempre corretto, anche se un
  // salvataggio a metà strada non ha aggiornato un elenco.
  // `docs` sono le 7 collection documento della azienda (vedi loadAll
  // sopra). Ritorna una stringa HTML, o '' se non c'è nulla da mostrare
  // (un preventivo, o un documento senza alcun collegamento).
  function buildLineage(coll, item, docs) {
    if (!item || coll === 'preventivi') return '';
    const t = { ordiniCliente: 'OC', ordiniFornitore: 'OF', ddt: 'DDT', fattureCliente: 'FT', fattureFornitore: 'FTF', noteCredito: 'NC', noteCreditoFornitore: 'NCF' }[coll];
    if (!t) return '';
    const byId = (arr, id) => id ? (arr || []).find(x => x.id === id) : null;
    const byNum = (arr, num) => num ? (arr || []).find(x => x.num === num) : null;
    const cur = item.id;
    const node = (label, obj, objColl) => `<div class="fnode ${obj.id === cur ? 'cur' : ''}" data-nav-coll="${objColl}" data-nav-num="${esc(obj.num)}"><span class="fl">${esc(label)}</span><span class="fv">${esc(obj.num)}</span></div>`;
    const arrow = '<span class="farrow">→</span>';
    const ghost = label => `<div class="fnode ghost"><span class="fl">${esc(label)}</span><span class="fv">— non generato</span></div>`;

    // OC radice (se esiste), risalendo dal documento aperto tramite gli ID
    // riga scritti realmente (vedi nota sopra) — non tramite numeri.
    let oc = null;
    if (t === 'OC') oc = item;
    else if (t === 'DDT') oc = byId(docs.ordiniCliente, item.ocId);
    else if (t === 'FT') oc = item.ocId ? byId(docs.ordiniCliente, item.ocId) : (item.ddtId ? byId(docs.ordiniCliente, (byId(docs.ddt, item.ddtId) || {}).ocId) : null);
    else if (t === 'NC') {
      const ft = byId(docs.fattureCliente, item.fatturaId);
      oc = ft ? (ft.ocId ? byId(docs.ordiniCliente, ft.ocId) : (ft.ddtId ? byId(docs.ordiniCliente, (byId(docs.ddt, ft.ddtId) || {}).ocId) : null)) : null;
    }
    // Lato fornitore: ordiniFornitore.ocId è un NUMERO (non un id), scritto
    // solo da generaOrdiniFornitore() — vedi la nota sopra.
    else if (t === 'OF') oc = byNum(docs.ordiniCliente, item.ocId);
    else if (t === 'FTF') { const of = byId(docs.ordiniFornitore, item.ofId); oc = of ? byNum(docs.ordiniCliente, of.ocId) : null; }
    else if (t === 'NCF') { const ftf = byId(docs.fattureFornitore, item.fatturaId); const of = ftf ? byId(docs.ordiniFornitore, ftf.ofId) : null; oc = of ? byNum(docs.ordiniCliente, of.ocId) : null; }

    if (oc) {
      // Figli dell'OC trovati per scansione all'indietro (chi ha oc come
      // genitore), non tramite gli array ofIds/ddtIds del vecchio schema.
      const ofList = docs.ordiniFornitore.filter(of => of.ocId === oc.num);
      const ddtList = docs.ddt.filter(d => d.ocId === oc.id);
      const ofRows = ofList.length ? ofList.map((of, i) => {
        const ftfList = docs.fattureFornitore.filter(f => f.ofId === of.id);
        const ftfNodes = ftfList.length ? ftfList.map((f, j) => node('Fattura fornitore' + (ftfList.length > 1 ? ' ' + (j + 1) : ''), f, 'fattureFornitore') + docs.noteCreditoFornitore.filter(n => n.fatturaId === f.id).map(n => arrow + node('Nota di credito fornitore', n, 'noteCreditoFornitore')).join('')).join(arrow) : ghost('Fattura fornitore');
        return `<div class="flow-row">${node('Ordine fornitore' + (ofList.length > 1 ? ' ' + (i + 1) : ''), of, 'ordiniFornitore')}${arrow}${ftfNodes}</div>`;
      }).join('') : `<div class="flow-row">${ghost('Ordine fornitore')}${arrow}${ghost('Fattura fornitore')}</div>`;
      const ddtRows = ddtList.length ? ddtList.map((d, i) => {
        const ftObj = docs.fattureCliente.find(f => f.ddtId === d.id);
        return `<div class="flow-row">${node('DDT' + (ddtList.length > 1 ? ' ' + (i + 1) : ''), d, 'ddt')}${arrow}${ftObj ? node('Fattura cliente', ftObj, 'fattureCliente') + docs.noteCredito.filter(n => n.fatturaId === ftObj.id).map(n => arrow + node('Nota di credito', n, 'noteCredito')).join('') : ghost('Fattura cliente')}</div>`;
      }).join('') : `<div class="flow-row">${ghost('DDT')}${arrow}${ghost('Fattura cliente')}</div>`;
      return `<div class="flow"><div class="flow-row">
        ${node('Ordine cliente', oc, 'ordiniCliente')}${arrow}
        <div class="fbranch">
          ${ofRows}
          ${ddtRows}
        </div>
      </div></div>`;
    }

    // senza ordine cliente radice: mostra comunque lo schema del lato pertinente
    if (t === 'OF' || t === 'FTF' || t === 'NCF') {
      const of = t === 'OF' ? item : (t === 'FTF' ? byId(docs.ordiniFornitore, item.ofId) : (() => { const ftf = byId(docs.fattureFornitore, item.fatturaId); return ftf ? byId(docs.ordiniFornitore, ftf.ofId) : null; })());
      if (of) {
        const ftfList = docs.fattureFornitore.filter(f => f.ofId === of.id);
        const ftfNodes = ftfList.length ? ftfList.map((f, i) => node('Fattura fornitore' + (ftfList.length > 1 ? ' ' + (i + 1) : ''), f, 'fattureFornitore') + docs.noteCreditoFornitore.filter(n => n.fatturaId === f.id).map(n => arrow + node('Nota di credito fornitore', n, 'noteCreditoFornitore')).join('')).join(arrow) : ghost('Fattura fornitore');
        return `<div class="flow"><div class="flow-row">${node('Ordine fornitore', of, 'ordiniFornitore')}${arrow}${ftfNodes}</div></div>`;
      }
      if (t === 'FTF') return '<div class="flow"><span class="flow-empty">Fattura non collegata a un ordine fornitore.</span></div>';
      if (t === 'NCF') { const ftf = byId(docs.fattureFornitore, item.fatturaId); return ftf ? `<div class="flow"><div class="flow-row">${node('Fattura fornitore', ftf, 'fattureFornitore')}${arrow}${node('Nota di credito fornitore', item, 'noteCreditoFornitore')}</div></div>` : '<div class="flow"><span class="flow-empty">Nota di credito non collegata a una fattura fornitore.</span></div>'; }
    }
    let chain = [];
    if (t === 'DDT' || t === 'FT' || t === 'NC') {
      const ddt = t === 'DDT' ? item : (t === 'FT' ? byId(docs.ddt, item.ddtId) : null);
      const ft = t === 'FT' ? item : (t === 'NC' ? byId(docs.fattureCliente, item.fatturaId) : (ddt ? docs.fattureCliente.find(f => f.ddtId === ddt.id) : null));
      if (ddt) chain.push(['DDT', ddt, 'ddt']);
      if (ft) chain.push(['Fattura cliente', ft, 'fattureCliente']);
      if (t === 'NC') chain.push(['Nota di credito', item, 'noteCredito']);
      else if (ft) docs.noteCredito.filter(nc => nc.fatturaId === ft.id).forEach(nc => chain.push(['Nota di credito', nc, 'noteCredito']));
    }
    if (chain.length < 2) return '<div class="flow"><span class="flow-empty">Nessun altro documento collegato.</span></div>';
    return `<div class="flow"><div class="flow-row">${chain.map(c => node(c[0], c[1], c[2])).join(arrow)}</div></div>`;
  }

  // Renderizza il box dentro `container` (un elemento vuoto, tipicamente
  // dentro un <div class="panel">) e collega il click sui nodi non
  // fantasma alla navigazione verso l'altro modulo — vedi PAGE_FOR_COLL.
  // Ritorna true se c'era qualcosa da mostrare (il chiamante può usarlo
  // per nascondere l'intero pannello quando vuoto, es. per un DDT ancora
  // isolato appena creato).
  function renderInto(container, coll, item, docs) {
    const html = buildLineage(coll, item, docs);
    container.innerHTML = html;
    container.querySelectorAll('[data-nav-coll]').forEach(el => {
      el.addEventListener('click', () => {
        const targetColl = el.dataset.navColl;
        const page = PAGE_FOR_COLL[targetColl];
        if (!page) return;
        localStorage.setItem('saas_open_doc', JSON.stringify({ coll: targetColl, num: el.dataset.navNum }));
        location.href = page;
      });
    });
    return !!html;
  }

  // Da richiamare all'avvio di ogni pagina modulo, PRIMA di caricare
  // l'elenco: se un nodo del box è stato appena cliccato per aprire
  // QUESTO modulo, consuma il flag (senza doverlo controllare a mano in
  // ogni pagina) e ritorna il numero del documento da cercare e aprire —
  // o null se non c'è nulla in attesa, o il flag era per un altro modulo
  // (lasciato intatto, così la pagina di destinazione lo trova ancora).
  function consumePendingOpenNum(myColl) {
    const raw = localStorage.getItem('saas_open_doc');
    if (!raw) return null;
    try {
      const { coll, num } = JSON.parse(raw);
      if (coll !== myColl) return null;
      localStorage.removeItem('saas_open_doc');
      return num;
    } catch (e) { localStorage.removeItem('saas_open_doc'); return null; }
  }

  global.SaasLineage = { loadAll, buildLineage, renderInto, consumePendingOpenNum, PAGE_FOR_COLL };
})(window);
