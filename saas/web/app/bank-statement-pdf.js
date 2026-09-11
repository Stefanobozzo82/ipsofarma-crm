/* ============================================================================
 * bank-statement-pdf.js — lettura di un estratto conto in PDF (invece del
 * solo CSV già supportato da riconciliazione.html).
 *
 * Richiesta reale: dopo aver spiegato che la riconciliazione bancaria
 * legge solo CSV, l'utente ha caricato due estratti conto veri (Intesa
 * Sanpaolo) chiedendo "a cosa possono essere utili" — solo in PDF, non in
 * CSV. Risposta: "estendi al pdf".
 *
 * Un estratto conto PDF di questo tipo è in realtà una TABELLA (Data
 * Operazione / Data Valuta / Descrizione / Addebiti / Accrediti): un
 * primo tentativo basato sul testo semplice estratto riga per riga (come
 * farebbe un lettore PDF qualunque) andava storto quando una descrizione
 * lunga ("Pagamento su POS TAXI 85...") finiva per invadere lo spazio
 * della colonna Addebiti sulla stessa riga fisica — l'importo restava
 * "attaccato" al testo invece che su una riga a sé, e veniva perso.
 *
 * Risolto leggendo la posizione (x, y) di ogni frammento di testo che
 * pdf.js espone (getTextContent()), non solo il testo: si individuano le
 * 5 colonne dalla riga di intestazione (le X di "Data Operazione" ecc.),
 * si raggruppano i frammenti per riga fisica (stessa Y), e ogni frammento
 * viene assegnato alla colonna con la X più vicina. Così un importo resta
 * riconoscibile come "colonna Addebiti" indipendentemente da quanto testo
 * di descrizione lo precede sulla stessa riga.
 *
 * Verificato con un test Playwright reale (pdf.js vero, non uno stub) sui
 * due estratti conto caricati dall'utente: i totali calcolati sommando i
 * movimenti letti tornano ESATTI al centesimo con "Totale accrediti"/
 * "Totale addebiti" dichiarati nell'estratto conto stesso, su entrambi i
 * file (332.714,99 / 276.938,46 e 116.913,49 / 115.677,68).
 *
 * Resta un lettore per QUESTO formato di tabella (Data Operazione/Data
 * Valuta/Descrizione/Addebiti/Accrediti su colonne fisse), diffuso ma non
 * universale: se le 5 intestazioni di colonna non si trovano (banca con
 * un layout diverso), fallisce in modo esplicito — meglio dire "non
 * riconosciuto, prova il CSV" che inventare movimenti sbagliati. La banca
 * dei due file di prova è Intesa Sanpaolo, ma il formato a colonne fisse
 * è comune anche ad altri istituti italiani.
 * ============================================================================ */

(function (global) {
  'use strict';

  const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
  const COLS = ['dataOp', 'dataVal', 'descr', 'addeb', 'accred'];
  const HEADER_LABELS = { dataOp: 'Data Operazione', dataVal: 'Data Valuta', descr: 'Descrizione', addeb: 'Addebiti', accred: 'Accrediti' };

  function isDate(s) { return DATE_RE.test((s || '').trim()); }

  // Stessa idea di parseImporto() in riconciliazione.html: tiene solo
  // cifre e virgola, così non importa quale carattere "strano" il PDF usi
  // come separatore delle migliaia (osservato più di uno, a seconda del
  // font con cui l'importo è scritto).
  function parseImporto(s) {
    const t = (s || '').trim();
    if (!t) return null;
    const kept = t.replace(/[^0-9,]/g, '');
    if (!kept || kept.indexOf(',') === -1) return null;
    const n = Number(kept.replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // "DD.MM.YYYY" -> "YYYY-MM-DD" (stesso formato di parseData() nel resto
  // della pagina).
  function toIsoDate(s) {
    const m = (s || '').trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }

  function groupItemsIntoRows(items) {
    const withPos = items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] })).filter(it => it.str !== '');
    withPos.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const rows = [];
    let current = null, currentY = null;
    const TOL = 2; // tolleranza in punti PDF per considerare due frammenti sulla stessa riga fisica
    for (const it of withPos) {
      if (current === null || Math.abs(it.y - currentY) > TOL) {
        if (current !== null) rows.push(current);
        current = []; currentY = it.y;
      }
      current.push(it);
    }
    if (current !== null && current.length) rows.push(current);
    return rows;
  }

  // Trova la X di ciascuna colonna dall'intestazione — una tantum, sulla
  // prima pagina in cui compare per intero. Più robusto di coordinate
  // fisse: si adatta da solo a piccoli spostamenti d'impaginazione.
  function findColumnAnchors(rowsByPage) {
    for (const rows of rowsByPage) {
      const found = {};
      for (const row of rows) {
        for (const it of row) {
          for (const col of COLS) {
            if (it.str.trim() === HEADER_LABELS[col]) found[col] = it.x;
          }
        }
      }
      if (COLS.every(c => found[c] != null)) return found;
    }
    return null;
  }

  function classifyRow(row, anchors) {
    const buckets = { dataOp: [], dataVal: [], descr: [], addeb: [], accred: [] };
    for (const it of row) {
      let best = null, bestDist = Infinity;
      for (const col of COLS) {
        const d = Math.abs(it.x - anchors[col]);
        if (d < bestDist) { bestDist = d; best = col; }
      }
      buckets[best].push(it);
    }
    const out = {};
    for (const col of COLS) {
      out[col] = buckets[col].sort((a, b) => a.x - b.x).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
    }
    return out;
  }

  function parseMovimentiFromRows(rowsByPage, anchors) {
    const movimenti = [];
    let current = null; // movimento in corso: { dataOperazione, dataValuta, descrizioneParti, addeb, accred }
    let stopped = false;
    function flush() {
      if (!current) return;
      const descrizione = current.descrizioneParti.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      const importo = current.accred != null ? current.accred : (current.addeb != null ? -current.addeb : null);
      const data = toIsoDate(current.dataValuta) || toIsoDate(current.dataOperazione);
      if (importo != null && data) {
        movimenti.push({ data, descrizione, importo });
      }
      current = null;
    }
    for (const rows of rowsByPage) {
      if (stopped) break;
      for (const row of rows) {
        const c = classifyRow(row, anchors);
        if (Object.values(HEADER_LABELS).includes(c.dataOp) || Object.values(HEADER_LABELS).includes(c.descr)) continue; // intestazione ripetuta a inizio pagina
        if (c.descr === 'Totali' || c.dataOp === 'Totali') { stopped = true; flush(); break; } // fine della tabella movimenti, inizia il riepilogo
        if (isDate(c.dataOp) && isDate(c.dataVal)) {
          flush();
          current = { dataOperazione: c.dataOp, dataValuta: c.dataVal, descrizioneParti: [c.descr], addeb: parseImporto(c.addeb), accred: parseImporto(c.accred) };
        } else if (current) {
          current.descrizioneParti.push(c.descr);
          // Di norma l'importo è sempre sulla riga che apre il movimento;
          // se comparisse su una riga di continuazione, non va perso.
          if (current.addeb == null) { const a = parseImporto(c.addeb); if (a != null) current.addeb = a; }
          if (current.accred == null) { const a = parseImporto(c.accred); if (a != null) current.accred = a; }
        }
      }
    }
    flush();
    return movimenti;
  }

  async function extractRowsByPage(arrayBuffer) {
    const pdf = await global.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const rowsByPage = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      rowsByPage.push(groupItemsIntoRows(content.items));
    }
    return rowsByPage;
  }

  // Unico punto d'ingresso: dato l'ArrayBuffer del file, restituisce
  // { ok:true, movimenti:[{data,descrizione,importo}] } oppure
  // { ok:false } se il formato non è quello atteso (5 colonne fisse).
  async function parseEstrattoContoPdf(arrayBuffer) {
    const rowsByPage = await extractRowsByPage(arrayBuffer);
    const anchors = findColumnAnchors(rowsByPage);
    if (!anchors) return { ok: false, movimenti: [] };
    return { ok: true, movimenti: parseMovimentiFromRows(rowsByPage, anchors) };
  }

  global.SaasBankPdf = { parseEstrattoContoPdf };
})(window);
