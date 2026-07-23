/**
 * IPSOFARMA CRM — Import automatico fatture fornitore da Gmail
 * ============================================================
 * Cerca le email con oggetto "POSTA CERTIFICATA: Trasmissione Fattura", estrae
 * l'allegato (di solito il PDF della fattura, a volte XML/P7M di FatturaPA),
 * ne legge i dati (via Gemini per i PDF, via parsing diretto per gli XML) e li
 * scrive "in attesa" nel file gmail-pending.json di questo repository GitHub.
 * Il gestionale (index.html) legge periodicamente quel file e propone
 * l'importazione con la stessa schermata di conferma dell'import manuale:
 * questo script NON scrive mai direttamente in fattureFornitore/backup.json,
 * quindi non rischia di sovrascrivere i dati veri del gestionale.
 *
 * ---- INSTALLAZIONE (una tantum) ----
 * 1. Vai su https://script.google.com → Nuovo progetto.
 * 2. Cancella il contenuto di default e incolla tutto questo file.
 * 3. Menu a sinistra "Impostazioni progetto" (icona ingranaggio) → "Proprietà script"
 *    → aggiungi queste proprietà:
 *      GITHUB_TOKEN   = il tuo Personal Access Token GitHub (permesso "repo")
 *      GEMINI_API_KEY = la tua chiave API Gemini (da https://aistudio.google.com/apikey)
 *    (GITHUB_REPO e GITHUB_BRANCH sono opzionali: di default puntano a
 *     "Stefanobozzo82/ipsofarma-crm" branch "main" — cambiali solo se necessario.)
 * 4. In alto, seleziona la funzione "setup" dal menu a tendina ed esegui (▶ Esegui).
 *    La prima volta Google chiederà di autorizzare l'accesso a Gmail e a Internet:
 *    è la normale autorizzazione di uno script personale, NON serve creare nulla
 *    su Google Cloud Console.
 * 5. Fatto: "setup" installa un controllo automatico ogni 15 minuti e ne esegue
 *    subito uno. Da qui in poi lo script gira da solo, anche ad app chiusa.
 *
 * Per cambiare l'intervallo, modifica il numero in setup() e rilancia setup().
 *
 * ---- NOTIFICA PUSH SUL TELEFONO (opzionale) ----
 * Per ricevere una notifica sul telefono ogni volta che viene trovata una nuova
 * fattura, usa il servizio gratuito ntfy.sh (nessuna registrazione richiesta):
 * 1. Installa l'app "ntfy" (Play Store / App Store), oppure apri https://ntfy.sh sul telefono.
 * 2. Nell'app premi "+" e scrivi un nome-argomento segreto e difficile da indovinare,
 *    es. "ipsofarma-<qualcosa-a-caso>" (chiunque conosca il nome può leggere le notifiche,
 *    quindi non usare un nome ovvio).
 * 3. In "Proprietà script" aggiungi la proprietà NTFY_TOPIC con quello stesso nome.
 * 4. Fatto: da questo momento ogni nuova fattura trovata manda una notifica.
 * Se non imposti NTFY_TOPIC, l'invio della notifica viene semplicemente saltato.
 */

const CFG = {
  get GITHUB_TOKEN()  { return PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN'); },
  get GITHUB_REPO()   { return PropertiesService.getScriptProperties().getProperty('GITHUB_REPO') || 'Stefanobozzo82/ipsofarma-crm'; },
  get GITHUB_BRANCH() { return PropertiesService.getScriptProperties().getProperty('GITHUB_BRANCH') || 'main'; },
  get GEMINI_API_KEY(){ return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'); },
  get GEMINI_MODEL()  { return PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || 'gemini-2.5-flash'; },
  get NTFY_TOPIC()    { return PropertiesService.getScriptProperties().getProperty('NTFY_TOPIC'); }
};
const PENDING_PATH = 'gmail-pending.json';
const LABEL_NAME = 'crm-importata';
const GMAIL_QUERY = 'subject:"POSTA CERTIFICATA: Trasmissione Fattura" has:attachment -label:' + LABEL_NAME;

/** Esegui questa funzione UNA VOLTA sola dall'editor per autorizzare lo script
 *  e installare il controllo periodico. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkFatture') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkFatture').timeBased().everyMinutes(15).create();
  checkFatture();
}

/** Funzione richiamata dal trigger periodico (e da setup()). */
function checkFatture() {
  if (!CFG.GITHUB_TOKEN) throw new Error('Imposta la proprietà script GITHUB_TOKEN prima di continuare');
  const label = getOrCreateLabel_(LABEL_NAME);
  const threads = GmailApp.search(GMAIL_QUERY, 0, 50);
  if (!threads.length) return;
  // Fatture già presenti nel gestionale: non le riproponiamo (evita doppioni e chiamate AI inutili).
  const existingNums = getExistingInvoiceNumbers_();
  const newItems = [];
  threads.forEach(function (thread) {
    let transient = false;
    thread.getMessages().forEach(function (msg) {
      const item = processMessage_(msg);
      if (item.error && isTransientError_(item.error)) { transient = true; return; } // riprova al prossimo giro
      if (item.p && item.p.number && existingNums.has(String(item.p.number))) return; // già in archivio: ignora
      newItems.push(item);
    });
    // Se anche un solo messaggio del thread ha avuto un errore temporaneo (es. Gemini sovraccarico),
    // non etichettiamo il thread come importato: verrà ritentato al prossimo controllo.
    if (!transient) thread.addLabel(label);
  });
  if (newItems.length) appendPending_(newItems);
}

function isTransientError_(msg) {
  return /Gemini HTTP (429|5\d\d)/.test(msg) || /GitHub (GET|PUT)/.test(msg) || /timeout|Timeout|Address unavailable|DNS|Errore imprevisto/i.test(msg);
}

/** Numeri delle fatture fornitore già presenti in backup.json, per evitare doppioni. */
function getExistingInvoiceNumbers_() {
  try {
    const existing = ghGet_('backup.json');
    const arr = (existing && existing.data && existing.data.fattureFornitore) || [];
    return new Set(arr.map(function (f) { return String(f.num); }));
  } catch (e) {
    return new Set(); // se backup.json non è leggibile, non blocchiamo l'import: verrà comunque scartato dal gestionale come doppione, se lo è
  }
}

function processMessage_(msg) {
  const msgId = msg.getId();
  const atts = msg.getAttachments({ includeInlineImages: false, includeAttachments: true });
  const cand = atts.find(function (a) {
    const n = a.getName().toLowerCase();
    return n !== 'daticert.xml' && !/smime\.p7[sm]$/.test(n) && n !== 'postacert.eml';
  });
  if (!cand) return { msgId: msgId, file: '(nessun allegato fattura)', error: 'Allegato fattura non trovato nel messaggio' };
  const name = cand.getName();
  try {
    let p;
    if (/\.pdf$/i.test(name)) {
      p = extractViaGemini_(cand);
    } else if (/\.xml$/i.test(name)) {
      // XML diretto (non firmato): decodifica UTF-8 corretta, non serve la scansione a byte grezzi.
      const text = cand.getDataAsString('UTF-8');
      const xml = tryExtractXml_(text) || text;
      p = parseFatturaXml_(xml);
    } else {
      // .p7m o altro: la XML è incapsulata in una busta firmata, va estratta a livello di byte.
      const xml = extractFatturaXml_(cand.getBytes());
      if (!xml) return { msgId: msgId, file: name, error: 'XML fattura non trovato nell\'allegato' };
      p = parseFatturaXml_(xml);
    }
    if (!p || !p.number) return { msgId: msgId, file: name, error: 'Fattura non riconosciuta' };
    return { msgId: msgId, file: name, p: p, src: 'Gmail' };
  } catch (e) {
    return { msgId: msgId, file: name, error: String((e && e.message) || e) };
  }
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

/* ---------- Estrazione PDF via Gemini ---------- */
function extractViaGemini_(attachment) {
  const key = CFG.GEMINI_API_KEY;
  if (!key) throw new Error('Imposta la proprietà script GEMINI_API_KEY prima di continuare');
  const b64 = Utilities.base64Encode(attachment.getBytes());
  const prompt = "Nel documento allegato c'è una FATTURA di un FORNITORE. Restituisci SOLO un oggetto JSON " +
    "(nient'altro, senza markdown) con: supplier (ragione sociale fornitore), number (numero fattura), " +
    "date (AAAA-MM-GG), order_ref (il numero d'ordine cliente scritto come 'Rif.cliente Vs.ord. NNN', se presente), " +
    "e lines: per ogni riga code (codice articolo alfanumerico del prodotto, es. 'B0068598', NON la posizione a " +
    "4 cifre come '0010' né suffissi come 'HR37S'), descr, qty (quantità fatturata), " +
    "price (PREZZO UNITARIO PIENO prima di eventuali sconti), " +
    "sconto (percentuali di sconto a cascata unite da '+', es. '50+15', se presenti altrimenti '0'), " +
    "iva (aliquota), lotto (numero di lotto/partita se indicato vicino alla riga, altrimenti stringa vuota), " +
    "scad (data di scadenza del lotto in AAAA-MM-GG se indicata, altrimenti stringa vuota).";
  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'application/pdf', data: b64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + CFG.GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(key);
  const opts = { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true };
  // Il piano gratuito di Gemini ha un limite di richieste al minuto: se lo superiamo (HTTP 429,
  // o un errore temporaneo 5xx) ritentiamo un paio di volte con attesa crescente prima di arrenderci.
  const backoffs = [0, 5000, 15000];
  let res;
  for (let i = 0; i < backoffs.length; i++) {
    if (backoffs[i]) Utilities.sleep(backoffs[i]);
    res = UrlFetchApp.fetch(url, opts);
    const code = res.getResponseCode();
    if (code < 300 || !(code === 429 || code >= 500) || i === backoffs.length - 1) break;
  }
  if (res.getResponseCode() >= 300) throw new Error('Gemini HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  const data = JSON.parse(res.getContentText());
  const parts = ((((data.candidates || [])[0] || {}).content || {}).parts || []);
  const txt = parts.map(function (p) { return p.text || ''; }).join('');
  let a;
  try { a = JSON.parse(txt); } catch (e) { throw new Error('Risposta AI non interpretabile: ' + txt.slice(0, 300)); }
  const lines = (a.lines || []).map(function (l) {
    return {
      cod: String(l.code || l.product || '').trim(),
      descr: String(l.descr || l.description || '').trim(),
      qty: Math.max(1, parseInt(l.qty || 1, 10)),
      prezzo: (l.price != null && l.price !== '') ? parseFloat(l.price) : 0,
      sconto: String(l.sconto || l.discount || '').replace(/\s/g, '') || 0,
      iva: (l.iva != null && l.iva !== '') ? parseFloat(l.iva) : 22,
      lotto: String(l.lotto || '').trim(),
      scad: String(l.scad || '').trim()
    };
  });
  return {
    dir: 'acquisto',
    ced: { nome: String(a.supplier || '').trim(), piva: '', cf: '' },
    ces: {},
    number: String(a.number || '').trim(),
    date: a.date || '',
    order_ref: a.order_ref || '',
    lines: lines,
    totale: lines.reduce(function (s, l) { return s + l.qty * l.prezzo * (1 + (l.iva || 0) / 100); }, 0)
  };
}

/* ---------- Estrazione XML/P7M (FatturaPA) ---------- */
function extractFatturaXml_(bytes) {
  let xml = tryExtractXml_(bytesToLatin1_(bytes));
  if (xml) return xml;
  try {
    const cleaned = bytesToLatin1_(bytes).replace(/[^A-Za-z0-9+/=]/g, '');
    xml = tryExtractXml_(bytesToLatin1_(Utilities.base64Decode(cleaned)));
    if (xml) return xml;
  } catch (e) { /* non era base64: pazienza */ }
  return null;
}
function tryExtractXml_(s) {
  const start = s.search(/<\?xml|<(\w+:)?FatturaElettronica/i);
  if (start < 0) return null;
  const li = s.lastIndexOf('FatturaElettronica>');
  if (li < 0) return null;
  return s.slice(start, li + 'FatturaElettronica>'.length);
}
function bytesToLatin1_(bytes) {
  let s = '';
  const CHUNK = 8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.slice(i, i + CHUNK);
    s += String.fromCharCode.apply(null, chunk.map(function (b) { return b & 0xff; }));
  }
  return s;
}
function parseFatturaXml_(xmlText) {
  const doc = XmlService.parse(xmlText).getRootElement();
  const descendants = function (el, name) {
    const out = [];
    const walk = function (n) {
      if (n.getName && n.getName() === name) out.push(n);
      (n.getChildren ? n.getChildren() : []).forEach(walk);
    };
    walk(el);
    return out;
  };
  const first = function (el, name) { return descendants(el, name)[0] || null; };
  const text = function (el, name) { const e = first(el, name); return e ? e.getText().trim() : ''; };
  const num = function (v) { const n = parseFloat(String(v || '').trim().replace(',', '.')); return isNaN(n) ? 0 : n; };
  const partyOf = function (el) {
    if (!el) return { nome: '', piva: '', cf: '' };
    const idf = first(el, 'IdFiscaleIVA');
    const nome = text(el, 'Denominazione') || [text(el, 'Nome'), text(el, 'Cognome')].filter(Boolean).join(' ');
    return { nome: nome, piva: idf ? text(idf, 'IdCodice') : '', cf: text(el, 'CodiceFiscale') };
  };
  const ced = partyOf(first(doc, 'CedentePrestatore'));
  const body = first(doc, 'FatturaElettronicaBody');
  if (!body) return null;
  const dgd = first(body, 'DatiGeneraliDocumento');
  const number = text(dgd, 'Numero'), date = text(dgd, 'Data');
  let order_ref = '';
  const ord = first(body, 'DatiOrdineAcquisto');
  if (ord) order_ref = text(ord, 'IdDocumento');
  const lines = descendants(body, 'DettaglioLinee').map(function (dl) {
    const ca = first(dl, 'CodiceArticolo');
    let lotto = '', scad = '';
    descendants(dl, 'AltriDatiGestionali').forEach(function (adg) {
      const tipo = (text(adg, 'TipoDato') || '').toUpperCase();
      if (tipo.indexOf('LOTTO') >= 0 || tipo.indexOf('PARTITA') >= 0) lotto = text(adg, 'RiferimentoTesto') || lotto;
      if (tipo.indexOf('SCAD') >= 0) scad = text(adg, 'RiferimentoData') || text(adg, 'RiferimentoTesto') || scad;
    });
    return {
      cod: ca ? text(ca, 'CodiceValore') : '', descr: text(dl, 'Descrizione'),
      qty: num(text(dl, 'Quantita')) || 1, prezzo: num(text(dl, 'PrezzoUnitario')),
      iva: num(text(dl, 'AliquotaIVA')), lotto: lotto, scad: scad
    };
  });
  const totale = num(text(dgd, 'ImportoTotaleDocumento'));
  return { dir: 'acquisto', ced: ced, ces: {}, number: number, date: date, order_ref: order_ref, lines: lines, totale: totale };
}

/* ---------- Lettura/scrittura di gmail-pending.json su GitHub ---------- */
function ghGet_(path) {
  const url = 'https://api.github.com/repos/' + CFG.GITHUB_REPO + '/contents/' + path + '?ref=' + CFG.GITHUB_BRANCH;
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'token ' + CFG.GITHUB_TOKEN, 'User-Agent': 'Ipsofarma-CRM-Gmail-Script' },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() === 404) return null;
  if (res.getResponseCode() >= 300) throw new Error('GitHub GET ' + path + ' HTTP ' + res.getResponseCode());
  const d = JSON.parse(res.getContentText());
  const json = Utilities.newBlob(Utilities.base64Decode(d.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
  return { sha: d.sha, data: JSON.parse(json) };
}
function ghPut_(path, obj, sha) {
  const url = 'https://api.github.com/repos/' + CFG.GITHUB_REPO + '/contents/' + path;
  const body = {
    message: 'Gmail import: aggiornamento fatture in attesa',
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(obj, null, 2)).getBytes()),
    branch: CFG.GITHUB_BRANCH
  };
  if (sha) body.sha = sha;
  const res = UrlFetchApp.fetch(url, {
    method: 'put', contentType: 'application/json', payload: JSON.stringify(body),
    headers: { Authorization: 'token ' + CFG.GITHUB_TOKEN, 'User-Agent': 'Ipsofarma-CRM-Gmail-Script' },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('GitHub PUT ' + path + ' HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
}
function appendPending_(newItems) {
  const existing = ghGet_(PENDING_PATH);
  const data = (existing && existing.data) || { items: [] };
  const seenIds = {};
  data.items.forEach(function (i) { seenIds[i.msgId] = true; });
  const addedNow = [];
  newItems.forEach(function (it) {
    if (!seenIds[it.msgId]) {
      data.items.push(Object.assign({ addedAt: new Date().toISOString() }, it));
      seenIds[it.msgId] = true;
      addedNow.push(it);
    }
  });
  if (data.items.length > 300) data.items = data.items.slice(-300);
  ghPut_(PENDING_PATH, data, existing && existing.sha);
  addedNow.forEach(notifyNewInvoice_);
}

/** Manda una notifica push (via ntfy.sh) per una fattura appena trovata. Non blocca
 *  l'import se fallisce o se NTFY_TOPIC non è configurato. */
function notifyNewInvoice_(item) {
  if (!CFG.NTFY_TOPIC) return;
  try {
    const p = item.p || {};
    const fornitore = (p.ced && p.ced.nome) || 'Fornitore sconosciuto';
    const importo = p.totale ? (' — € ' + p.totale.toFixed(2)) : '';
    const title = 'Nuova fattura fornitore';
    const message = fornitore + (p.number ? ' · n. ' + p.number : '') + importo;
    UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(CFG.NTFY_TOPIC), {
      method: 'post',
      payload: message,
      headers: { Title: title, Tags: 'email', Priority: 'default' },
      muteHttpExceptions: true
    });
  } catch (e) { /* la notifica è solo un di più: non deve mai far fallire l'import */ }
}

/** Utile per verificare la configurazione dall'editor prima di aspettare il trigger. */
function testConfig() {
  Logger.log('GITHUB_REPO: ' + CFG.GITHUB_REPO);
  Logger.log('GITHUB_TOKEN presente: ' + !!CFG.GITHUB_TOKEN);
  Logger.log('GEMINI_API_KEY presente: ' + !!CFG.GEMINI_API_KEY);
  Logger.log('NTFY_TOPIC presente: ' + !!CFG.NTFY_TOPIC);
  const existing = ghGet_(PENDING_PATH);
  Logger.log('gmail-pending.json attuale: ' + (existing ? JSON.stringify(existing.data).slice(0, 500) : '(non esiste ancora, verrà creato al primo import)'));
}

/** Esegui questa funzione dall'editor per verificare che la notifica push arrivi
 *  davvero sul telefono, senza dover aspettare una fattura vera. */
function testNotifica() {
  if (!CFG.NTFY_TOPIC) { Logger.log('Imposta prima la proprietà script NTFY_TOPIC'); return; }
  notifyNewInvoice_({ p: { ced: { nome: 'Fornitore di prova' }, number: '0000', totale: 12.34 } });
  Logger.log('Notifica di prova inviata al topic ' + CFG.NTFY_TOPIC + ' — controlla il telefono.');
}
