/* ============================================================================
 * ai-import.js — leggere un documento (foto o PDF) con l'AI per precompilare
 * un form, invece di trascriverlo a mano. Fattorizzato fuori da
 * fatture-fornitore.html (dove viveva da solo, unico modulo ad averlo) per
 * riusarlo su tutti i documenti dove ha senso — vedi la nota sotto su quali.
 *
 * Un modello di chat non legge un PDF come tale: le pagine vanno
 * trasformate in immagini prima di inviarle (pdf.js, caricato da CDN al
 * primo uso, non nel bundle). Limitate alle prime 4 pagine di proposito: un
 * documento del genere raramente ne ha di più, e ogni pagina in più pesa
 * sulla richiesta.
 *
 * NON aggiunto a ogni modulo documento di proposito: ha senso solo per
 * documenti che un'azienda RICEVE da fuori (una fattura o nota di credito
 * del fornitore, un ordine di un cliente) — non per quelli che l'azienda
 * stessa crea da zero (una propria fattura, un proprio preventivo): non
 * esiste nessun documento esterno da fotografare prima di averli fatti.
 * ============================================================================ */

(function (global) {
  'use strict';

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('lettura del file non riuscita'));
      r.readAsDataURL(file);
    });
  }

  let pdfJsPromise = null;
  function loadPdfJs() {
    if (pdfJsPromise) return pdfJsPromise;
    pdfJsPromise = new Promise((resolve, reject) => {
      if (global.pdfjsLib) { resolve(global.pdfjsLib); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => {
        try { global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; resolve(global.pdfjsLib); }
        catch (e) { reject(e); }
      };
      s.onerror = () => reject(new Error('impossibile caricare il lettore PDF (serve una connessione a internet)'));
      document.head.appendChild(s);
    });
    return pdfJsPromise;
  }

  async function pdfToImageDataUrls(file, maxPages) {
    const lib = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;
    const n = Math.min(pdf.numPages, maxPages || 4);
    const imgs = [];
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      imgs.push(canvas.toDataURL('image/png'));
    }
    return imgs;
  }

  async function fileToImages(file, maxPages) {
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    return isPdf ? await pdfToImageDataUrls(file, maxPages || 4) : [await readFileAsDataUrl(file)];
  }

  function parseAiJson(text) {
    let t = String(text || '').replace(/```json|```/g, '').trim();
    try { return JSON.parse(t); } catch (e) { /* provo a isolare l'oggetto sotto */ }
    const m = t.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) { /* niente da fare, sotto l'errore finale */ } }
    throw new Error('risposta dell\'AI non interpretabile come JSON' + (t ? ' — ricevuto: ' + t.slice(0, 200) : ''));
  }

  // Punto d'ingresso unico: file -> immagini -> chiamata AI -> JSON.
  // opts: { systemPrompt, instr, maxTokens }
  async function extractFromFile(store, file, opts) {
    opts = opts || {};
    const images = await fileToImages(file, 4);
    const content = [{ type: 'text', text: opts.instr }].concat(images.map(url => ({ type: 'image_url', image_url: { url } })));
    const reply = await store.aiComplete([
      { role: 'system', content: opts.systemPrompt || "Rispondi sempre e solo con JSON valido, mai testo libero, mai backtick." },
      { role: 'user', content },
    ], { maxTokens: opts.maxTokens || 4000 });
    return parseAiJson(reply);
  }

  // Cerca una controparte (cliente o fornitore) per nome tra quelle già in
  // anagrafica — stessa euristica ovunque: corrispondenza esatta, poi
  // "contiene"/"è contenuto" (un nome letto dall'AI raramente è carattere
  // per carattere identico a quello salvato, es. "Srl" vs "S.r.l.").
  function findPartyByNome(elenco, nome) {
    if (!nome) return null;
    const n = String(nome).trim().toLowerCase();
    if (!n) return null;
    return elenco.find(p => (p.nome || '').toLowerCase() === n)
      || elenco.find(p => (p.nome || '').toLowerCase().includes(n) || n.includes((p.nome || '').toLowerCase()));
  }

  // ---------------------------------------------------------------------------
  // Punto 5 del piano di miglioramento IA: verifica incrociata delle righe
  // lette dall'AI col catalogo prodotti REALE (store.searchProdotti,
  // server-side — il catalogo può avere ~21.000 righe, non va mai scaricato
  // per intero). Un OCR/una foto può leggere male una cifra di un codice o
  // storpiare una parola della descrizione: se il codice letto esiste per
  // intero a catalogo, la descrizione viene sostituita con quella ufficiale
  // (più affidabile della lettura); se il codice non torna ma la
  // descrizione combacia (a normalizzazione) con UN solo prodotto, il
  // codice viene completato da lì. Se niente combacia la riga resta
  // com'è: non è per forza un errore di lettura, può essere un prodotto
  // non ancora a catalogo — ma va segnalato perché l'utente lo verifichi
  // prima di salvare. Non tocca MAI qty/prezzo/sconto/iva: sono dati della
  // transazione, non del catalogo (un prezzo pattuito può legittimamente
  // differire dal listino).
  function normDescr(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  async function crossCheckRiga(store, companyId, riga) {
    const r = Object.assign({}, riga);
    r.catalogMatch = 'unmatched';
    try {
      if (r.cod) {
        const found = await store.searchProdotti(companyId, r.cod, 5);
        const exact = found.find(p => (p.cod || '').toLowerCase() === String(r.cod).toLowerCase());
        if (exact) { r.descr = exact.descr; r.catalogMatch = 'matched'; return r; }
      }
      if (r.descr) {
        const found = await store.searchProdotti(companyId, r.descr, 5);
        const nd = normDescr(r.descr);
        const candidate = nd && found.find(p => normDescr(p.descr) === nd);
        if (candidate) { r.cod = candidate.cod; r.descr = candidate.descr; r.catalogMatch = 'corrected'; }
      }
    } catch (e) { /* ricerca catalogo non riuscita (rete): riga lasciata come letta dall'AI, mai un blocco */ }
    return r;
  }

  // Tutte le righe insieme, in parallelo (poche righe per documento — una
  // fattura/ordine reale ne ha raramente più di una ventina).
  function crossCheckRighe(store, companyId, righe) {
    return Promise.all((righe || []).map(r => crossCheckRiga(store, companyId, r)));
  }

  // Badge HTML per l'esito di crossCheckRighe, da appendere alla cella
  // "Codice" di una riga nell'editor — assente (stringa vuota) per una riga
  // senza r.catalogMatch, cioè aggiunta a mano o già salvata in precedenza:
  // il confronto vale solo per righe appena importate dall'AI.
  function catalogBadgeHtml(catalogMatch) {
    if (catalogMatch === 'matched') return '<span class="cat-badge cat-ok" title="Codice trovato nel catalogo: descrizione allineata a quella ufficiale">✓ a catalogo</span>';
    if (catalogMatch === 'corrected') return '<span class="cat-badge cat-ok" title="Codice non letto (o errato) nell\'allegato, ritrovato a catalogo dalla descrizione">✓ codice completato</span>';
    if (catalogMatch === 'unmatched') return '<span class="cat-badge cat-warn" title="Nessun prodotto corrispondente trovato nel catalogo: verifica codice/descrizione, oppure è un prodotto non ancora censito">⚠ non in catalogo</span>';
    return '';
  }

  global.SaasAiImport = {
    readFileAsDataUrl, loadPdfJs, pdfToImageDataUrls, fileToImages, parseAiJson, extractFromFile, findPartyByNome,
    crossCheckRighe, catalogBadgeHtml,
  };
})(window);
