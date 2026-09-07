/* ============================================================================
 * fatturapa-xml.js — lettura DETERMINISTICA (non AI) di una fattura o nota
 * di credito elettronica italiana in formato FatturaPA (XML), ricevuta da
 * un fornitore — porta l'informazione dallo stesso XML che il fornitore ha
 * trasmesso, invece di passare da OCR/AI su un PDF stampato dello stesso
 * documento: qui i dati sono già strutturati, non c'è nulla da "leggere"
 * come in una foto o un PDF scansionato.
 *
 * Richiesta reale: "devo caricare questa fattura fornitori ma se premo
 * importa nn la vede" — il file era un .xml FatturaPA, e il campo di
 * caricamento (SaasAiImport, vedi ai-import.js) accetta solo
 * "application/pdf,image/*": un .xml non compare nemmeno nella finestra di
 * scelta del file, prima ancora di arrivare all'AI.
 *
 * Perché un modulo a sé (non dentro ai-import.js, non un altro giro
 * dell'AI su questo testo): niente store.aiComplete(), niente limite
 * mensile di uso AI (0011_limite_ai.sql), nessun costo, e lo stesso file
 * dà sempre lo stesso risultato (un modello può leggere la stessa
 * immagine in modo leggermente diverso due volte, un parser XML no). Le
 * pagine che lo usano (fatture-fornitore.html, note-credito-fornitore.html)
 * lo intercettano PRIMA di passare il file a SaasAiImport.extractFromFile():
 * se il file è un .xml, questo modulo lo legge da solo; altrimenti
 * (PDF/foto) il flusso AI resta quello di sempre. Stessa identica forma
 * dell'oggetto restituito dall'AI ({fornitore, numero, data,
 * riferimentoOrdine, righe:[...]}), così il codice che lo riceve non sa
 * (e non deve sapere) da dove sia arrivato.
 *
 * Interrogazione per NOME LOCALE dell'elemento (getElementsByTagNameNS('*',
 * nome), non per tag esatto: alcuni software di fatturazione applicano il
 * prefisso di namespace a OGNI elemento (es. "p:FatturaElettronicaHeader"),
 * altri solo alla radice (come nel file di questa richiesta, dove la radice
 * è "P:FatturaElettronica" ma i figli non hanno prefisso) — cercare per
 * nome locale funziona in entrambi i casi. Stessa identica tecnica già
 * usata da parseFatturaXML() in index.html (il vecchio gestionale legge
 * già così un XML caricato a mano, mai collegato a questo import
 * PDF/foto-AI della SaaS) — struttura e matching qui sotto ricalcano
 * apposta quella funzione già in produzione da anni, non reinventata.
 *
 * Limiti noti, non affrontati qui (nessun caso reale ancora incontrato che
 * li richieda):
 *  - .p7m (l'XML firmato "a busta", diverso dall'XML con firma XMLDSig
 *    incorporata come nel file di questa richiesta): è un contenitore
 *    CAdES/PKCS#7 — servirebbe una libreria di parsing crittografico (es.
 *    forge.js) solo per ESTRARRE l'XML da dentro; la firma in sé non
 *    interessa (non la verifichiamo, come non verifichiamo la firma di un
 *    PDF). Un .xml con la firma XMLDSig già dentro l'XML (come qui) non ha
 *    questo problema: DOMParser lo legge senza bisogno di sbustarlo.
 *  - Sconto/maggiorazione a IMPORTO fisso (elemento "Importo" invece di
 *    "Percentuale" dentro ScontoMaggiorazione): il campo "sconto" del
 *    gestionale è sempre una percentuale (anche a cascata, "50+15") — un
 *    importo fisso viene ignorato (riga letta senza sconto, prezzo pieno),
 *    da correggere a mano se capita.
 *  - Un file con più "FatturaElettronicaBody" (più fatture nello stesso
 *    XML, ammesso dallo standard per l'invio massivo): legge solo la prima.
 * ============================================================================ */

(function (global) {
  'use strict';

  function text(el) { return el ? (el.textContent || '').trim() : ''; }
  // Cerca tra i DISCENDENTI (a qualunque profondità) gli elementi con
  // questo nome locale, ignorando un eventuale prefisso di namespace —
  // getElementsByTagNameNS('*', nome) fa esattamente questo nativamente,
  // niente da filtrare a mano (vedi G()/GA() in parseFatturaXML(),
  // index.html, la stessa identica tecnica).
  function byLocalName(root, tag) { return root ? Array.from(root.getElementsByTagNameNS('*', tag)) : []; }
  function first(root, tag) { return byLocalName(root, tag)[0] || null; }
  function firstText(root, tag) { return text(first(root, tag)); }

  // Sconti/maggiorazioni a cascata, stessa stringa "N+M" usata ovunque nel
  // gestionale (vedi scFactor() in ogni modulo documento) — solo quelli
  // espressi in percentuale, vedi nota in testa al file. Una maggiorazione
  // (Tipo="MG", es. un costo imballo in aumento) diventa un valore
  // negativo nella stringa: la stessa aritmetica a cascata la applica come
  // un "aumento" invece che uno sconto.
  function scontoFromLinea(linea) {
    const parts = byLocalName(linea, 'ScontoMaggiorazione')
      .map(sm => ({ tipo: firstText(sm, 'Tipo'), perc: firstText(sm, 'Percentuale') }))
      .filter(sm => sm.perc !== '');
    if (!parts.length) return '';
    return parts.map(sm => sm.tipo === 'MG' ? '-' + sm.perc : sm.perc).join('+');
  }

  // Il codice articolo del fornitore spesso significa poco per il NOSTRO
  // catalogo (un EAN, o un suo codice interno) — quando il fornitore
  // riporta anche il NOSTRO codice (visto finora in
  // AltriDatiGestionali/TipoDato="Prodotto", es. B.Braun), quello ha
  // sempre la precedenza: è l'unico che crossCheckRighe() a valle (vedi
  // ai-import.js, invariato: le righe passano da lì comunque) può
  // ritrovare per intero nel nostro catalogo. In mancanza, un
  // CodiceArticolo non di tipo EAN è un ripiego migliore di un EAN puro.
  function codFromLinea(linea) {
    const prodotto = byLocalName(linea, 'AltriDatiGestionali')
      .find(d => firstText(d, 'TipoDato').toLowerCase() === 'prodotto');
    if (prodotto) { const v = firstText(prodotto, 'RiferimentoTesto'); if (v) return v; }
    const articoli = byLocalName(linea, 'CodiceArticolo');
    const nonEan = articoli.find(c => firstText(c, 'CodiceTipo').toUpperCase() !== 'EAN');
    if (nonEan) { const v = firstText(nonEan, 'CodiceValore'); if (v) return v; }
    if (articoli.length) return firstText(articoli[0], 'CodiceValore');
    return '';
  }

  // "Contiene", non "è esattamente" (es. anche un TipoDato accorpato tipo
  // "LOTTO/PARTITA"): stesso confronto di parseFatturaXML() in index.html,
  // deliberatamente più permissivo che un match esatto — un'etichetta
  // insolita letta con un match esatto sparirebbe in silenzio, con
  // .includes() nel dubbio la si prende comunque.
  function altriDatoIncludes(linea, needle) {
    return byLocalName(linea, 'AltriDatiGestionali').find(d => firstText(d, 'TipoDato').toUpperCase().includes(needle)) || null;
  }

  function parseRiga(linea) {
    const lottoNode = altriDatoIncludes(linea, 'LOTTO') || altriDatoIncludes(linea, 'PARTITA');
    const scadNode = altriDatoIncludes(linea, 'SCAD');
    // RiferimentoData è il campo "giusto" per una data, ma un fornitore che
    // la scrive in RiferimentoTesto (fuori standard, capita) non deve
    // sparire in silenzio — stesso doppio tentativo di parseFatturaXML().
    const scadRaw = scadNode ? (firstText(scadNode, 'RiferimentoData') || firstText(scadNode, 'RiferimentoTesto')) : '';
    return {
      cod: codFromLinea(linea),
      descr: firstText(linea, 'Descrizione'),
      qty: parseFloat(firstText(linea, 'Quantita')) || 1,
      prezzo: parseFloat(firstText(linea, 'PrezzoUnitario')) || 0,
      sconto: scontoFromLinea(linea),
      iva: parseFloat(firstText(linea, 'AliquotaIVA')) || 22,
      lotto: lottoNode ? firstText(lottoNode, 'RiferimentoTesto') : '',
      scad: /^\d{4}-\d{2}-\d{2}/.test(scadRaw) ? scadRaw.slice(0, 10) : '',
    };
  }

  // Ragione sociale del CedentePrestatore (chi emette il documento — il
  // fornitore, quando noi siamo il CessionarioCommittente): "Denominazione"
  // per una società, altrimenti "Nome"+"Cognome" per una persona fisica —
  // alternativi nello schema FatturaPA, mai presenti insieme.
  function ragioneSociale(anagrafica) {
    const den = firstText(anagrafica, 'Denominazione');
    if (den) return den;
    const nome = firstText(anagrafica, 'Nome'), cognome = firstText(anagrafica, 'Cognome');
    return [nome, cognome].filter(Boolean).join(' ');
  }

  function looksLikeXmlFile(file) {
    return /\.xml$/i.test(String(file && file.name || ''));
  }

  // file -> stesso oggetto {fornitore, numero, data, riferimentoOrdine,
  // righe} che SaasAiImport.extractFromFile() restituirebbe per un
  // PDF/foto dello stesso documento — vedi la nota in testa al file.
  // fornitorePiva/fornitoreCf in più (l'AI non li legge): servono solo a
  // chi chiama per accorgersi di aver caricato una PROPRIA fattura di
  // vendita invece che una ricevuta da un fornitore (confrontandoli con la
  // P.IVA/CF della propria azienda) — questo modulo si limita a leggere il
  // documento, non sa cos'è "la nostra azienda".
  async function parseFatturaPAFile(file) {
    const xmlText = await file.text();
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('file XML non valido o corrotto');
    }
    const root = doc.documentElement;
    if (!root || !/FatturaElettronica$/.test(root.tagName)) {
      throw new Error('non sembra un file FatturaPA (elemento radice inatteso)');
    }
    const header = first(root, 'FatturaElettronicaHeader');
    const body = first(root, 'FatturaElettronicaBody'); // solo la prima, vedi nota in testa al file
    if (!header || !body) throw new Error('struttura FatturaPA incompleta (header o body mancante)');

    const cedente = first(header, 'CedentePrestatore');
    const anagrafica = cedente ? first(cedente, 'DatiAnagrafici') : null;
    const fornitore = anagrafica ? ragioneSociale(first(anagrafica, 'Anagrafica')) : '';
    const idFiscale = anagrafica ? first(anagrafica, 'IdFiscaleIVA') : null;
    const fornitorePiva = idFiscale ? firstText(idFiscale, 'IdCodice') : '';
    const fornitoreCf = anagrafica ? firstText(anagrafica, 'CodiceFiscale') : '';

    const datiDoc = first(body, 'DatiGeneraliDocumento');
    const numero = firstText(datiDoc, 'Numero');
    const dataRaw = firstText(datiDoc, 'Data');
    const data = /^\d{4}-\d{2}-\d{2}/.test(dataRaw) ? dataRaw.slice(0, 10) : '';

    // "Il nostro numero d'ordine come lo riporta il fornitore" — la stessa
    // cosa che l'AI cerca nel testo libero di un PDF (es. "Vs.ord. 202"),
    // qui è un campo a sé dello standard (DatiOrdineAcquisto/IdDocumento),
    // quando il fornitore lo ha valorizzato.
    const datiOrdine = first(body, 'DatiOrdineAcquisto');
    const riferimentoOrdine = datiOrdine ? firstText(datiOrdine, 'IdDocumento') : '';

    const righe = byLocalName(body, 'DettaglioLinee').map(parseRiga);

    return { fornitore, numero, data, riferimentoOrdine, righe, fornitorePiva, fornitoreCf };
  }

  global.SaasFatturaPA = { parseFatturaPAFile, looksLikeXmlFile };
})(window);
