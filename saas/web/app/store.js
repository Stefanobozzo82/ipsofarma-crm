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
      num:'num', data:'data', clienteId:'cliente_id', righe:'righe', note:'note', ocId:'oc_id', destId:'dest_id',
    }, hasExtra:true },
    ordiniCliente: { table: 'ordini_cliente', numbered: 'OC', cols: {
      num:'num', data:'data', clienteId:'cliente_id', righe:'righe', prevId:'prev_id', destId:'dest_id',
    }, hasExtra:true },
    ordiniFornitore: { table: 'ordini_fornitore', numbered: 'OF', cols: {
      num:'num', data:'data', fornitoreId:'fornitore_id', righe:'righe', ftfIds:'ftf_ids',
    }, hasExtra:true },
    ddt: { table: 'ddt', numbered: 'DDT', cols: {
      num:'num', data:'data', clienteId:'cliente_id', ocId:'oc_id', righe:'righe', destId:'dest_id',
    }, hasExtra:true },
    // Speculare a "ddt", ma verso un fornitore invece che un cliente — e
    // senza destId: non esiste una "destinazione di consegna" quando la
    // consegna è verso di noi, sempre nello stesso posto. Vedi la nota nel
    // README ("DDT fornitore") sul perché esiste: il momento in cui si
    // segna "è arrivata la merce" (qtyEv) ora può avvenire QUI, quando
    // arriva davvero il pacco, invece che aspettare la fattura del
    // fornitore (che può arrivare settimane dopo).
    ddtFornitore: { table: 'ddt_fornitore', numbered: 'DDTF', cols: {
      num:'num', data:'data', fornitoreId:'fornitore_id', ofId:'of_id', righe:'righe',
    }, hasExtra:true },
    fattureCliente: { table: 'fatture_cliente', numbered: 'FT', cols: {
      num:'num', data:'data', clienteId:'cliente_id', ddtId:'ddt_id', ocId:'oc_id', righe:'righe',
      paid:'paid', paidDate:'paid_date', pagamenti:'pagamenti', destId:'dest_id',
    }, hasExtra:true },
    // ddtfId: come ddtId su fatture_cliente — collegamento facoltativo a un
    // DDT fornitore (se il fornitore lo manda). ofId resta valorizzabile
    // anche da solo, per compatibilità con chi non manda DDT: vedi
    // fatture-fornitore.html/f-save.
    fattureFornitore: { table: 'fatture_fornitore', numbered: 'FTF', cols: {
      num:'num', data:'data', fornitoreId:'fornitore_id', ofId:'of_id', ddtfId:'ddtf_id', righe:'righe',
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
  async function signOut() { await cacheClear(); return client().auth.signOut(); }
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

  // Server usage includes all nine document tables and is not refunded by deletion.
  async function countDocsThisMonth(companyId) {
    const { data, error } = await client().rpc('count_documents_this_month', { p_company_id: companyId });
    if (error) throw error;
    return data;
  }

  // ---------------------------------------------------------------------------
  // Team (Fase 6 bis). Un utente entra in un'azienda ALTRUI solo accettando
  // un invito (accept_invite, chiamato da index.html) — mai con un insert
  // diretto: le funzioni server-side sono l'unico varco, stesso principio
  // di register_company. Ruoli, rimozioni e revoche passano dalle RPC della
  // migration 0025, con protezione della capienza e dell'ultimo amministratore.
  // ---------------------------------------------------------------------------
  async function listMembers(companyId) {
    const { data, error } = await client().rpc('list_members', { p_company_id: companyId });
    if (error) throw error;
    return data;
  }

  // Collegamento con Maestro Gold (migration 0038): la chiave per l'agente sul
  // PC di Maestro esce in chiaro solo da createMaestroSyncKey(), una volta.
  async function createMaestroSyncKey(companyId) {
    const { data, error } = await client().rpc('create_maestro_sync_key', { p_company_id: companyId });
    if (error) throw error;
    return data;
  }
  async function maestroSyncStatus(companyId) {
    const { data, error } = await client().rpc('maestro_sync_status', { p_company_id: companyId });
    if (error) throw error;
    return (data && data[0]) || { chiave_attiva: false, creata_at: null, usata_at: null };
  }
  async function listMaestroSyncRuns(companyId, limit = 20) {
    const { data, error } = await client().from('maestro_sync_runs').select('id,tabella,stato,report,created_at,finito_at')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  }
  // Documenti di Maestro che l'import (migration 0039) non ha potuto portare
  // nel gestionale: numeri già usati, numerazioni diverse, righe in arrivo.
  async function listMaestroImportIssues(companyId) {
    const { data, error } = await client().from('maestro_import_log').select('tabella,esito,doc_num,data,controparte,motivo')
      .eq('company_id', companyId).in('esito', ['conflitto', 'in_attesa']).order('data', { ascending: false }).limit(200);
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
    const { error } = await client().rpc('revoke_invite', { p_invite_id: inviteId });
    if (error) throw error;
  }

  async function updateMemberRole(companyId, userId, role) {
    const { error } = await client().rpc('update_member_role', { p_company_id: companyId, p_user_id: userId, p_role: role });
    if (error) throw error;
  }

  async function removeMember(companyId, userId) {
    const { error } = await client().rpc('remove_member', { p_company_id: companyId, p_user_id: userId });
    if (error) throw error;
  }

  // Da chiamare prima di creare un NUOVO documento (mai per una modifica:
  // il limite è sulla creazione, non sulla modifica di uno già esistente).
  // { ok:true } se il piano non ha un limite (null = illimitato, come
  // "Base" e "Pro" oggi) o se non è ancora stato raggiunto.
  //
  // Bug reale trovato: questa chiamata sta PRIMA del blocco try/catch di
  // ogni "Salva" (ordini/ddt/fatture/preventivi/note credito — vedi quei
  // file), quindi un suo errore (rete instabile: countDocsThisMonth() fa
  // 8 query in parallelo, una sola che fallisce basta a far rifiutare
  // l'intero Promise.all) non veniva mai intercettato: il pulsante restava
  // disabilitato per sempre, senza nessun messaggio, e il documento non si
  // salvava — a chi capitava sembrava che l'app si fosse bloccata. Un
  // controllo che dovrebbe solo AVVISARE se il piano è pieno non deve mai
  // poter bloccare il salvataggio vero e proprio: se il controllo stesso
  // fallisce, si lascia passare (si preferisce eccezionalmente superare il
  // limite mensile piuttosto che perdere un documento per un problema di
  // rete che non ha nulla a che fare col limite).
  async function checkDocLimit(companyId) {
    try{
      const [company, plans] = await Promise.all([getCompany(companyId), loadPlans()]);
      const plan = plans.find(p => p.id === company.piano);
      if (!plan || plan.limite_documenti_mese == null) return { ok: true };
      const count = await countDocsThisMonth(companyId);
      return { ok: count < plan.limite_documenti_mese, count, limite: plan.limite_documenti_mese, piano: plan.nome };
    }catch(e){
      return { ok: true };
    }
  }

  // Uso mensile dell'IA per azienda (0011_limite_ai.sql) — stesso schema di
  // checkDocLimit(), ma qui il freno è sul COSTO (la chiave Gemini è UNA
  // sola, condivisa da tutte le aziende del SaaS — vedi ai-proxy), non sui
  // documenti creati: anche i piani a pagamento hanno un limite, largo ma
  // non infinito. L'applicazione VERA è lato server, in ai-proxy — questa
  // è solo la verifica preventiva per un avviso chiaro nell'interfaccia
  // invece di scoprirlo dopo aver scritto la domanda.
  // Stesso "fallisce aperto" di checkDocLimit() qui sopra, a maggior
  // ragione qui: l'applicazione VERA del limite è lato server (ai-proxy),
  // questa è solo l'anteprima nell'interfaccia — un suo errore di rete non
  // deve mai bloccare l'azione che sta solo cercando di descrivere.
  async function checkAiLimit(companyId) {
    try{
      const [company, plans] = await Promise.all([getCompany(companyId), loadPlans()]);
      const plan = plans.find(p => p.id === company.piano);
      if (!plan || plan.limite_ai_mese == null) return { ok: true };
      const { data: count, error } = await client().rpc('count_ai_usage_this_month', { p_company_id: companyId });
      if (error) throw error;
      return { ok: count < plan.limite_ai_mese, count, limite: plan.limite_ai_mese, piano: plan.nome };
    }catch(e){
      return { ok: true };
    }
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

  // Giacenza corrente di OGNI prodotto con almeno un movimento — non
  // l'intero catalogo (~21.278 righe): "giacenze" (0009_magazzino.sql) è
  // una VISTA che raggruppa i movimenti per prodotto/deposito, quindi
  // esiste solo per i prodotti che ne hanno almeno uno — in pratica un
  // sottoinsieme molto più piccolo del catalogo intero. Usata
  // dall'assistente AI per rispondere su valore/composizione del
  // magazzino senza scaricare mai il catalogo per intero (vedi
  // prodottiByIds() per leggere cod/descr/prezzo dei soli prodotti qui
  // restituiti).
  async function listGiacenze(companyId) {
    const { data, error } = await client().from('giacenze').select('*').eq('company_id', companyId);
    if (error) throw error;
    return data;
  }

  async function listMovimentiRecenti(companyId, limit) {
    // 0018 adds composite tenant FKs alongside the original relationships.
    // Explicit original FK hints work both before and after that migration.
    const { data, error } = await client().from('movimenti_magazzino')
      .select('*, prodotti!movimenti_magazzino_prodotto_id_fkey(cod, descr), depositi!movimenti_magazzino_deposito_id_fkey(nome)')
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
  async function openBillingPortal(companyId, returnUrl) {
    const session = await getSession();
    if(!session) throw new Error('devi essere collegato');
    const res = await fetch(global.SUPABASE_URL + '/functions/v1/stripe-checkout', {
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
      body:JSON.stringify({action:'portal',company_id:companyId,return_url:returnUrl}),
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || 'Gestione abbonamento non disponibile');
    if(typeof data.url !== 'string' || !data.url.startsWith('https://billing.stripe.com/')) throw new Error('Indirizzo di fatturazione non valido');
    return data;
  }

  async function sendEmail(payload, companyId) {
    if (!companyId) throw new Error('companyId mancante per invio email');
    const session = await getSession();
    if (!session) throw new Error('devi essere collegato');
    const res = await fetch(global.SUPABASE_URL + '/functions/v1/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ ...payload, company_id: companyId }),
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
    const body = {
      model: opts.model || 'gemini-2.5-flash',
      temperature: opts.temperature != null ? opts.temperature : 0.3,
      max_tokens: opts.maxTokens || 900,
      companyId: opts.companyId,
      request_id: opts.requestId || global.crypto.randomUUID(),
      messages,
    };
    // reasoning_effort: 'none' — SOLO se chi chiama lo chiede esplicitamente
    // (vedi ai-import.js:extractFromFile). Scoperto con una chiamata reale
    // riproducendo un import fallito ("risposta dell'AI non interpretabile
    // come JSON", troncata a metà di una descrizione): questi modelli
    // "pensano" prima di rispondere, e sull'endpoint compatibile OpenAI di
    // Gemini quei token di pensiero (invisibili, mai nel testo restituito)
    // vengono contati DENTRO max_tokens — con un documento di più righe
    // finivano per consumarne quasi tutto il budget (finish_reason:
    // "length", completion_tokens reali: 158 su un budget di 4000, il
    // resto tutto "pensiero"), troncando il JSON a metà. Un'estrazione
    // strutturata da un allegato non ha bisogno di ragionare, solo di
    // leggere e formattare: disattivarlo qui non toglie nulla e libera
    // tutto il budget per l'unica cosa che deve produrre.
    if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;
    const res = await fetch(global.SUPABASE_URL + '/functions/v1/ai-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    // Un errore di Gemini passato da ai-proxy così com'è può arrivare
    // incapsulato in un array di un elemento ([{error:{...}}], non
    // {error:{...}}) — scoperto indagando "errore HTTP 404" mostrato al
    // posto del vero messaggio di Gemini quando gemini-2.5-pro è stato
    // ritirato (data.error era undefined su un ARRAY, non sull'oggetto
    // dentro): senza questo, qualunque errore del provider IA resta
    // sempre generico invece di spiegare cosa è successo davvero.
    const errBody = Array.isArray(data) ? (data[0] || {}) : data;
    // 502 da ai-proxy = il provider ha risposto con un errore (di solito
    // Gemini "503: modello sovraccarico", temporaneo — successo davvero il
    // 13/10/2026 con gemini-2.5-flash). Un secondo tentativo, uno solo, con
    // l'altro modello disponibile e una richiesta nuova (conta anche lui
    // nella quota). Non se chi chiama ha fissato un requestId: lì vuole
    // proprio che la stessa richiesta non parta due volte.
    if (res.status === 502 && !opts.requestId && !opts._retried) {
      const other = body.model === 'gemini-3.5-flash' ? 'gemini-2.5-flash' : 'gemini-3.5-flash';
      return aiComplete(messages, Object.assign({}, opts, { model: other, _retried: true }));
    }
    if (!res.ok) throw new Error((errBody.error && (errBody.error.message || errBody.error)) || ('errore HTTP ' + res.status));
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
    const results = await Promise.all(names.map(name => loadCollection(name, companyId)));
    const db = {};
    names.forEach((name, i) => {
      db[name] = results[i];
    });
    return db;
  }

  // Come loadCompany(), ma per una sola collection: usata dalle pagine che
  // mostrano un solo modulo (es. la lista clienti) invece dell'intera azienda.
  //
  // Pagina con .range() invece di un unico select('*'): PostgREST/Supabase
  // tronca silenziosamente le risposte oltre il "Max Rows" del progetto
  // (1000 di default) senza segnalare errore — con lo storico Maestro Gold
  // importato, ordini_fornitore/ddt/fatture_cliente superano abbondantemente
  // quella soglia. Senza questo loop, l'elenco (e la cascata in cascade.js,
  // che usa loadCollection per sapere quali OF/DDT/fatture esistono già)
  // vedrebbe solo una fetta arbitraria della collection: documenti mancanti
  // nell'elenco, e nextNumber() che propone un numero in realtà già
  // presente in una riga rimasta fuori dalla pagina.
  // ---------------------------------------------------------------------------
  // Caricamento delle collezioni, veloce (ottobre 2026: ogni schermata
  // impiegava 4-5 secondi perché scaricava per intero lo storico — 3.669
  // fatture, quasi 3.000 DDT, 2.764 ordini fornitore — a blocchi da 1000
  // uno dopo l'altro).
  //
  // 1. Copia sul dispositivo (IndexedDB), per utente/azienda/collezione:
  //    alle aperture successive si chiedono al server solo le righe con
  //    updated_at recente (ogni tabella qui sotto ha il trigger che lo
  //    aggiorna a ogni modifica, default now() all'inserimento) più l'elenco
  //    degli id esistenti, per togliere le righe eliminate. Il risultato è
  //    sempre quello del server, non una copia vecchia.
  //    Margine di 5 minuti su updated_at: now() è l'ora d'INIZIO della
  //    transazione, una riga può diventare visibile qualche istante dopo
  //    la sua data (le transazioni durano al massimo 120 s).
  // 2. Prima volta (o copia assente): le pagine da 1000 righe partono
  //    tutte insieme invece che una dopo l'altra.
  // 3. Due richieste uguali nello stesso momento (es. la pagina e il badge
  //    del menu) ne fanno una sola.
  // ---------------------------------------------------------------------------
  const CACHED_TABLES = new Set(['clienti', 'fornitori', 'preventivi', 'ordini_cliente', 'ordini_fornitore', 'ddt', 'ddt_fornitore',
    'fatture_cliente', 'fatture_fornitore', 'note_credito', 'note_credito_fornitore']);
  const PAGE = 1000;
  const SYNC_MARGIN_MS = 5 * 60 * 1000;
  const inflight = new Map();

  let idbPromise = null;
  function idb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(resolve => {
      try {
        if (!global.indexedDB) return resolve(null);
        const req = global.indexedDB.open('saas-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('collections');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return idbPromise;
  }
  async function cacheGet(key) {
    const db = await idb(); if (!db) return null;
    return new Promise(resolve => {
      try { const r = db.transaction('collections').objectStore('collections').get(key); r.onsuccess = () => resolve(r.result || null); r.onerror = () => resolve(null); }
      catch (e) { resolve(null); }
    });
  }
  async function cachePut(key, value) {
    const db = await idb(); if (!db) return;
    return new Promise(resolve => {
      try { const tx = db.transaction('collections', 'readwrite'); tx.objectStore('collections').put(value, key); tx.oncomplete = tx.onerror = tx.onabort = () => resolve(); }
      catch (e) { resolve(); }
    });
  }
  // All'uscita (o cambiando utente) la copia sul dispositivo si cancella.
  async function cacheClear() {
    const db = await idb(); if (!db) return;
    return new Promise(resolve => {
      try { const tx = db.transaction('collections', 'readwrite'); tx.objectStore('collections').clear(); tx.oncomplete = tx.onerror = tx.onabort = () => resolve(); }
      catch (e) { resolve(); }
    });
  }

  // Tutte le righe di una query, per cursore sull'id (mai per posizione:
  // un documento aggiunto o tolto durante lo scaricamento farebbe saltare
  // o ripetere righe). Per andare in parallelo gli id (uuid, distribuiti
  // a caso) si dividono in quattro fasce, scaricate insieme, ognuna a
  // pagine una dopo l'altra. Il server può restituire meno righe di quante
  // chieste (limite "max rows"): si va avanti finché una pagina torna vuota.
  const ID_BANDS = [null, '40000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', null];
  async function fetchBand(build, lo, hi) {
    let all = [], cursor = null;
    while (true) {
      let q = build().order('id', { ascending: true }).limit(PAGE);
      if (lo) q = q.gte('id', lo);
      if (hi) q = q.lt('id', hi);
      if (cursor) q = q.gt('id', cursor);
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) break;
      const next = data[data.length - 1].id;
      if (typeof next !== 'string' || !next || (cursor !== null && next <= cursor)) {
        throw new Error('Paginazione interrotta: il cursore dei documenti non avanza.');
      }
      all = all.concat(data);
      cursor = next;
    }
    return all;
  }
  async function fetchAllPages(build) {
    const bands = [];
    for (let i = 0; i < ID_BANDS.length - 1; i++) bands.push(fetchBand(build, ID_BANDS[i], ID_BANDS[i + 1]));
    // Ogni riga una volta sola, anche se un server ignorasse i limiti di
    // fascia e restituisse le stesse righe a più fasce.
    const seen = new Map();
    (await Promise.all(bands)).flat().forEach(r => { if (!seen.has(r.id)) seen.set(r.id, r); });
    return [...seen.values()];
  }

  async function fetchRows(table, companyId) {
    const rows = await fetchAllPages(() => client().from(table).select('*').eq('company_id', companyId));
    if (!CACHED_TABLES.has(table)) return rows;
    const session = await getSession().catch(() => null);
    const userId = session && session.user && session.user.id;
    if (userId) cachePut(userId + '|' + companyId + '|' + table, { rows, maxUpd: maxUpdated(rows) });
    return rows;
  }
  function maxUpdated(rows) {
    let m = '';
    rows.forEach(r => { if (r.updated_at && r.updated_at > m) m = r.updated_at; });
    return m;
  }

  async function syncRows(table, companyId) {
    if (!CACHED_TABLES.has(table)) return fetchRows(table, companyId);
    const session = await getSession().catch(() => null);
    const userId = session && session.user && session.user.id;
    if (!userId) return fetchRows(table, companyId);
    const key = userId + '|' + companyId + '|' + table;
    const cached = await cacheGet(key);
    if (!cached || !Array.isArray(cached.rows) || !cached.maxUpd) return fetchRows(table, companyId);
    const since = new Date(Date.parse(cached.maxUpd) - SYNC_MARGIN_MS).toISOString();
    const [changed, ids] = await Promise.all([
      fetchAllPages(() => client().from(table).select('*').eq('company_id', companyId).gte('updated_at', since)),
      fetchAllPages(() => client().from(table).select('id').eq('company_id', companyId)),
    ]);
    const byId = new Map(cached.rows.map(r => [r.id, r]));
    changed.forEach(r => byId.set(r.id, r));
    const alive = new Set(ids.map(r => r.id));
    // Un id esistente sul server ma assente dalla copia e dalle modifiche
    // recenti non dovrebbe esserci mai: in quel caso si riscarica tutto.
    if (ids.some(r => !byId.has(r.id))) return fetchRows(table, companyId);
    const rows = [...byId.values()].filter(r => alive.has(r.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    cachePut(key, { rows, maxUpd: maxUpdated(rows) || cached.maxUpd });
    return rows;
  }

  async function loadCollection(collName, companyId) {
    const def = COLLECTIONS[collName];
    if (!def) throw new Error('collection sconosciuta: ' + collName);
    const k = collName + '|' + companyId;
    if (!inflight.has(k)) {
      inflight.set(k, syncRows(def.table, companyId).finally(() => inflight.delete(k)));
    }
    const rows = await inflight.get(k);
    return rows.map(row => rowToDoc(collName, row));
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

  // Prodotti dal catalogo per un elenco di id — MAI l'intero catalogo (le
  // stesse 21.278 righe di cui sopra): pensata per l'assistente AI, che
  // deve leggere cod/descr/prezzo dei soli prodotti che compaiono in
  // listGiacenze() (un sottoinsieme molto più piccolo — solo quelli con
  // almeno un movimento di magazzino registrato), non per un elenco a sé.
  async function prodottiByIds(companyId, ids) {
    if (!ids || ids.length === 0) return [];
    const { data, error } = await client().from('prodotti').select('*').eq('company_id', companyId).in('id', ids);
    if (error) throw error;
    return data.map(row => rowToDoc('prodotti', row));
  }

  // Documenti di una collezione per id (pochi, mai l'intera collezione):
  // la stampa della fattura ci legge numero e data dei DDT da cui vengono
  // le righe ("*** DDT N° 332 del 09/10/2026").
  async function docsByIds(collName, companyId, ids) {
    const def = COLLECTIONS[collName];
    if (!def) throw new Error('collection sconosciuta: ' + collName);
    ids = [...new Set((ids || []).filter(Boolean))];
    if (ids.length === 0) return [];
    const { data, error } = await client().from(def.table).select('*').eq('company_id', companyId).in('id', ids);
    if (error) throw error;
    return data.map(row => rowToDoc(collName, row));
  }

  // Prodotti dal catalogo per codice (unità di misura nella stampa).
  async function prodottiByCods(companyId, cods) {
    cods = [...new Set((cods || []).filter(Boolean))];
    if (cods.length === 0) return [];
    const { data, error } = await client().from('prodotti').select('*').eq('company_id', companyId).in('cod', cods);
    if (error) throw error;
    return data.map(row => rowToDoc('prodotti', row));
  }

  // ---------------------------------------------------------------------------
  // Import massivo listino — porta di listinoImport() in index.html: la
  // pagina (prodotti.html) legge il file e mappa le colonne, qui arrivano già
  // righe pronte ({cod, descr?, listinoVen?, listinoAcq?, iva?, tipologia?} —
  // solo i campi con una cella non vuota nel file, mai un campo a stringa
  // vuota "per azzerarlo": un listino che ha SOLO la colonna prezzo non deve
  // cancellare descrizione/IVA già salvate su un prodotto esistente).
  // Il confronto è per CODICE, non per id (il file arriva da fuori e non
  // conosce gli id interni) — stesso "aggiunge o aggiorna per codice"
  // dell'originale, sfruttando lo stesso unique(company_id,cod) dello schema
  // come chiave di conflitto invece di un id.
  //
  // Fatto in due giri a lotti (mai un'unica richiesta con l'intero file):
  // 1) legge i prodotti già esistenti per i codici presenti nel file, per
  //    unire i campi mancanti invece di sovrascriverli con null;
  // 2) upsert in blocco onConflict(company_id,cod).
  async function importListino(companyId, rows) {
    const CHUNK = 200;
    const cods = [...new Set(rows.map(r => r.cod))];
    const existing = new Map();
    for (let i = 0; i < cods.length; i += CHUNK) {
      const slice = cods.slice(i, i + CHUNK);
      const { data, error } = await client().from('prodotti').select('*').eq('company_id', companyId).in('cod', slice);
      if (error) throw error;
      data.forEach(row => existing.set(row.cod, row));
    }
    let added = 0, updated = 0;
    const toUpsert = rows.map(r => {
      const prev = existing.get(r.cod);
      if (prev) updated++; else added++;
      const row = prev
        ? { id: prev.id, company_id: companyId, cod: r.cod, descr: prev.descr, fornitore_id: prev.fornitore_id, listino_acq: prev.listino_acq, listino_ven: prev.listino_ven, iva: prev.iva, unita: prev.unita, extra: prev.extra || {} }
        : { company_id: companyId, cod: r.cod, descr: '', iva: 22, extra: {} };
      if (r.descr !== undefined) row.descr = r.descr;
      if (r.listinoVen !== undefined) row.listino_ven = r.listinoVen;
      if (r.listinoAcq !== undefined) row.listino_acq = r.listinoAcq;
      if (r.iva !== undefined) row.iva = r.iva;
      if (r.tipologia !== undefined) row.extra = Object.assign({}, row.extra, { tipologia: r.tipologia });
      return row;
    });
    for (let i = 0; i < toUpsert.length; i += CHUNK) {
      const slice = toUpsert.slice(i, i + CHUNK);
      const { error } = await client().from('prodotti').upsert(slice, { onConflict: 'company_id,cod' });
      if (error) throw error;
    }
    return { added, updated };
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

  // Bug reale trovato con un utente "operatore" reale: ogni tabella
  // documento ha una RLS che riserva DELETE al solo ruolo "admin" (vedi
  // le migration — creare/modificare è aperto a ogni membro non-viewer,
  // cancellare no). Una riga bloccata dalla RLS in un DELETE non è un
  // errore per Postgrest: la query torna comunque "riuscita", con
  // semplicemente zero righe toccate — .delete() da solo (senza .select())
  // non ha modo di accorgersene, quindi il pulsante "Elimina" sembrava non
  // fare nulla, senza nessun messaggio, per chi non è amministratore.
  async function removeDoc(collName, id) {
    const def = COLLECTIONS[collName];
    if (!def) throw new Error('collection sconosciuta: ' + collName);
    const { data, error } = await client().from(def.table).delete().eq('id', id).select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Non hai i permessi per eliminare questo documento: solo un amministratore dell\'azienda può farlo.');
    }
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

  // Keep the identity across a network retry, including a lost successful
  // response. A changed document/order snapshot is a new operation.
  const customerDdtRequests = new Map();
  async function createCustomerDdt(companyId, order, doc, requestId) {
    const payload = {
      p_company_id: companyId, p_order_id: order.id,
      p_expected_rows: order.righe,
      p_document: { data: doc.data, num: doc.num || null, cliente_id: doc.clienteId,
        dest_id: doc.destId || null, righe: doc.righe },
    };
    if (!requestId) {
      const key = JSON.stringify(payload);
      if (!customerDdtRequests.has(key)) customerDdtRequests.set(key, global.crypto.randomUUID());
      requestId = customerDdtRequests.get(key);
    }
    const { data, error } = await client().rpc('create_customer_ddt', {
      ...payload, p_request_id: requestId,
    });
    if (error) throw error;
    return { ddt: rowToDoc('ddt', data.ddt), ordine: rowToDoc('ordiniCliente', data.ordine) };
  }

  function documentSnapshot(collName, doc, companyId, fields) {
    const row = docToRow(collName, doc, companyId);
    return Object.fromEntries(fields.map(key => [key, row[key] === undefined ? null : row[key]]));
  }
  async function saveCustomerOrder(companyId, expectedOrder, doc) {
    const fields = ['num','data','cliente_id','dest_id','righe','extra'];
    const { data, error } = await client().rpc('update_customer_order', {
      p_company_id: companyId, p_order_id: expectedOrder.id,
      p_expected: documentSnapshot('ordiniCliente', expectedOrder, companyId, fields),
      p_document: documentSnapshot('ordiniCliente', doc, companyId, fields),
    });
    if (error) throw error;
    return rowToDoc('ordiniCliente', data);
  }
  async function saveSupplierOrder(companyId, expectedOrder, doc) {
    const fields = ['num','data','fornitore_id','righe','ftf_ids','extra'];
    const { data, error } = await client().rpc('update_supplier_order', {
      p_company_id: companyId, p_order_id: expectedOrder.id,
      p_expected: documentSnapshot('ordiniFornitore', expectedOrder, companyId, fields),
      p_document: documentSnapshot('ordiniFornitore', doc, companyId, fields),
    });
    if (error) throw error;
    return rowToDoc('ordiniFornitore', data);
  }
  const documentRequests = new Map();
  function documentRequestId(operation, payload, requestId) {
    if (requestId) return requestId;
    const key = operation + ':' + JSON.stringify(payload);
    if (!documentRequests.has(key)) documentRequests.set(key, global.crypto.randomUUID());
    return documentRequests.get(key);
  }
  async function changeCustomerDdt(companyId, expectedDdt, doc, action, reason, requestId) {
    const fields = ['num','data','cliente_id','oc_id','dest_id','righe','extra'];
    const payload = {
      p_company_id: companyId, p_ddt_id: expectedDdt.id, p_action: action,
      p_expected: documentSnapshot('ddt', expectedDdt, companyId, fields),
      p_document: action === 'cancel' ? {} : documentSnapshot('ddt', doc, companyId, fields),
      p_reason: reason || '',
    };
    const { data, error } = await client().rpc('change_customer_ddt', {
      ...payload, p_request_id: documentRequestId('change-ddt', payload, requestId),
    });
    if (error) throw error;
    return { ddt: rowToDoc('ddt', data.ddt), ordine: data.ordine ? rowToDoc('ordiniCliente', data.ordine) : null };
  }
  async function createCustomerInvoice(companyId, ddt, doc, requestId) {
    const payload = {
      p_company_id: companyId, p_ddt_id: ddt.id,
      p_expected_ddt: { cliente_id: ddt.clienteId, oc_id: ddt.ocId || null, righe: ddt.righe,
        extra: { ftId: ddt.ftId || null, annullato: ddt.annullato === true } },
      p_document: { data: doc.data, num: doc.num || null, cliente_id: doc.clienteId,
        oc_id: doc.ocId || null, dest_id: doc.destId || null, righe: doc.righe },
    };
    const { data, error } = await client().rpc('create_customer_invoice', {
      ...payload, p_request_id: documentRequestId('create-invoice', payload, requestId),
    });
    if (error) throw error;
    return { fattura: rowToDoc('fattureCliente', data.fattura), ddt: rowToDoc('ddt', data.ddt),
      ordine: data.ordine ? rowToDoc('ordiniCliente', data.ordine) : null };
  }

  async function createSupplierInvoice(companyId, ddt, doc, requestId) {
    const payload = { p_company_id: companyId, p_ddt_id: ddt.id,
      p_expected_ddt: { fornitore_id: ddt.fornitoreId, of_id: ddt.ofId || null, righe: ddt.righe,
        extra: { ftfId: ddt.ftfId || null, annullato: ddt.annullato === true } },
      p_document: { num: doc.num || null, data: doc.data, fornitore_id: doc.fornitoreId,
        of_id: doc.ofId || null, righe: doc.righe } };
    const { data, error } = await client().rpc('create_supplier_invoice', {
      ...payload, p_request_id: documentRequestId('supplier-invoice', payload, requestId) });
    if (error) throw error;
    return supplierDdtResult(data);
  }
  async function completeOrderManually(companyId, kind, order, reason, requestId) {
    if (!['customer','supplier'].includes(kind)) throw new Error('Tipo ordine non valido.');
    const payload = { p_company_id: companyId, p_kind: kind, p_order_id: order.id,
      p_expected_rows: order.righe, p_reason: reason };
    const { data, error } = await client().rpc('complete_order_manually', {
      ...payload, p_request_id: documentRequestId('manual-order', payload, requestId) });
    if (error) throw error;
    return rowToDoc(kind === 'customer' ? 'ordiniCliente' : 'ordiniFornitore', data);
  }

  // Keep a failed operation's identity for retry, but allow a later, distinct
  // payment with the same amount/date after successful completion.
  const paymentRequests = new Map();
  async function mutateInvoicePayment(companyId, kind, invoice, action, payload, requestId) {
    if (!['customer', 'supplier'].includes(kind)) throw new Error('Tipo fattura non valido.');
    const args = { p_company_id: companyId, p_kind: kind, p_invoice_id: invoice.id,
      p_action: action, p_payload: payload };
    const key = JSON.stringify(args);
    let pending = paymentRequests.get(key);
    if (!pending || (requestId && pending.id !== requestId)) {
      pending = { id: requestId || global.crypto.randomUUID(), promise: null };
      paymentRequests.set(key, pending);
    }
    if (pending.promise) return pending.promise;
    pending.promise = (async () => {
      try {
        const { data, error } = await client().rpc('mutate_invoice_payment', {
          ...args, p_request_id: pending.id });
        if (error) throw error;
        if (paymentRequests.get(key) === pending) paymentRequests.delete(key);
        return rowToDoc(kind === 'customer' ? 'fattureCliente' : 'fattureFornitore', data);
      } finally { pending.promise = null; }
    })();
    return pending.promise;
  }

  function supplierDdtResult(data) {
    return { ddt: rowToDoc('ddtFornitore', data.ddt),
      ordine: data.ordine ? rowToDoc('ordiniFornitore', data.ordine) : null,
      fattura: data.fattura ? rowToDoc('fattureFornitore', data.fattura) : null };
  }
  async function createSupplierDdt(companyId, order, doc, requestId) {
    const payload = { p_company_id: companyId, p_order_id: order.id, p_expected_rows: order.righe,
      p_document: { num: doc.num || null, data: doc.data, fornitore_id: doc.fornitoreId,
        righe: doc.righe, fattura_id: doc.fatturaId || null } };
    const { data, error } = await client().rpc('create_supplier_ddt', {
      ...payload, p_request_id: documentRequestId('supplier-ddt', payload, requestId),
    });
    if (error) throw error;
    return supplierDdtResult(data);
  }
  async function createStandaloneSupplierDdt(companyId, doc, requestId) {
    const payload = { p_company_id: companyId, p_document: { num: doc.num, data: doc.data,
      fornitore_id: doc.fornitoreId, righe: doc.righe, fattura_id: doc.fatturaId || null } };
    const { data, error } = await client().rpc('create_standalone_supplier_ddt', {
      ...payload, p_request_id: documentRequestId('supplier-standalone-ddt', payload, requestId),
    });
    if (error) throw error;
    return supplierDdtResult(data);
  }
  async function changeSupplierDdt(companyId, expectedDdt, doc, action, reason, requestId) {
    const fields = ['num','data','fornitore_id','of_id','righe','extra'];
    const payload = { p_company_id: companyId, p_ddt_id: expectedDdt.id, p_action: action,
      p_expected: documentSnapshot('ddtFornitore', expectedDdt, companyId, fields),
      p_document: action === 'cancel' ? {} : documentSnapshot('ddtFornitore', doc, companyId, fields), p_reason: reason || '' };
    const { data, error } = await client().rpc('change_supplier_ddt', {
      ...payload, p_request_id: documentRequestId('supplier-ddt-change', payload, requestId),
    });
    if (error) throw error;
    return supplierDdtResult(data);
  }

  function creditNoteSnapshot(companyId, kind, doc) {
    const coll = kind === 'customer' ? 'noteCredito' : 'noteCreditoFornitore';
    return documentSnapshot(coll, doc, companyId,
      ['id','num','data',kind === 'customer' ? 'cliente_id' : 'fornitore_id','fattura_id','righe','extra']);
  }
  async function saveCreditNote(companyId, kind, expected, doc, requestId) {
    const payload = {p_company_id:companyId,p_kind:kind,
      p_expected:expected ? creditNoteSnapshot(companyId,kind,expected) : null,
      p_document:creditNoteSnapshot(companyId,kind,doc)};
    const {data,error} = await client().rpc('save_credit_note', {...payload,
      p_request_id:documentRequestId('credit-note-save',payload,requestId)});
    if(error) throw error;
    return rowToDoc(kind === 'customer' ? 'noteCredito' : 'noteCreditoFornitore',data);
  }
  async function cancelCreditNote(companyId, kind, expected, reason, requestId) {
    const payload = {p_company_id:companyId,p_kind:kind,
      p_expected:creditNoteSnapshot(companyId,kind,expected),p_reason:reason};
    const {data,error} = await client().rpc('cancel_credit_note', {...payload,
      p_request_id:documentRequestId('credit-note-cancel',payload,requestId)});
    if(error) throw error;
    return rowToDoc(kind === 'customer' ? 'noteCredito' : 'noteCreditoFornitore',data);
  }

  global.SaasStore = {
    completeOrderManually,
    COLLECTIONS, signUp, signIn, signOut, getSession,
    myMemberships, registerCompany, loadCompany, loadCollection, saveDoc, removeDoc, nextNumber,
    peekNumber, bumpCounterPast, createCustomerDdt, saveCustomerOrder, saveSupplierOrder, changeCustomerDdt, createCustomerInvoice,
    createSupplierDdt, createStandaloneSupplierDdt, changeSupplierDdt, createSupplierInvoice, mutateInvoicePayment, saveCreditNote, cancelCreditNote,
    getCompany, loadPlans, startCheckout, openBillingPortal, searchProdotti, prodottiByIds, prodottiByCods, docsByIds, importListino, saveCompany, aiComplete, checkDocLimit, checkAiLimit,
    createMaestroSyncKey, maestroSyncStatus, listMaestroSyncRuns, listMaestroImportIssues,
    listMembers, listInvites, createInvite, revokeInvite, updateMemberRole, removeMember, sendEmail,
    listDepositi, ensureDefaultDeposito, createDeposito, renameDeposito, removeDeposito,
    addMovimento, giacenzeForProdotti, listGiacenze, listMovimentiRecenti,
  };
})(window);
