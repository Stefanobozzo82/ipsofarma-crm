/* ============================================================================
 * app/doc-page.js — ciò che le pagine documento hanno in comune.
 *
 * ordini.html, ordini-fornitore.html, ddt.html, ddt-fornitore.html,
 * fatture.html, fatture-fornitore.html, preventivi.html, note-credito.html e
 * note-credito-fornitore.html sono nate una per volta copiando la
 * precedente: la stessa aritmetica dello sconto, lo stesso ordinamento
 * delle colonne, lo stesso trascinamento delle righe, gli stessi pulsanti
 * Stampa/PDF/Excel erano scritti nove volte, identici byte per byte. Una
 * correzione andava ripetuta nove volte — e quando non veniva ripetuta le
 * pagine divergevano in silenzio (è successo: vedi il bug qtyEv citato in
 * app/cascade.js). Qui vive una copia sola.
 *
 * Ogni funzione riceve esplicitamente lo stato di cui ha bisogno (l'oggetto
 * SORT, la mappa clientiById, l'elemento DOM...) invece di leggerlo da
 * variabili globali della pagina: così la pagina resta padrona del proprio
 * stato e questo file non deve sapere come si chiama in ciascuna.
 * ============================================================================ */
(function(){
  'use strict';

  // ---- formattazione ---------------------------------------------------------
  function today(){ return new Date().toISOString().slice(0, 10); }
  function esc(s){ return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function eur(n){ return (Number(n) || 0).toLocaleString('it-IT', { style:'currency', currency:'EUR' }); }
  function itDate(iso){ return iso ? new Date(iso).toLocaleDateString('it-IT') : '—'; }

  // ---- aritmetica delle righe --------------------------------------------------
  // Stessa aritmetica dello sconto del gestionale originale, cascata "N+M"
  // inclusa (es. "50+15" = 50% e poi un altro 15% sul residuo).
  function scParts(s){ return String(s == null ? '' : s).split('+').map(x => parseFloat(String(x).trim()) || 0); }
  function scFactor(s){ return scParts(s).reduce((f, p) => f * (1 - p / 100), 1); }
  function scEff(s){ return +(((1 - scFactor(s)) * 100).toFixed(2)); }
  function lineNet(r){ return (Number(r.qty) || 0) * (Number(r.prezzo) || 0) * scFactor(r.sconto); }
  function rigaTotale(r){ const imp = lineNet(r); return imp + imp * (Number(r.iva) || 0) / 100; }
  function docTotale(righe){ return (righe || []).reduce((s, r) => s + rigaTotale(r), 0); }
  function impTot(righe){ return (righe || []).reduce((s, r) => s + lineNet(r), 0); }
  function ivaTot(righe){ return (righe || []).reduce((s, r) => s + lineNet(r) * (Number(r.iva) || 0) / 100, 0); }

  // ---- ordinamento, ricerca, filtri ------------------------------------------
  function sortCmp(va, vb, dir){
    const mul = dir === 'asc' ? 1 : -1;
    if(typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
    return String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), 'it', { numeric:true }) * mul;
  }
  // Un clic sull'intestazione ordina, un secondo clic inverte la direzione;
  // numero e data partono decrescenti (i più recenti in cima), il resto
  // crescente.
  function thHtml(sort, key, label){
    const on = sort.key === key, ar = on ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="thsort ${on ? 'on' : ''}" data-sort="${key}">${esc(label)}${ar}</th>`;
  }
  function toggleSort(sort, key){
    if(sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
    else { sort.key = key; sort.dir = key === 'num' || key === 'data' ? 'desc' : 'asc'; }
  }
  function sortByNome(list){
    return [...list].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it', { sensitivity:'base' }));
  }
  function partyOptionsHtml(list){
    return sortByNome(list).map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');
  }
  // Ricerca testuale sull'elenco: numero documento + nome della controparte.
  function matchesText(q, doc, partyName){
    if(!q) return true;
    return (doc.num || '').toLowerCase().includes(q) || (partyName || '').toLowerCase().includes(q);
  }
  function bindSearch(input, onChange){
    let timer = null;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      clearTimeout(timer);
      timer = setTimeout(() => onChange(q), 200);
    });
  }
  function inDateRange(doc, from, to){
    if(from && (doc.data || '') < from) return false;
    if(to && (doc.data || '') > to) return false;
    return true;
  }
  // Completo = ogni riga interamente evasa (qtyEv >= qty) — stessa
  // definizione di evasione() in dashboard.html, così "aperti o parziali"
  // seleziona esattamente gli stessi ordini che la dashboard conta.
  function ordineCompleto(o){
    const righe = o.righe || [];
    return righe.length > 0 && righe.every(r => (r.qtyEv || 0) >= (r.qty || 0));
  }

  // ---- messaggi ----------------------------------------------------------------
  function showMsg(el, text, kind){
    if(!text){ el.hidden = true; return; }
    el.textContent = text; el.className = 'msg ' + kind; el.hidden = false;
  }

  // ---- editor righe ------------------------------------------------------------
  // Riordino per trascinamento: solo la manetta ⠿ è draggable, non l'intera
  // riga — altrimenti trascinare per selezionare del testo in un campo
  // verrebbe scambiato per un trascinamento della riga. L'ordine finale è
  // quello del DOM, che readRighe() legge già in quell'ordine.
  let dragSrcRow = null;
  function bindRowDrag(tr){
    const handle = tr.querySelector('.drag-handle');
    handle.addEventListener('dragstart', e => {
      dragSrcRow = tr;
      tr.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ''); // alcuni browser esigono un dato qualunque perché il drag parta davvero
    });
    handle.addEventListener('dragend', () => { tr.classList.remove('dragging'); dragSrcRow = null; });
    tr.addEventListener('dragover', e => {
      if(!dragSrcRow || dragSrcRow === tr) return;
      e.preventDefault(); // di norma un drop non è permesso: va abilitato esplicitamente qui
      const rect = tr.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      tr.parentNode.insertBefore(dragSrcRow, before ? tr : tr.nextSibling);
    });
    tr.addEventListener('drop', e => e.preventDefault());
  }
  // Badge "ultimo prezzo": la riga ha ripreso prezzo/sconto dallo storico
  // della controparte. Sparisce se l'utente tocca prezzo o sconto a mano.
  function markLastBadge(tr){
    clearLastBadge(tr);
    tr.dataset.last = '1';
    tr.querySelector('.r-cod').closest('td').insertAdjacentHTML('beforeend', '<span class="lastp">ultimo prezzo</span>');
  }
  function clearLastBadge(tr){
    delete tr.dataset.last;
    const badge = tr.querySelector('.lastp');
    if(badge) badge.remove();
  }
  // Colonne "Consegnata/Ricevuta"/"Residuo"/"Stato" di sola lettura, da
  // r.consegnato/r.residuo già calcolati da SaasCascade.residuoRighe().
  function evasioneCellsHtml(r, doneLabel){
    const consegnato = r.consegnato || 0;
    const residuo = r.residuo != null ? r.residuo : Math.max(0, (r.qty || 0) - consegnato);
    const done = residuo <= 0 && (r.qty || 0) > 0;
    const stato = done ? `<span class="pill paid">${doneLabel}</span>` : consegnato > 0 ? '<span class="pill partial">parziale</span>' : '<span class="pill unpaid">in attesa</span>';
    return `<td class="ev-col num-col">${consegnato}</td><td class="ev-col num-col">${residuo}</td><td class="ev-col">${stato}</td>`;
  }
  // Barra + percentuale sopra la tabella righe: stesso calcolo delle
  // colonne per riga, aggregato sull'intero ordine.
  function renderEvasioneSummary(ordine, els){
    if(!ordine){ els.box.hidden = true; return; }
    const righe = window.SaasCascade.residuoRighe(ordine);
    const totQ = righe.reduce((s, r) => s + (r.qty || 0), 0);
    if(totQ === 0){ els.box.hidden = true; return; }
    const consegnatoQ = righe.reduce((s, r) => s + Math.min(r.consegnato, r.qty || 0), 0);
    const pct = Math.round(consegnatoQ / totQ * 100);
    els.box.hidden = false;
    els.pct.textContent = `${consegnatoQ}/${totQ} pz · ${pct}%`;
    els.fill.style.width = pct + '%';
    els.fill.style.background = pct >= 100 ? 'var(--accent)' : pct > 0 ? 'var(--blue)' : 'var(--amber)';
  }

  // ---- storico prezzi ------------------------------------------------------------
  // Porta di lastLinePrice()/priceHistory() del gestionale originale: la riga
  // più recente (per data documento) con lo stesso codice, tra i documenti
  // di `storico[coll]` per cui `accept(doc)` è vero (es. "dello stesso
  // cliente"; nessun filtro per gli acquisti, come nell'originale).
  function lastLinePrice(storico, colls, cod, accept){
    if(!cod) return null;
    let best = null;
    colls.forEach(coll => {
      (storico[coll] || []).forEach(d => {
        if(accept && !accept(d)) return;
        const r = (d.righe || []).find(x => x.cod === cod);
        if(r && r.prezzo != null && (!best || String(d.data) > String(best.data))){
          best = { data: d.data, prezzo: r.prezzo, sconto: r.sconto || '' };
        }
      });
    });
    return best;
  }
  function linePriceHistory(storico, colls, cod, accept, limit){
    if(!cod) return [];
    const out = [];
    colls.forEach(coll => {
      (storico[coll] || []).forEach(d => {
        if(accept && !accept(d)) return;
        const r = (d.righe || []).find(x => x.cod === cod);
        if(r && r.prezzo != null) out.push({ data: d.data, prezzo: r.prezzo, sconto: r.sconto || '', num: d.num });
      });
    });
    out.sort((a, b) => String(b.data).localeCompare(String(a.data)));
    return out.slice(0, limit || 5);
  }
  // Cambiare controparte a form già aperto riprezza le righe ancora col
  // badge (non toccate a mano): ultimo prezzo per la nuova controparte, o
  // il listino se non c'è storico — mai lasciare il prezzo pensato per
  // un'ALTRA controparte.
  async function repriceRows(tbody, lastPriceFor, store, companyId, priceField){
    const rows = [...tbody.querySelectorAll('tr')].filter(tr => tr.dataset.last === '1' && tr.querySelector('.r-cod').value.trim());
    for(const tr of rows){
      const cod = tr.querySelector('.r-cod').value.trim();
      const last = lastPriceFor(cod);
      if(last){
        tr.querySelector('.r-prezzo').value = last.prezzo;
        tr.querySelector('.r-sconto').value = last.sconto || '';
        continue;
      }
      let listino = 0;
      try{
        const found = await store.searchProdotti(companyId, cod, 5);
        const p = found.find(x => x.cod === cod);
        if(p) listino = p[priceField] || 0;
      }catch(e){ /* silenzioso: al più resta il prezzo già in campo */ }
      tr.querySelector('.r-prezzo').value = listino;
      tr.querySelector('.r-sconto').value = '';
      clearLastBadge(tr);
    }
  }

  // ---- destinazioni di consegna del cliente ------------------------------------
  // Le destinazioni sono gestite in clienti.html: qui si sceglie solo quale
  // usare per QUESTO documento. "Sede legale" resta il default; in ordine
  // alfabetico sull'etichetta mostrata (nome, o città se manca).
  function fillDestOptions(select, wrap, cliente){
    const dest = (cliente && cliente.dest) || [];
    wrap.hidden = dest.length === 0;
    const destSorted = [...dest].sort((a, b) => (a.nome || a.citta || '').localeCompare(b.nome || b.citta || '', 'it', { sensitivity:'base' }));
    select.innerHTML = '<option value="">Sede legale</option>' +
      destSorted.map(d => `<option value="${d.id}">${esc(d.nome || d.citta || 'Sede')}</option>`).join('');
  }
  // Sottotitolo "📍 destinazione" sotto il nome del cliente in elenco,
  // quando il documento indica una destinazione diversa dalla sede legale.
  function destSubHtml(cliente, doc){
    const dest = (doc.destId && cliente && cliente.dest) ? cliente.dest.find(d => d.id === doc.destId) : null;
    return dest ? `<div style="font-size:11px;color:var(--faint);margin-top:1px">📍 ${esc(dest.nome || dest.citta || 'Sede')}</div>` : '';
  }

  // ---- riferimento ordine letto da un documento del fornitore --------------------
  // Confronta il riferimento letto in fattura/DDT col numero di un NOSTRO
  // ordine: primo gruppo di cifre del riferimento contro l'ULTIMO gruppo di
  // cifre del numero ordine (PREFISSO/ANNO/NNNN: l'anno non va mai scambiato
  // per il riferimento). Con 0 o più di un candidato non collega da solo.
  function firstDigits(s){ const m = String(s || '').match(/\d+/); return m ? parseInt(m[0], 10) : null; }
  function lastDigits(s){ const m = String(s || '').match(/\d+/g); return m ? parseInt(m[m.length - 1], 10) : null; }
  function findOrdineByRiferimento(ordini, riferimento){
    const rifNum = firstDigits(riferimento);
    if(rifNum == null) return null;
    const match = (ordini || []).filter(o => lastDigits(o.num) === rifNum);
    return match.length === 1 ? match[0] : null;
  }

  // ---- elenco --------------------------------------------------------------------
  // Scarica l'elenco da Supabase, passando dalla schermata "Carico…". Torna
  // null (con l'errore già scritto nell'area) se il caricamento fallisce.
  async function loadList(store, coll, companyId, area){
    area.innerHTML = '<p class="empty">Carico…</p>';
    try{
      return await store.loadCollection(coll, companyId);
    }catch(err){
      area.innerHTML = `<p class="empty">Errore nel caricamento: ${esc(err.message)}</p>`;
      return null;
    }
  }
  // Interazioni comuni della tabella appena disegnata: intestazioni
  // ordinabili, spunta singola e "seleziona tutto", apertura del documento
  // dal pulsante Modifica o dal clic sulla riga (ma non su un controllo
  // dentro la riga). `onSpecialRow(tr)` può intercettare righe che non
  // sono documenti di questo elenco (es. una nota di credito nell'elenco
  // fatture) tornando true.
  function bindElenco(area, o){
    area.querySelectorAll('[data-sort]').forEach(th => th.addEventListener('click', () => o.setSort(th.dataset.sort)));
    const all = area.querySelector('#check-all');
    if(all) all.addEventListener('click', e => {
      e.stopPropagation();
      if(e.target.checked) o.elenco.forEach(d => o.pick.add(d.id));
      else o.elenco.forEach(d => o.pick.delete(d.id));
      o.rerender();
    });
    area.querySelectorAll('.row-check').forEach(ch => ch.addEventListener('click', e => {
      e.stopPropagation();
      if(e.target.checked) o.pick.add(ch.dataset.id); else o.pick.delete(ch.dataset.id);
      o.rerender();
    }));
    area.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
      o.openForm(o.elenco.find(x => x.id === btn.dataset.edit));
    }));
    area.querySelectorAll('tbody tr[data-id]').forEach(tr => tr.addEventListener('click', e => {
      if(e.target.closest('button, input, a, select')) return;
      if(o.onSpecialRow && o.onSpecialRow(tr)) return;
      o.openForm(o.elenco.find(x => x.id === tr.dataset.id));
    }));
  }

  // ---- form: stampa, documenti collegati -----------------------------------------
  // Stampa/Scarica dentro il documento aperto (non nell'elenco dietro la
  // spunta). getDoc() torna il documento in modifica, o null per uno nuovo.
  function bindPrintActions($, coll, getDoc, partyOf, getCompany){
    const print = window.SaasPrint;
    $('f-btn-print').addEventListener('click', () => {
      const doc = getDoc();
      if(doc) print.openPrintWindow(coll, doc, partyOf(doc), getCompany());
    });
    print.bindDownloadMenu($('f-btn-download'), $('f-download-list'));
    const wire = (id, run, label) => $(id).addEventListener('click', async () => {
      const doc = getDoc();
      if(!doc) return;
      const btn = $(id);
      btn.disabled = true;
      try{ await run(coll, doc, partyOf(doc), getCompany()); }
      catch(err){ alert(`Errore durante la generazione ${label}: ` + (err.message || err)); }
      finally{ btn.disabled = false; }
    });
    wire('f-dl-pdf', (...a) => print.downloadPDF(...a), 'del PDF');
    wire('f-dl-excel', (...a) => print.downloadExcel(...a), 'del file Excel');
  }
  // Box "Documenti collegati" (app/lineage.js): nascosto per un documento
  // nuovo o se il diagramma non ha nulla da mostrare; un errore non deve
  // bloccare il resto del form.
  async function renderLineagePanel(store, companyId, panel, container, coll, doc){
    if(!doc){ panel.hidden = true; return; }
    try{
      const docs = await window.SaasLineage.loadAll(store, companyId);
      panel.hidden = !window.SaasLineage.renderInto(container, coll, doc, docs);
    }catch(e){ panel.hidden = true; }
  }
  // Apertura diretta da un nodo del box "Documenti collegati" cliccato in
  // un altro modulo.
  async function openPendingFromLineage(store, companyId, coll, openForm){
    const pendingNum = window.SaasLineage.consumePendingOpenNum(coll);
    if(!pendingNum) return;
    const all = await store.loadCollection(coll, companyId);
    const found = all.find(x => x.num === pendingNum);
    if(found) await openForm(found);
  }

  // ---- avvio pagina ----------------------------------------------------------------
  async function doLogout(store){
    await store.signOut();
    localStorage.removeItem('saas_company_id');
    localStorage.removeItem('saas_company_nome');
    location.href = 'index.html';
  }
  // Sessione, azienda corrente e barra di navigazione. Torna null (dopo
  // aver già rimandato a index.html) se manca la sessione o l'azienda.
  async function initPage(store, navKey){
    const session = await store.getSession();
    if(!session){ location.href = 'index.html'; return null; }
    const companyId = localStorage.getItem('saas_company_id');
    if(!companyId){ location.href = 'index.html'; return null; }
    let company = {};
    try{ company = await store.getCompany(companyId); }catch(e){ company = {}; } // senza dati azienda niente intestazione di stampa, ma la pagina resta usabile
    window.SaasNav.render(navKey, {
      companyName: localStorage.getItem('saas_company_nome') || 'Azienda',
      email: session.user.email,
      onLogout: () => doLogout(store),
    });
    return { session, companyId, company };
  }

  window.SaasDocPage = {
    today, esc, eur, itDate,
    scParts, scFactor, scEff, lineNet, rigaTotale, docTotale, impTot, ivaTot,
    sortCmp, thHtml, toggleSort, sortByNome, partyOptionsHtml, matchesText, bindSearch, inDateRange, ordineCompleto,
    showMsg,
    bindRowDrag, markLastBadge, clearLastBadge, evasioneCellsHtml, renderEvasioneSummary,
    lastLinePrice, linePriceHistory, repriceRows,
    fillDestOptions, destSubHtml,
    firstDigits, lastDigits, findOrdineByRiferimento,
    loadList, bindElenco,
    bindPrintActions, renderLineagePanel, openPendingFromLineage,
    doLogout, initPage,
  };
})();
