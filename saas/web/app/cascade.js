/* ============================================================================
 * cascade.js — la cascata ordine → DDT → fattura, e ordine → ordine
 * fornitore → ricezione (porta di aiGenDDT()/aiGenFT()/genOFFromOC()/
 * markOFReceived() dal gestionale originale — vedi la sezione dedicata nel
 * README per il contesto completo).
 *
 * Fattorizzato qui, invece di restare inline in ordini.html/ddt.html/
 * fatture.html/fatture-fornitore.html, per un motivo preciso: le stesse
 * operazioni servono anche all'assistente AI ("Esegui un'azione" in
 * assistente-ai.html — generate_ddt/generate_invoice/generate_supplier_order),
 * che le esegue in modo "headless" (nessuna pagina intermedia da rivedere a
 * mano, l'anteprima del piano fa quel lavoro). Tenere UNA sola versione di
 * ogni pezzo evita che le due strade (bottone manuale / azione IA) possano
 * divergere silenziosamente — esattamente la classe di bug già trovata e
 * corretta una volta in questa cascata (l'editor delle righe che azzerava
 * qtyEv non sapendo che esisteva): con la logica in un posto solo non può
 * ripresentarsi in un secondo posto.
 *
 * Le funzioni "applica*" sono pure (nessuna chiamata allo store): calcolano
 * il nuovo oggetto documento, ma è chi le chiama a salvarlo — così un
 * salvataggio manuale (dentro un f-save già esistente, con le sue verifiche)
 * e un salvataggio automatico (dentro un'azione IA) possono entrambi
 * costruire lo stesso identico risultato. Le funzioni "crea*"/"genera*" fanno
 * anche l'I/O (store.saveDoc/nextNumber/loadCollection/searchProdotti): sono
 * quelle che l'azione IA chiama direttamente.
 * ============================================================================ */

(function (global) {
  'use strict';

  function today() { return new Date().toISOString().slice(0, 10); }

  // Quanto di ogni riga di un ordine cliente è già stato consegnato
  // (qtyEv, via un DDT) e quanto resta — un ordine mai toccato dalla
  // cascata ha qtyEv assente su ogni riga, equivalente a 0.
  function residuoRighe(ordine) {
    return (ordine.righe || []).map(r => ({ ...r, consegnato: r.qtyEv || 0, residuo: Math.max(0, (r.qty || 0) - (r.qtyEv || 0)) }));
  }

  // Etichetta di stato ("✓ <verbo>" / "Parziale X/Y") da un elenco di righe
  // con qty/qtyEv — usata sia per "Consegnato" (ordini cliente) sia per
  // "Ricevuto" (ordini fornitore): stesso calcolo, verbo diverso.
  function statoEvasione(righe, verbo) {
    const totQ = (righe || []).reduce((s, r) => s + (r.qty || 0), 0);
    const fatto = (righe || []).reduce((s, r) => s + (r.qtyEv || 0), 0);
    if (totQ === 0 || fatto === 0) return null;
    return fatto >= totQ ? { label: '✓ ' + verbo, cls: 'ok' } : { label: `Parziale ${fatto}/${totQ}`, cls: 'info' };
  }

  // Nuovo oggetto ordine cliente con qtyEv/ddtIds aggiornati dopo aver
  // consegnato righeConsegnate con un DDT numero ddtNum. Pura: non salva.
  function applicaConsegna(ordine, righeConsegnate, ddtNum) {
    const nuoveRighe = (ordine.righe || []).map(r => {
      const consegnata = righeConsegnate.filter(x => x.cod === r.cod).reduce((s, x) => s + (x.qty || 0), 0);
      return consegnata ? Object.assign({}, r, { qtyEv: Math.min(r.qty, (r.qtyEv || 0) + consegnata) }) : r;
    });
    const ddtIds = [...new Set([...(ordine.ddtIds || []), ddtNum])];
    return Object.assign({}, ordine, { righe: nuoveRighe, ddtIds, ddtId: ddtNum });
  }

  // Nuovo oggetto ordine cliente con ftIds aggiornato dopo aver fatturato
  // un DDT collegato, numero fattura ftNum. Pura: non salva.
  function applicaFatturazione(ordine, ftNum) {
    const ftIds = [...new Set([...(ordine.ftIds || []), ftNum])];
    return Object.assign({}, ordine, { ftIds, ftId: ftNum });
  }

  // Nuovo oggetto ordine fornitore con qtyEv aggiornato dopo aver
  // registrato una fattura fornitore collegata con righeFatturate — porta
  // semplificata di markOFReceived(): qui "fatturato" vale come "ricevuto"
  // (nessun tracciamento separato arrivo/fattura). Pura: non salva.
  function applicaRicezione(of, righeFatturate) {
    const nuoveRighe = (of.righe || []).map(r => {
      const fatturata = righeFatturate.filter(x => x.cod === r.cod).reduce((s, x) => s + (x.qty || 0), 0);
      return fatturata ? Object.assign({}, r, { qtyEv: Math.min(r.qty, (r.qtyEv || 0) + fatturata) }) : r;
    });
    return Object.assign({}, of, { righe: nuoveRighe });
  }

  // Crea un DDT dal residuo PIENO di un ordine (tutto quanto non ancora
  // consegnato, in un colpo solo) e aggiorna l'ordine di conseguenza —
  // "headless": nessuna revisione manuale prima di salvare, usata
  // dall'azione IA generate_ddt (ordini.html/generaDDT() invece apre
  // ddt.html per farlo rivedere prima, un'esperienza diversa apposta per
  // un umano). Ritorna {ddt, ordine} o null se non c'è nulla da consegnare.
  async function creaDDTDaResiduo(store, companyId, ordine) {
    const residuo = residuoRighe(ordine).filter(r => r.residuo > 0);
    if (!residuo.length) return null;
    const righe = residuo.map(r => ({ cod: r.cod, descr: r.descr, qty: r.residuo, lotto: '', scad: '' }));
    const anno = Number((ordine.data || today()).slice(0, 4)) || Number(today().slice(0, 4));
    const num = await store.nextNumber(companyId, 'DDT', anno);
    const ddt = await store.saveDoc('ddt', { num, data: today(), clienteId: ordine.clienteId, ocId: ordine.id, righe }, companyId);
    const ordineAgg = applicaConsegna(ordine, righe, ddt.num);
    await store.saveDoc('ordiniCliente', ordineAgg, companyId);
    return { ddt, ordine: ordineAgg };
  }

  // Genera la fattura di OGNI DDT dell'ordine non ancora fatturato — porta
  // di aiGenFT() (che nell'originale fattura "tutti i DDT non ancora
  // fatturati" di un ordine, non uno alla volta): usata dall'azione IA
  // generate_invoice. ddt.html/fatture.html restano il percorso manuale
  // (un DDT alla volta, con revisione prima di salvare). Ritorna
  // {fatture, ordine} — fatture è un array, può essere vuoto.
  async function creaFattureDaOrdine(store, companyId, ordine, tuttiDdt) {
    const ddtOrdine = (tuttiDdt || []).filter(d => d.ocId === ordine.id && !d.ftId);
    const fatture = [];
    let ordineCorrente = ordine;
    for (const ddt of ddtOrdine) {
      const anno = Number((ddt.data || today()).slice(0, 4)) || Number(today().slice(0, 4));
      const num = await store.nextNumber(companyId, 'FT', anno);
      const ft = await store.saveDoc('fattureCliente', {
        num, data: today(), clienteId: ddt.clienteId, ddtId: ddt.id, ocId: ordine.id,
        destId: ddt.destId || null, righe: ddt.righe, paid: false, paidDate: null, pagamenti: [],
      }, companyId);
      await store.saveDoc('ddt', Object.assign({}, ddt, { ftId: ft.num }), companyId);
      ordineCorrente = applicaFatturazione(ordineCorrente, ft.num);
      fatture.push(ft);
    }
    if (fatture.length) await store.saveDoc('ordiniCliente', ordineCorrente, companyId);
    return { fatture, ordine: ordineCorrente };
  }

  // Quali righe dell'ordine cliente non sono ancora coperte da nessun
  // ordine fornitore già collegato (ofIds) — un solo posto per questa
  // query, usata sia da generaOrdiniFornitore() per sapere cosa creare
  // sia da statoOrdineFornitore() per l'etichetta nel form (ordini.html),
  // così le due non possano mai raccontare stati diversi.
  async function righeNonOrdinate(store, companyId, ordine) {
    const ofNums = ordine.ofIds && ordine.ofIds.length ? ordine.ofIds : (ordine.ofId ? [ordine.ofId] : []);
    let existingOFs = [];
    if (ofNums.length) {
      const tutti = await store.loadCollection('ordiniFornitore', companyId);
      existingOFs = tutti.filter(of => ofNums.includes(of.num));
    }
    const covered = new Set();
    existingOFs.forEach(of => (of.righe || []).forEach(r => covered.add(r.cod)));
    const missing = (ordine.righe || []).filter(r => r.cod && !covered.has(r.cod));
    return { ofNums, existingOFs, missing };
  }

  // Etichetta/stato per il bottone "Genera ordine fornitore" nel form di
  // ordini.html — stessa logica a tre stati del vecchio gestionale
  // (genOF()/ofBtnLabel): "→ Genera" (nessun OF ancora), "+ Ordina N
  // mancanti" (OF presente ma incompleto, es. articoli aggiunti dopo), "✓"
  // (tutto coperto, disabilitato). Richiede una chiamata di rete
  // (righeNonOrdinate legge gli ordini fornitore collegati), quindi non è
  // gratis come statoEvasione() — va chiamata solo quando serve mostrarla.
  async function statoOrdineFornitore(store, companyId, ordine) {
    const { ofNums, missing } = await righeNonOrdinate(store, companyId, ordine);
    if (!ofNums.length) return { label: '→ Genera ordine fornitore', done: false };
    if (missing.length) return { label: `+ Ordina ${missing.length} articol${missing.length > 1 ? 'i' : 'o'} mancant${missing.length > 1 ? 'i' : 'e'}`, done: false };
    return { label: '✓ Ordine fornitore', done: true };
  }

  // Genera (o aggiorna) uno o più ordini fornitore per procurarsi quanto
  // serve a soddisfare un ordine cliente — porta di genOFFromOC(): usata
  // sia dal bottone "🏭 Ord.forn." in ordini.html sia dall'azione IA
  // generate_supplier_order. Raggruppa le righe non ancora coperte da un
  // ordine fornitore già collegato, per fornitore abituale del prodotto
  // (catalogo) — usa il listino di acquisto come prezzo (l'originale
  // guarda l'ultimo prezzo pagato, funzione non ancora portata nel SaaS).
  // Idempotente: richiamarla quando è già tutto coperto non crea nulla.
  async function generaOrdiniFornitore(store, companyId, ordine) {
    const { ofNums, existingOFs, missing } = await righeNonOrdinate(store, companyId, ordine);
    if (!missing.length) return { created: [], updated: [], senzaFornitore: [], ordine };
    const trovati = await Promise.all(missing.map(r => store.searchProdotti(companyId, r.cod, 5).catch(() => [])));
    const groups = new Map();
    const senzaFornitore = [];
    missing.forEach((r, i) => {
      const prod = (trovati[i] || []).find(p => (p.cod || '').toLowerCase() === r.cod.toLowerCase());
      const fid = prod && prod.fornitoreId;
      if (!fid) { senzaFornitore.push(r.cod); return; } // prodotto senza fornitore assegnato nel catalogo: non possiamo indovinare a chi ordinarlo
      const line = { cod: r.cod, descr: r.descr, qty: r.qty, prezzo: prod.listinoAcq || 0, sconto: '', iva: prod.iva || r.iva || 22 };
      if (!groups.has(fid)) groups.set(fid, []);
      groups.get(fid).push(line);
    });
    if (!groups.size) return { created: [], updated: [], senzaFornitore, ordine };
    const created = [], updated = [];
    const anno = Number(today().slice(0, 4));
    for (const [fid, righeNuove] of groups) {
      const target = existingOFs.find(of => of.fornitoreId === fid);
      if (target) {
        const saved = await store.saveDoc('ordiniFornitore', Object.assign({}, target, { righe: [...(target.righe || []), ...righeNuove] }), companyId);
        updated.push(saved);
      } else {
        const num = await store.nextNumber(companyId, 'OF', anno);
        const saved = await store.saveDoc('ordiniFornitore', { num, data: today(), fornitoreId: fid, righe: righeNuove, ocId: ordine.num }, companyId);
        created.push(saved);
      }
    }
    const newOfIds = [...new Set([...ofNums, ...created.map(x => x.num)])];
    const ordineAgg = Object.assign({}, ordine, { ofIds: newOfIds, ofId: newOfIds[newOfIds.length - 1] });
    await store.saveDoc('ordiniCliente', ordineAgg, companyId);
    return { created, updated, senzaFornitore, ordine: ordineAgg };
  }

  global.SaasCascade = {
    residuoRighe, statoEvasione, applicaConsegna, applicaFatturazione, applicaRicezione,
    creaDDTDaResiduo, creaFattureDaOrdine, generaOrdiniFornitore, statoOrdineFornitore,
  };
})(window);
