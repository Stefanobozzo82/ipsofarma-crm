/* ============================================================================
 * store.js — l'adattatore di persistenza per il nuovo prodotto multi-azienda
 *
 * Nel gestionale attuale (index.html), migliaia di punti sparsi nel codice
 * leggono e scrivono direttamente DB.ordiniCliente, DB.fattureCliente ecc.,
 * poi chiamano persist() — che salva in locale e programma un salvataggio su
 * GitHub (ghScheduleSave → ghSave). Questo file è il rimpiazzo di QUELLA
 * parte soltanto: dove oggi c'è "parla con GitHub", qui c'è "parla con
 * Supabase". La forma degli oggetti che il resto del gestionale già usa
 * (id, num, data, clienteId, righe, paid, paidDate, ...) resta la stessa:
 * è la ragione per cui le tabelle Supabase hanno quelle colonne precise
 * (vedi supabase/migrations/0002 e 0003) e perché ogni colonna meno comune
 * finisce in una colonna "extra" invece di essere persa.
 *
 * Cosa NON risolve ancora questo file (di proposito, per restare onesti sullo
 * stato del lavoro):
 *   - nextNum()/consumeNum() nel gestionale sono SINCRONI (DB.counters[t]++),
 *     mentre nextNumber() qui sotto è una chiamata di rete asincrona
 *     (next_document_number() lato database, l'unica che garantisce
 *     numerazione mai duplicata — vedi 0004_numerazione.sql). Collegare
 *     questo store ai punti del gestionale che creano documenti richiederà
 *     rendere asincrono anche quel passaggio: è la prossima decisione di
 *     disegno da prendere, non ancora presa qui.
 *   - "prodotti" (il catalogo, ~21.000 righe in Ipsofarma) non è ancora
 *     mappato: la sua forma reale in catalogo.json non è stata ancora presa
 *     in esame nel dettaglio, e i nuovi clienti del SaaS partirebbero
 *     comunque con un catalogo vuoto o importato da un file proprio, non da
 *     quello di Ipsofarma.
 * ============================================================================
 */

(function (global) {
  'use strict';

  let _client = null;
  function client() {
    if (!_client) {
      if (!global.supabase) throw new Error('supabase-js non è caricato: includi lo script UMD prima di store.js');
      _client = global.supabase.createClient(global.SUPABASE_URL, global.SUPABASE_ANON_KEY);
    }
    return _client;
  }

  // Per ogni collection del gestionale: la tabella Postgres corrispondente,
  // il prefisso di numerazione (se è un documento numerato) e la mappa
  // "campo dell'oggetto JS" -> "colonna della tabella". Qualunque campo
  // dell'oggetto che NON è in questa mappa finisce nella colonna "extra"
  // (jsonb) invece di andare perso — così un campo poco comune, o aggiunto
  // in futuro al gestionale, non fa fallire silenziosamente il salvataggio.
  const COLLECTIONS = {
    clienti: { table: 'clienti', cols: {
      tipo:'tipo', nome:'nome', piva:'piva', cf:'cf', sdi:'sdi', pec:'pec', split:'split', esig:'esig',
      via:'via', cap:'cap', citta:'citta', prov:'prov', pag:'pag', term:'term', iban:'iban',
      ref:'ref', tel:'tel', email:'email', note:'note', dest:'dest',
    }, hasExtra:false },
    fornitori: { table: 'fornitori', cols: {
      tipo:'tipo', nome:'nome', piva:'piva', cf:'cf', pec:'pec',
      via:'via', cap:'cap', citta:'citta', prov:'prov', pag:'pag', term:'term', iban:'iban',
      ref:'ref', tel:'tel', email:'email', note:'note',
    }, hasExtra:false },
    preventivi: { table: 'preventivi', numbered: 'PREV', cols: {
      num:'num', data:'data', clienteId:'cliente_id', righe:'righe', note:'note', ocId:'oc_id',
    }, hasExtra:true },
    ordiniCliente: { table: 'ordini_cliente', numbered: 'OC', cols: {
      num:'num', data:'data', clienteId:'cliente_id', righe:'righe', prevId:'prev_id',
    }, hasExtra:true },
    ordiniFornitore: { table: 'ordini_fornitore', numbered: 'OF', cols: {
      num:'num', data:'data', fornitoreId:'fornitore_id', righe:'righe', ftfIds:'ftf_ids',
    }, hasExtra:true },
    ddt: { table: 'ddt', numbered: 'DDT', cols: {
      num:'num', data:'data', clienteId:'cliente_id', ocId:'oc_id', righe:'righe', destId:'dest_id',
    }, hasExtra:true },
    fattureCliente: { table: 'fatture_cliente', numbered: 'FT', cols: {
      num:'num', data:'data', clienteId:'cliente_id', ddtId:'ddt_id', ocId:'oc_id', righe:'righe',
      paid:'paid', paidDate:'paid_date', pagamenti:'pagamenti', destId:'dest_id',
    }, hasExtra:true },
    fattureFornitore: { table: 'fatture_fornitore', numbered: 'FTF', cols: {
      num:'num', data:'data', fornitoreId:'fornitore_id', ofId:'of_id', righe:'righe',
      paid:'paid', paidDate:'paid_date', pagamenti:'pagamenti',
    }, hasExtra:true },
    noteCredito: { table: 'note_credito', numbered: 'NC', cols: {
      num:'num', data:'data', clienteId:'cliente_id', fatturaId:'fattura_id', righe:'righe',
    }, hasExtra:true },
    noteCreditoFornitore: { table: 'note_credito_fornitore', numbered: 'NCF', cols: {
      num:'num', data:'data', fornitoreId:'fornitore_id', fatturaId:'fattura_id', righe:'righe',
    }, hasExtra:true },
  };

  const SYSTEM_COLS = new Set(['id', 'company_id', 'created_at', 'updated_at', 'extra']);

  // riga Postgres -> oggetto nella stessa forma già usata da DB.<collection> nel gestionale
  function rowToDoc(collName, row) {
    const def = COLLECTIONS[collName];
    const doc = def.hasExtra ? Object.assign({}, row.extra || {}) : {};
    doc.id = row.id;
    Object.entries(def.cols).forEach(([jsField, pgCol]) => { doc[jsField] = row[pgCol]; });
    return doc;
  }

  // oggetto del gestionale -> riga da scrivere su Postgres (per insert o update)
  function docToRow(collName, doc, companyId) {
    const def = COLLECTIONS[collName];
    const row = { company_id: companyId };
    if (doc.id) row.id = doc.id;
    const mappedJsFields = new Set(Object.keys(def.cols));
    Object.entries(def.cols).forEach(([jsField, pgCol]) => {
      if (doc[jsField] !== undefined) row[pgCol] = doc[jsField];
    });
    if (def.hasExtra) {
      const extra = {};
      Object.keys(doc).forEach(k => { if (k !== 'id' && !mappedJsFields.has(k)) extra[k] = doc[k]; });
      row.extra = extra;
    }
    return row;
  }

  // ---------------------------------------------------------------------------
  // Autenticazione e azienda (Fase 1)
  // ---------------------------------------------------------------------------
  async function signUp(email, password) { return client().auth.signUp({ email, password }); }
  async function signIn(email, password) { return client().auth.signInWithPassword({ email, password }); }
  async function signOut() { return client().auth.signOut(); }
  async function getSession() { const { data } = await client().auth.getSession(); return data.session; }

  async function myMemberships() {
    const { data, error } = await client().from('my_memberships').select('*');
    if (error) throw error;
    return data;
  }

  async function registerCompany(nome, slug) {
    const { data, error } = await client().rpc('register_company', { p_nome: nome, p_slug: slug });
    if (error) throw error;
    return data[0];
  }

  // ---------------------------------------------------------------------------
  // Lettura: ricompone un oggetto DB-shaped, come quello che oggi arriva da
  // ghFetchBoth() — l'intera azienda in un colpo solo.
  // ---------------------------------------------------------------------------
  async function loadCompany(companyId) {
    const names = Object.keys(COLLECTIONS);
    const results = await Promise.all(names.map(name =>
      client().from(COLLECTIONS[name].table).select('*').eq('company_id', companyId)
    ));
    const db = {};
    names.forEach((name, i) => {
      const { data, error } = results[i];
      if (error) throw error;
      db[name] = data.map(row => rowToDoc(name, row));
    });
    return db;
  }

  // ---------------------------------------------------------------------------
  // Scrittura di un singolo documento — sostituisce il "push in DB.xxx +
  // persist()" del gestionale attuale. Un id già presente aggiorna la riga
  // esistente; nessun id ne crea una nuova (l'id lo assegna Postgres).
  // ---------------------------------------------------------------------------
  async function saveDoc(collName, doc, companyId) {
    const def = COLLECTIONS[collName];
    if (!def) throw new Error('collection sconosciuta: ' + collName);
    const row = docToRow(collName, doc, companyId);
    const { data, error } = await client().from(def.table).upsert(row).select().single();
    if (error) throw error;
    return rowToDoc(collName, data);
  }

  async function removeDoc(collName, id) {
    const def = COLLECTIONS[collName];
    if (!def) throw new Error('collection sconosciuta: ' + collName);
    const { error } = await client().from(def.table).delete().eq('id', id);
    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Numerazione — sostituisce nextNum()/consumeNum(). A differenza
  // dell'originale è asincrona: vedi la nota in testa al file.
  // ---------------------------------------------------------------------------
  async function nextNumber(companyId, prefix, anno) {
    const { data, error } = await client().rpc('next_document_number', {
      p_company_id: companyId, p_doc_type: prefix, p_anno: anno,
    });
    if (error) throw error;
    return data;
  }

  global.SaasStore = {
    COLLECTIONS, signUp, signIn, signOut, getSession,
    myMemberships, registerCompany, loadCompany, saveDoc, removeDoc, nextNumber,
  };
})(window);
