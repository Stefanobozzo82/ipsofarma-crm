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
 *
 * "prodotti" è mappato (vedi COLLECTIONS sotto), ma con una differenza
 * voluta rispetto alle altre collection: loadCollection() scaricherebbe
 * TUTTO il catalogo (21.278 righe per Ipsofarma) solo per mostrarne una
 * pagina — usa invece searchProdotti(), che filtra e limita lato server.
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
    prodotti: { table: 'prodotti', cols: {
      cod:'cod', descr:'descr', fornitoreId:'fornitore_id',
      listinoAcq:'listino_acq', listinoVen:'listino_ven', iva:'iva', unita:'unita',
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
  // Abbonamenti (Fase 5). getCompany()/loadPlans() sono letture dirette (RLS
  // già le protegge: companies è visibile solo ai membri, plans è pubblica).
  // startCheckout() invece passa SEMPRE dall'Edge Function stripe-checkout:
  // è lì che vive la chiave segreta Stripe, mai nel client.
  // ---------------------------------------------------------------------------
  async function getCompany(companyId) {
    const { data, error } = await client().from('companies').select('*').eq('id', companyId).single();
    if (error) throw error;
    return data;
  }

  async function loadPlans() {
    const { data, error } = await client().from('plans').select('*').order('prezzo_mensile');
    if (error) throw error;
    return data;
  }

  // Tutte le tabelle che contano come "documento" ai fini del limite
  // mensile del piano — le stesse 8 di COLLECTIONS meno le anagrafiche
  // (clienti/fornitori/prodotti non sono documenti).
  const DOC_TABLES = ['preventivi', 'ordini_cliente', 'ordini_fornitore', 'ddt',
    'fatture_cliente', 'fatture_fornitore', 'note_credito', 'note_credito_fornitore'];

  async function countDocsThisMonth(companyId) {
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    const iso = start.toISOString();
    const results = await Promise.all(DOC_TABLES.map(t =>
      client().from(t).select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', iso)
    ));
    results.forEach(({ error }) => { if (error) throw error; });
    return results.reduce((sum, r) => sum + (r.count || 0), 0);
  }

  // ---------------------------------------------------------------------------
  // Team (Fase 6 bis). Un utente entra in un'azienda ALTRUI solo accettando
  // un invito (accept_invite, chiamato da index.html) — mai con un insert
  // diretto: le funzioni server-side sono l'unico varco, stesso principio
  // di register_company (vedi 0008_inviti.sql). Cambio ruolo e rimozione di
  // un membro restano invece un update/delete diretto su memberships: la
  // RLS ("admin gestisce le utenze della propria azienda") già li permette
  // solo a un admin della stessa azienda.
  // ---------------------------------------------------------------------------
  async function listMembers(companyId) {
    const { data, error } = await client().rpc('list_members', { p_company_id: companyId });
    if (error) throw error;
    return data;
  }

  async function listInvites(companyId) {
    const { data, error } = await client().from('invites').select('*')
      .eq('company_id', companyId).is('accepted_at', null).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async function createInvite(companyId, email, role) {
    const { data, error } = await client().rpc('create_invite', { p_company_id: companyId, p_email: email, p_role: role });
    if (error) throw error;
    return data;
  }

  async function revokeInvite(inviteId) {
    const { error } = await client().from('invites').delete().eq('id', inviteId);
    if (error) throw error;
  }

  async function updateMemberRole(companyId, userId, role) {
    const { error } = await client().from('memberships').update({ role }).eq('company_id', companyId).eq('user_id', userId);
    if (error) throw error;
  }

  async function removeMember(companyId, userId) {
    const { error } = await client().from('memberships').delete().eq('company_id', companyId).eq('user_id', userId);
    if (error) throw error;
  }

  // Da chiamare prima di creare un NUOVO documento (mai per una modifica:
  // il limite è sulla creazione, non sulla modifica di uno già esistente).
  // { ok:true } se il piano non ha un limite (null = illimitato, come
  // "Base" e "Pro" oggi) o se non è ancora stato raggiunto.
  async function checkDocLimit(companyId) {
    const [company, plans] = await Promise.all([getCompany(companyId), loadPlans()]);
    const plan = plans.find(p => p.id === company.piano);
    if (!plan || plan.limite_documenti_mese == null) return { ok: true };
    const count = await countDocsThisMonth(companyId);
    return { ok: count < plan.limite_documenti_mese, count, limite: plan.limite_documenti_mese, piano: plan.nome };
  }

  // Uso mensile dell'IA per azienda (0011_limite_ai.sql) — stesso schema di
  // checkDocLimit(), ma qui il freno è sul COSTO (la chiave Gemini è UNA
  // sola, condivisa da tutte le aziende del SaaS — vedi ai-proxy), non sui
  // documenti creati: anche i piani a pagamento hanno un limite, largo ma
  // non infinito. L'applicazione VERA è lato server, in ai-proxy — questa
  // è solo la verifica preventiva per un avviso chiaro nell'interfaccia
  // invece di scoprirlo dopo aver scritto la domanda.
  async function checkAiLimit(companyId) {
    const [company, plans] = await Promise.all([getCompany(companyId), loadPlans()]);
    const plan = plans.find(p => p.id === company.piano);
    if (!plan || plan.limite_ai_mese == null) return { ok: true };
    const { data: count, error } = await client().rpc('count_ai_usage_this_month', { p_company_id: companyId });
    if (error) throw error;
    return { ok: count < plan.limite_ai_mese, count, limite: plan.limite_ai_mese, piano: plan.nome };
  }

  // ---------------------------------------------------------------------------
  // Magazzino (Fase 6 quater): depositi e movimenti — vedi 0009_magazzino.sql.
  // La giacenza non è mai salvata: è sempre ricalcolata dalla vista
  // "giacenze" (somma dei movimenti), mai una colonna da tenere allineata a
  // mano lato client.
  // ---------------------------------------------------------------------------
  async function listDepositi(companyId) {
    const { data, error } = await client().from('depositi').select('*').eq('company_id', companyId).order('created_at');
    if (error) throw error;
    return data;
  }

  // Da chiamare quando si apre magazzino.html: un'azienda nuova non ha
  // ancora nessun deposito, quindi ne crea uno "Sede principale" al volo
  // (niente trigger lato database — coerente con come companies/plans
  // vengono popolati oggi, tutto lato client alla prima apertura utile).
  async function ensureDefaultDeposito(companyId) {
    const esistenti = await listDepositi(companyId);
    if (esistenti.length > 0) return esistenti;
    const { data, error } = await client().from('depositi')
      .insert({ company_id: companyId, nome: 'Sede principale', predefinito: true })
      .select().single();
    if (error) throw error;
    return [data];
  }

  async function createDeposito(companyId, nome) {
    const { data, error } = await client().from('depositi').insert({ company_id: companyId, nome }).select().single();
    if (error) throw error;
    return data;
  }

  async function renameDeposito(id, nome) {
    const { error } = await client().from('depositi').update({ nome }).eq('id', id);
    if (error) throw error;
  }

  async function removeDeposito(id) {
    const { error } = await client().from('depositi').delete().eq('id', id);
    if (error) throw error;
  }

  // Un movimento è immutabile (vedi commento sulla tabella in
  // 0009_magazzino.sql): niente updateMovimento/removeMovimento apposta, un
  // errore si corregge con una "rettifica" di segno opposto, non
  // modificando la riga sbagliata.
  async function addMovimento(companyId, { prodottoId, depositoId, tipo, quantita, causale }) {
    const session = await getSession();
    const { data, error } = await client().from('movimenti_magazzino').insert({
      company_id: companyId, prodotto_id: prodottoId, deposito_id: depositoId,
      tipo, quantita, causale: causale || null,
      created_by: session ? session.user.id : null,
    }).select().single();
    if (error) throw error;
    return data;
  }

  // Giacenza per un gruppo di prodotti (es. i risultati di una ricerca),
  // tutti i depositi insieme — un'unica query invece di una per prodotto.
  async function giacenzeForProdotti(companyId, prodottoIds) {
    if (!prodottoIds || prodottoIds.length === 0) return [];
    const { data, error } = await client().from('giacenze').select('*')
      .eq('company_id', companyId).in('prodotto_id', prodottoIds);
    if (error) throw error;
    return data;
  }

  async function listMovimentiRecenti(companyId, limit) {
    const { data, error } = await client().from('movimenti_magazzino')
      .select('*, prodotti(cod, descr), depositi(nome)')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(limit || 20);
    if (error) throw error;
    return data;
  }

  // Modifica l'anagrafica azienda (nome, P.IVA, indirizzo...). La RLS di
  // 0001_aziende_e_utenti.sql permette l'update solo a un admin: un
  // operatore che ci provasse otterrebbe zero righe modificate, e
  // .single() lo trasforma in un errore esplicito invece di un
  // fallimento silenzioso. impostazioni-azienda.html nasconde comunque
  // il pulsante di salvataggio a chi non è admin, per non arrivarci mai.
  async function saveCompany(companyId, patch) {
    const { data, error } = await client().from('companies').update(patch).eq('id', companyId).select().single();
    if (error) throw error;
    return data;
  }

  async function startCheckout(companyId, planId, successUrl, cancelUrl) {
    const session = await getSession();
    if (!session) throw new Error('devi essere collegato');
    const res = await fetch(global.SUPABASE_URL + '/functions/v1/stripe-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ company_id: companyId, plan_id: planId, success_url: successUrl, cancel_url: cancelUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('errore HTTP ' + res.status));
    return data; // { url: '...' }
  }

  // ---------------------------------------------------------------------------
  // Invio email (ordine a fornitore, sollecito pagamento a cliente...).
  // Stesso principio di startCheckout()/aiComplete(): il client non parla
  // mai direttamente col provider email (Resend) né vede la sua chiave,
  // passa sempre dall'Edge Function send-email — dove la chiave vive come
  // secret del progetto.
  // ---------------------------------------------------------------------------
  async function sendEmail(payload) {
    const session = await getSession();
    if (!session) throw new Error('devi essere collegato');
    const res = await fetch(global.SUPABASE_URL + '/functions/v1/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('errore HTTP ' + res.status));
    return data;
  }

  // ---------------------------------------------------------------------------
  // Assistente AI (Fase 6). Stesso principio di startCheckout(): il client
  // non parla mai direttamente col provider IA né vede la sua chiave, passa
  // sempre dall'Edge Function ai-proxy (Fase 3) — dove la chiave Gemini vive
  // come secret del progetto. Il corpo è quasi identico a quello che
  // aiComplete() in index.html costruisce per il provider 'openai'
  // (l'endpoint compatibile OpenAI di Gemini): {model, temperature,
  // max_tokens, messages}, con l'aggiunta di companyId — obbligatorio da
  // quando esiste un limite mensile per azienda (0011_limite_ai.sql):
  // ai-proxy lo usa per sapere contro quale azienda contare la chiamata, e
  // rifiuta la richiesta se manca.
  // ---------------------------------------------------------------------------
  async function aiComplete(messages, opts) {
    opts = opts || {};
    if (!opts.companyId) throw new Error('companyId mancante (bug interno: chi chiama aiComplete deve sempre passarlo)');
    const session = await getSession();
    if (!session) throw new Error('devi essere collegato');
    const res = await fetch(global.SUPABASE_URL + '/functions/v1/ai-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({
        model: opts.model || 'gemini-2.5-flash',
        temperature: opts.temperature != null ? opts.temperature : 0.3,
        max_tokens: opts.maxTokens || 900,
        companyId: opts.companyId,
        messages,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && (data.error.message || data.error)) || ('errore HTTP ' + res.status));
    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!reply) throw new Error('risposta vuota o inattesa dal provider IA');
    return reply;
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

  // Come loadCompany(), ma per una sola collection: usata dalle pagine che
  // mostrano un solo modulo (es. la lista clienti) invece dell'intera azienda.
  async function loadCollection(collName, companyId) {
    const def = COLLECTIONS[collName];
    if (!def) throw new Error('collection sconosciuta: ' + collName);
    const { data, error } = await client().from(def.table).select('*').eq('company_id', companyId);
    if (error) throw error;
    return data.map(row => rowToDoc(collName, row));
  }

  // Catalogo prodotti: filtrato e limitato lato server, mai scaricato per
  // intero (21.278 righe per Ipsofarma — vedi nota in testa al file). Query
  // vuota -> gli ultimi prodotti per codice, utile come punto di partenza.
  async function searchProdotti(companyId, query, limit) {
    limit = limit || 100;
    // '.or()' di supabase-js usa la virgola come separatore di condizioni:
    // una virgola nel testo digitato spezzerebbe il filtro. Il catalogo non
    // ha mai codici/descrizioni con virgole (verificato sui dati reali), ma
    // la rimuoviamo comunque per non dipendere da quella coincidenza.
    const q = (query || '').trim().replace(/[,()%]/g, '');
    let req = client().from('prodotti').select('*').eq('company_id', companyId).order('cod').limit(limit);
    if (q) req = req.or(`cod.ilike.%${q}%,descr.ilike.%${q}%`);
    const { data, error } = await req;
    if (error) throw error;
    return data.map(row => rowToDoc('prodotti', row));
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

  // "Anteprima" del prossimo numero SENZA consumarlo — a differenza di
  // nextNumber() (atomica, incrementa sempre): serve solo a precompilare
  // il campo "Numero" nel form (che l'utente può comunque sovrascrivere,
  // vedi 0012_numero_manuale.sql). Legge direttamente document_counters,
  // già leggibile da ogni membro via RLS (0004): nessun contatore ancora
  // creato per quell'anno/tipo equivale a "il prossimo è 0001".
  async function peekNumber(companyId, prefix, anno) {
    const { data, error } = await client().from('document_counters').select('next_value')
      .eq('company_id', companyId).eq('doc_type', prefix).eq('anno', anno).maybeSingle();
    if (error) throw error;
    const next = data ? data.next_value : 1;
    return prefix + '/' + anno + '/' + String(next).padStart(4, '0');
  }

  // Chiamata quando l'utente scrive A MANO un numero diverso da quello
  // proposto (nuovo documento, o numero cambiato modificandone uno
  // esistente): se il testo rispetta il formato PREFISSO/ANNO/NNNN e il
  // contatore ha già raggiunto o superato NNNN non c'è nulla da fare;
  // altrimenti sposta in avanti il contatore così i PROSSIMI numeri
  // automatici continuano dopo quello scritto a mano, invece di
  // ripeterlo. Un testo libero che non rispetta il formato (es. un
  // numero del vecchio gestionale) non tocca il contatore: non c'è una
  // sequenza da dedurne — stessa logica di consumeNum() nell'originale.
  async function bumpCounterPast(companyId, prefix, value) {
    const m = String(value || '').match(new RegExp('^' + prefix + '/(\\d{4})/(\\d+)$'));
    if (!m) return;
    const anno = parseInt(m[1], 10);
    const n = parseInt(m[2], 10);
    const { error } = await client().rpc('bump_document_counter', {
      p_company_id: companyId, p_doc_type: prefix, p_anno: anno, p_almeno: n + 1,
    });
    if (error) throw error;
  }

  global.SaasStore = {
    COLLECTIONS, signUp, signIn, signOut, getSession,
    myMemberships, registerCompany, loadCompany, loadCollection, saveDoc, removeDoc, nextNumber,
    peekNumber, bumpCounterPast,
    getCompany, loadPlans, startCheckout, searchProdotti, saveCompany, aiComplete, checkDocLimit, checkAiLimit,
    listMembers, listInvites, createInvite, revokeInvite, updateMemberRole, removeMember, sendEmail,
    listDepositi, ensureDefaultDeposito, createDeposito, renameDeposito, removeDeposito,
    addMovimento, giacenzeForProdotti, listMovimentiRecenti,
  };
})(window);
