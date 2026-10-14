/* ============================================================================
 * print.js — stampa e PDF di un documento (ordine, DDT, fattura, nota di
 * credito, preventivo), stesso template usato in index.html (buildPrintHTML/
 * PA_PRINT_CSS), riportato qui con i nomi di campo del SaaS (clienteId,
 * fornitoreId, ... invece delle colonne del vecchio DB in-memory) e con i
 * dati azienda letti da "companies" (nome/piva/cf/pec/sdi_codice/indirizzo/
 * settings) invece che da DB.azienda.
 *
 * Due modi di ottenere il documento, come nell'originale:
 * - "Stampa" apre una finestra a sé con lo stesso HTML e invoca subito
 *   window.print() — usa la stampa del browser corrente, nessuna libreria.
 * - "PDF" genera un file scaricabile con jsPDF + html2canvas (caricate da
 *   CDN al primo utilizzo, non nel bundle): stesso template della stampa,
 *   così il PDF scaricato è sempre identico a quello che si vede stampando.
 *
 * Se il documento indica una destinazione di consegna diversa dalla sede
 * legale (destId, gestite in clienti.html — vedi CDEST), compare un
 * riquadro verde a parte con l'indirizzo di consegna, esattamente come
 * nell'originale (docDest()).
 *
 * Semplificazioni deliberate rispetto all'originale: niente "stampa in
 * ufficio" via coda GitHub/agente Windows (specifico del gestionale
 * originale, non ha senso per un SaaS multi-azienda con stampanti diverse
 * per ognuna), niente PDF collettivo per più documenti insieme.
 * ============================================================================ */

(function (global) {
  'use strict';

  const TITLES = {
    ordiniCliente: 'ORDINE CLIENTE', ordiniFornitore: 'ORDINE A FORNITORE',
    ddt: 'DOCUMENTO DI TRASPORTO', ddtFornitore: 'DOCUMENTO DI TRASPORTO FORNITORE',
    fattureCliente: 'FATTURA', fattureFornitore: 'FATTURA FORNITORE',
    preventivi: 'PREVENTIVO', noteCredito: 'NOTA DI CREDITO', noteCreditoFornitore: 'NOTA DI CREDITO FORNITORE',
  };
  const FORN_COLLS = new Set(['ordiniFornitore', 'ddtFornitore', 'fattureFornitore', 'noteCreditoFornitore']);

  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function eur(n) { return (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }); }
  function fdate(s) { return s ? new Date(s + 'T00:00:00').toLocaleDateString('it-IT') : ''; }

  // Stessa aritmetica dello sconto usata in tutte le pagine del SaaS
  // (cascata "N+M"), qui anche l'etichetta da mostrare in stampa.
  function scParts(s) { return String(s == null ? '' : s).split('+').map(x => parseFloat(String(x).trim()) || 0); }
  function scFactor(s) { return scParts(s).reduce((f, p) => f * (1 - p / 100), 1); }
  function scEff(s) { return +(((1 - scFactor(s)) * 100).toFixed(2)); }
  function scLabel(s) { const e = scEff(s); if (e <= 0) return '—'; return String(s).includes('+') ? String(s).replace(/\s/g, '') + ' %' : e + '%'; }
  function lineNet(r) { return (r.qty || 0) * (r.prezzo || 0) * scFactor(r.sconto); }
  function imp(righe) { return (righe || []).reduce((s, r) => s + lineNet(r), 0); }
  function ivaT(righe) { return (righe || []).reduce((s, r) => s + lineNet(r) * (r.iva || 0) / 100, 0); }
  function tot(righe) { return imp(righe) + ivaT(righe); }

  const PRINT_CSS = `.pa-lines tr,.pa-party,.pa-tot{break-inside:avoid}
.pa-doc{font-family:system-ui,-apple-system,sans-serif;color:#1b2531;font-size:12px;line-height:1.5;max-width:780px;margin:0 auto;padding:12mm;background:#fff}
.pa-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0ea371;padding-bottom:14px;margin-bottom:18px}
.pa-az{font-size:20px;font-weight:800;color:#0b855d}
.pa-azl{margin-top:4px;color:#444}
.pa-azm{margin-top:5px;color:#777;font-size:10.5px}
.pa-docbox{text-align:right}
.pa-t{font-size:13px;font-weight:700;letter-spacing:1px}
.pa-n{font-family:monospace;font-size:18px;font-weight:700;margin-top:3px}
.pa-d{color:#777;font-size:11px}
.pa-party{border:1px solid #d6dce3;border-radius:8px;padding:12px 14px;margin-bottom:16px;width:58%}
.pa-pl{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:#999;font-weight:700}
.pa-pn{font-weight:700;font-size:13px;margin:2px 0 4px}
.pa-pa{color:#444}
.pa-pm{color:#777;font-size:10.5px;margin-top:5px}
.pa-ship{border-color:#0ea371;background:#f4fbf8}
.pa-info{width:100%;border-collapse:collapse;margin-bottom:16px}
.pa-info td{border:1px solid #d6dce3;padding:8px 10px;width:25%;vertical-align:top;font-size:11px}
.pa-info b{font-size:8.5px;text-transform:uppercase;letter-spacing:.5px;color:#999;font-weight:700}
.pa-lines{width:100%;border-collapse:collapse;margin-bottom:14px}
.pa-lines th{background:#f4f6f8;text-align:left;padding:8px 10px;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:#666;border-bottom:1px solid #d6dce3}
.pa-lines td{padding:8px 10px;border-bottom:1px solid #eceff2}
.pa-lines .r,.pa-tot .r{text-align:right;font-family:monospace}
.pa-tot{display:flex;justify-content:flex-end;margin-bottom:12px}
.pa-tot table{min-width:260px;border-collapse:collapse}
.pa-tot td{padding:5px 10px}
.pa-tot tr.g td{border-top:2px solid #1b2531;font-weight:700;font-size:14px}
.pa-note{background:#f4f6f8;border-left:3px solid #0ea371;padding:8px 12px;font-size:10.5px;margin-bottom:8px;border-radius:0 6px 6px 0}
.pa-usernote{white-space:pre-wrap}
.pa-foot-note{font-size:10px;color:#999;margin-top:6px}
.pa-footer{margin-top:26px;padding-top:10px;border-top:1px solid #e5e9ee;font-size:9.5px;color:#aaa;text-align:center}
/* Solo per l'anteprima a schermo di openPrintWindow() su un telefono (max-width
   780px del .pa-doc è pensata per la pagina A4, più larga di molti schermi):
   la tabella righe scorre nel proprio riquadro invece di sforare la pagina.
   Nel PDF (renderToJsPDF, contenitore già largo 780px, mai overflow qui) e
   nella stampa vera (@media print sotto: overflow torna visible) non cambia
   nulla — un overflow:auto stampato verrebbe RITAGLIATO alla sola porzione
   visibile a schermo, quindi il reset qui è necessario, non solo estetico. */
.pa-lines-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
@media print{.pa-lines-wrap{overflow:visible}}`;

  // Inietta il CSS una volta sola nella pagina corrente: serve perché il
  // contenitore usato per generare il PDF (vedi downloadPDF) vive dentro
  // questa stessa pagina, non in un documento a sé.
  function ensureCssInjected() {
    if (document.getElementById('saas-print-css')) return;
    const style = document.createElement('style');
    style.id = 'saas-print-css';
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
  }

  // Indirizzo su due righe (via / CAP città (prov)). Ogni parte passa da
  // esc(): sono dati scritti a mano o importati da Maestro, e questo HTML
  // finisce in innerHTML e in una finestra dello stesso sito — un "<" in un
  // indirizzo non deve mai diventare codice.
  function addrHtml(a) {
    const loc = `${a.cap || ''} ${a.citta || ''}${a.prov ? ' (' + a.prov + ')' : ''}`.trim();
    return [a.via, loc].filter(Boolean).map(esc).join('<br>');
  }

  function buildPrintHTML(coll, it, party, company) {
    ensureCssInjected();
    const az = company || {};
    const ind = az.indirizzo || {};
    const set = az.settings || {};
    const p = party || {};
    const isForn = FORN_COLLS.has(coll);
    const azLine = addrHtml(ind);
    const azMeta = [az.piva ? 'P.IVA ' + az.piva : '', az.cf && az.cf !== az.piva ? 'C.F. ' + az.cf : '', set.tel ? 'Tel ' + set.tel : '', set.email || '', az.pec ? 'PEC ' + az.pec : '', set.web || ''].filter(Boolean).map(esc).join(' · ');
    const pAddr = addrHtml(p);
    // Destinazione di consegna diversa dalla sede legale, se il documento
    // ne indica una (destId) e il cliente ne ha di registrate — stessa
    // idea di docDest() nell'originale.
    const dst = (!isForn && it.destId && p.dest) ? p.dest.find(x => x.id === it.destId) || null : null;
    const dstAddr = dst ? addrHtml(dst) : '';
    const shipBlock = dst ? `<div class="pa-party pa-ship"><div class="pa-pl">Luogo di consegna</div><div class="pa-pn">${esc(dst.nome) || esc(p.nome)}</div><div class="pa-pa">${dstAddr}</div></div>` : '';
    // Col riquadro di consegna separato, quello del cliente indica solo il
    // destinatario (altrimenti i due riquadri si contraddicono, entrambi
    // etichettati "luogo di consegna" ma con indirizzi diversi).
    const partyLabel = isForn ? 'Spettabile fornitore' : (coll === 'ddt' ? (dst ? 'Destinatario' : 'Destinatario / luogo di consegna') : 'Spettabile cliente');
    const pMeta = [p.piva ? 'P.IVA ' + p.piva : '', p.cf && p.cf !== p.piva ? 'C.F. ' + p.cf : '', p.sdi ? 'Cod. SDI ' + p.sdi : '', p.pec ? 'PEC ' + p.pec : ''].filter(Boolean).map(esc).join('<br>');
    // ddtFornitore incluso: un DDT (cliente o fornitore) non riporta mai
    // prezzi — richiesta reale dopo il primo collaudo con documenti veri
    // ("togli prezzi e sconti e iva perché non ci sono"), estesa qui alla
    // stampa/export perché il dato non esiste più nemmeno nel documento
    // (vedi ddt-fornitore.html).
    const isDDT = coll === 'ddt' || coll === 'ddtFornitore';
    const righe = it.righe || [];
    const hasSc = !isDDT && righe.some(r => scEff(r.sconto) > 0);
    const hasLot = ['ddt', 'ddtFornitore', 'fattureCliente', 'fattureFornitore', 'noteCredito'].includes(coll) && righe.some(r => r.lotto || r.scad);
    const rows = righe.map(r => `<tr><td>${esc(r.cod)}</td><td>${esc(r.descr)}</td>${hasLot ? `<td>${esc(r.lotto) || '—'}</td><td class="r">${r.scad ? fdate(r.scad) : '—'}</td>` : ''}<td class="r">${esc(r.qty)}</td>${isDDT ? '' : `<td class="r">${eur(r.prezzo)}</td><td class="r">${eur(lineNet(r))}</td>${hasSc ? `<td class="r">${scLabel(r.sconto)}</td>` : ''}<td class="r">${r.iva}%</td><td class="r">${eur(lineNet(r) * (1 + (r.iva ?? 22) / 100))}</td>`}</tr>`).join('');
    // Solo per il DDT cliente: "Vendita"/"Mittente" ha senso dal nostro
    // punto di vista di chi spedisce — su un DDT fornitore (ricevuto, non
    // emesso da noi) sarebbe fuorviante, per questo resta fuori da isDDT
    // qui sopra (che serve solo a nascondere i prezzi su entrambi).
    let ddtBlock = '';
    if (coll === 'ddt') ddtBlock = `<table class="pa-info"><tr><td><b>Causale del trasporto</b><br>Vendita</td><td><b>Trasporto a cura di</b><br>Mittente</td><td><b>Porto</b><br>Franco</td><td><b>Aspetto dei beni</b><br>Colli n. ${esc(it.colli) || '____'}</td></tr></table>`;
    const userNote = it.note ? `<div class="pa-note pa-usernote"><b>Note:</b> ${esc(it.note)}</div>` : '';
    let note = '';
    // Split payment: la fattura lo dice per sé (campo split); per i documenti
    // che non lo hanno (es. note di credito) vale l'impostazione del cliente.
    const splitDoc = coll === 'fattureCliente' ? it.split === true : (coll === 'noteCredito' && p.split === 'si');
    if (coll === 'fattureCliente' || coll === 'noteCredito') {
      if (splitDoc) note += '<div class="pa-note">Operazione soggetta a scissione dei pagamenti — art. 17‑ter DPR 633/72. IVA versata dall\'ente acquirente.</div>';
      if (coll === 'noteCredito' && it.fatturaId) note += `<div class="pa-note">A storno (parziale) della fattura collegata.</div>`;
      if (coll === 'fattureCliente') {
        const term = p.term ? `Pagamento: ${esc(p.pag || 'Bonifico')} a ${esc(p.term)} gg` : '';
        const iban = set.iban ? ` · IBAN ${esc(set.iban)}` : '';
        if (term || iban) note += `<div class="pa-note">${term}${iban}</div>`;
      }
      note += '<div class="pa-foot-note">Documento privo di valore fiscale se non trasmesso allo SDI tramite il sistema di fatturazione elettronica.</div>';
    }
    return `<div class="pa-doc">
      <div class="pa-head">
        <div><div class="pa-az">${esc(az.nome) || 'Azienda'}</div><div class="pa-azl">${azLine}</div><div class="pa-azm">${azMeta}</div></div>
        <div class="pa-docbox"><div class="pa-t">${TITLES[coll] || ''}</div><div class="pa-n">${esc(it.num)}</div><div class="pa-d">del ${fdate(it.data)}</div></div>
      </div>
      <div class="pa-party"><div class="pa-pl">${partyLabel}</div><div class="pa-pn">${esc(p.nome)}</div><div class="pa-pa">${pAddr}</div><div class="pa-pm">${pMeta}</div></div>
      ${shipBlock}
      ${ddtBlock}
      <div class="pa-lines-wrap"><table class="pa-lines"><thead><tr><th>Codice</th><th>Descrizione</th>${hasLot ? '<th>Lotto</th><th class="r">Scadenza</th>' : ''}<th class="r">Q.tà</th>${isDDT ? '' : `<th class="r">Prezzo</th><th class="r">Imponibile</th>${hasSc ? '<th class="r">Sconto</th>' : ''}<th class="r">IVA</th><th class="r">Totale</th>`}</tr></thead><tbody>${rows}</tbody></table></div>
      ${isDDT ? '' : `<div class="pa-tot"><table>
        <tr><td>Imponibile</td><td class="r">${eur(imp(righe))}</td></tr>
        <tr><td>IVA</td><td class="r">${eur(ivaT(righe))}</td></tr>
        <tr class="g"><td>Totale documento</td><td class="r">${eur(tot(righe))}</td></tr>
        ${splitDoc ? `<tr><td>IVA in scissione dei pagamenti</td><td class="r">− ${eur(ivaT(righe))}</td></tr>
        <tr class="g"><td>Netto a pagare</td><td class="r">${eur(imp(righe))}</td></tr>` : ''}
      </table></div>`}
      ${userNote}
      ${note}
      <div class="pa-footer">Documento generato con il gestionale</div>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Fatture e note di credito clienti: stesso layout della fattura stampata
  // da Maestro (richiesta di ottobre 2026, con la fattura 332 come modello).
  // Pagine A4 vere, in millimetri: intestazione con l'immagine dell'azienda
  // (settings.intestazione) e il riquadro "Spett.le", le caselle dei dati
  // del documento, le righe raggruppate per DDT e, in fondo all'ultima
  // pagina, totali, riepilogo IVA e scadenze. Stessa pagina per la stampa e
  // per il PDF (che fotografa una pagina alla volta, vedi renderToJsPDF).
  // ---------------------------------------------------------------------------
  const FX_COLLS = new Set(['fattureCliente', 'noteCredito', 'ddt']);
  const FX_TITLE = { fattureCliente: 'FATTURA', noteCredito: 'NOTA DI CREDITO', ddt: 'DOC. DI TRASPORTO' };
  const FX_CSS = `.fx-page{width:210mm;height:297mm;box-sizing:border-box;padding:9mm 10mm 7mm;position:relative;overflow:hidden;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.25;page-break-after:always;break-after:page}
.fx-page:last-child{page-break-after:auto;break-after:auto}
.fx-top{display:flex;justify-content:space-between;align-items:flex-start;height:48mm}
.fx-logo{width:92mm;position:relative;height:46mm}
.fx-cert{position:absolute;right:0;bottom:1mm;width:24mm;text-align:center;font-size:5.8pt;line-height:1.25;font-weight:700;color:#1b2531}
.fx-cert img{width:17mm!important;display:block;margin:0 auto 1mm}
.fx-logo img{width:92mm;display:block}
.fx-az{font-size:15pt;font-weight:700;color:#1f4e8c}
.fx-azl{font-size:8.5pt;margin-top:2mm;line-height:1.45}
.fx-dest{border:1px solid #000;width:88mm;height:42mm;margin-top:2mm;box-sizing:border-box;padding:2mm 4mm;position:relative}
.fx-dest .fx-l{position:static}
.fx-dn{font-size:10.5pt;margin-top:3mm}
.fx-da{font-size:10.5pt;margin-top:6mm;line-height:1.5}
.fx-dc{display:flex;justify-content:space-between;gap:4mm}
.fx-l{font-size:5.6pt;text-transform:uppercase;display:block;line-height:1.1}
.fx-v{font-size:10pt;text-align:center;display:block;margin-top:.4mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-v.left{text-align:left}
.fx-info{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:3mm}
.fx-info2{margin-top:-1px}
.fx-info td{border:1px solid #000;padding:.4mm 1mm .6mm;vertical-align:top;height:7mm;box-sizing:border-box}
.fx-lines{width:100%;border-collapse:separate;border-spacing:.6mm 0;table-layout:fixed;margin-top:1.4mm}
.fx-lines th{background:#808080;color:#fff;font-size:7.6pt;font-weight:700;padding:.5mm 1mm;text-align:center}
.fx-lines td{font-size:8.2pt;padding:.75mm 1mm;vertical-align:top}
.fx-lines td.n{text-align:right;white-space:nowrap}
.fx-lines td.c{text-align:center}
.fx-lines tr.fx-ddt td{font-weight:700;font-style:italic}
.fx-segue{position:absolute;right:10mm;bottom:9mm;font-size:8pt;font-style:italic}
.fx-bottom{position:absolute;left:10mm;right:10mm;bottom:9.5mm}
.fx-bottom table{width:100%;border-collapse:collapse;table-layout:fixed}
.fx-bottom td{border:1px solid #000;padding:.4mm 1mm .6mm;vertical-align:top;box-sizing:border-box}
.fx-bottom .fx-v{text-align:right;font-size:10pt}
.fx-bottom .fx-v.left{text-align:left}
.fx-tm{border-top:2.2px solid #000}
.fx-sp{font-size:6pt;letter-spacing:1.6mm;text-align:center;border-left:none;border-right:none}
.fx-tot .fx-v{font-size:11pt}
.fx-big{font-size:13pt!important;font-weight:700}
.fx-foot{position:absolute;left:10mm;right:10mm;bottom:2.5mm;text-align:center;font-size:7pt;line-height:1.3}
.fx-foot small{font-size:6pt}
@media screen{.fx-sheet{background:#e9ecef;padding:6mm 0}.fx-sheet .fx-page{margin:0 auto 6mm;box-shadow:0 1px 6px #0003}}
@media print{@page{size:A4;margin:0}html,body{margin:0;padding:0}.fx-sheet{background:none;padding:0}}`;

  function fxNum(n) {
    const last = String(n || '').split('/').pop();
    return last.replace(/^0+(?=\d)/, '');
  }
  // Formato italiano scritto a mano (1.234,56): toLocaleString in alcuni
  // ambienti non mette il punto delle migliaia sotto le 5 cifre.
  function fxN(v, dec) {
    const n = Number(v) || 0;
    const [int, frac] = Math.abs(n).toFixed(dec).split('.');
    return (n < 0 && Number(Math.abs(n).toFixed(dec)) !== 0 ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (frac ? ',' + frac : '');
  }
  function fxPag(p) {
    if (p.pag) return p.pag;
    const t = parseInt(p.term, 10);
    return t > 0 ? `Bonifico bancario ${t} gg d.f.` : 'Rimessa Diretta';
  }
  function fxDue(it, p) {
    const t = parseInt(p.term, 10);
    if (!it.data) return '';
    const d = new Date(it.data + 'T00:00:00');
    if (t > 0) d.setDate(d.getDate() + t);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  // Righe -> "unità" di altezza: una descrizione lunga va a capo nella
  // colonna (circa 42 caratteri per riga) e occupa due righe o più.
  function fxUnits(r) { return Math.max(1, Math.ceil(String(r.descr || '').length / 42)); }
  // Divide le righe in pagine: quelle intermedie ne contengono di più (non
  // hanno i totali in fondo), l'ultima lascia il posto ai riquadri finali.
  const FX_CAP = 33, FX_CAP_LAST = 24, FX_CAP_LAST_DDT = 27;
  function fxPaginate(rows, capLast) {
    capLast = capLast || FX_CAP_LAST;
    const pages = [];
    let i = 0;
    const units = rows.map(r => r.units);
    const rest = from => units.slice(from).reduce((s, u) => s + u, 0);
    while (rest(i) > capLast) {
      const page = []; let used = 0;
      // Mai tutte quelle rimaste: almeno una riga accompagna i totali.
      while (i < rows.length - 1 && used + units[i] <= FX_CAP) { page.push(rows[i]); used += units[i]; i++; }
      if (!page.length) { page.push(rows[i]); i++; }
      pages.push(page);
    }
    pages.push(rows.slice(i));
    return pages;
  }

  // Certificazione di qualità (settings.certificazione: {logo, norma,
  // numero}): il marchio dell'ente con norma e numero di certificato, nello
  // spazio libero dell'intestazione accanto ai contatti.
  function fxCertHtml(az, ctx) {
    const c = (az.settings || {}).certificazione;
    if (!c || !(c.norma || c.numero)) return '';
    return `<div class="fx-cert">${ctx.certImg ? `<img src="${ctx.certImg}" alt="">` : ''}<div>${esc(c.norma || '')}${c.numero ? '<br>Cert. n. ' + esc(c.numero) : ''}</div></div>`;
  }

  function fxImageHtml(az, ctx) {
    const set = az.settings || {};
    if (ctx.headerImg) return `<img src="${ctx.headerImg}" alt="${esc(az.nome)}">${fxCertHtml(az, ctx)}`;
    const ind = az.indirizzo || {};
    const lines = [addrHtml(ind).replace('<br>', ' - '), set.web, set.email, set.tel ? 'Tel. ' + esc(set.tel) : '', az.piva ? 'P. IVA ' + esc(az.piva) : '']
      .filter(Boolean).map(x => (x === set.web || x === set.email) ? esc(x) : x).join('<br>');
    return `<div class="fx-az">${esc(az.nome) || 'Azienda'}</div><div class="fx-azl">${lines}</div>${fxCertHtml(az, ctx)}`;
  }

  function buildInvoiceHTML(coll, it, party, company, ctx) {
    ctx = ctx || {};
    const az = company || {};
    const set = az.settings || {};
    const ind = az.indirizzo || {};
    const p = party || {};
    const righe = it.righe || [];
    const split = coll === 'fattureCliente' ? it.split === true : (coll === 'noteCredito' && p.split === 'si');
    // Righe da stampare: in testa a quelle che vengono da un DDT, il
    // riferimento al DDT come nella fattura di Maestro.
    // DDT: stesso layout, ma senza prezzi (un DDT non ne riporta, vedi
    // buildPrintHTML) e con lotto e scadenza; in testa il riferimento
    // all'ordine da cui viene.
    const isDdt = coll === 'ddt';
    const rows = [];
    const ddt = ctx.ddt;
    if (!isDdt && ddt && righe.some(r => Number.isInteger(r.source_ddt_index))) {
      rows.push({ ddt: true, units: 1, text: `*** DDT N° ${fxNum(ddt.num)} del ${fdate(ddt.data)}` });
    }
    if (isDdt && ctx.ordine) rows.push({ ddt: true, units: 1, text: `*** ORDINE N° ${fxNum(ctx.ordine.num)} del ${fdate(ctx.ordine.data)}` });
    righe.forEach(r => rows.push({ r, units: fxUnits(r) }));
    const pages = fxPaginate(rows, isDdt ? FX_CAP_LAST_DDT : FX_CAP_LAST);
    const um = r => r.um || (ctx.um && ctx.um[r.cod]) || (r.cod ? 'PZ' : '');
    const rowHtml = x => isDdt
      ? (x.ddt ? `<tr class="fx-ddt"><td></td><td>${esc(x.text)}</td><td></td><td></td><td></td><td></td></tr>`
        : `<tr><td>${esc(x.r.cod)}</td><td>${esc(x.r.descr)}</td><td class="c">${esc(um(x.r))}</td><td class="n">${fxN(x.r.qty, Number.isInteger(Number(x.r.qty)) ? 0 : 2)}</td><td class="c">${esc(x.r.lotto || '')}</td><td class="c">${x.r.scad ? fdate(x.r.scad) : ''}</td></tr>`)
      : x.ddt
      ? `<tr class="fx-ddt"><td></td><td>${esc(x.text)}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`
      : `<tr><td>${esc(x.r.cod)}</td><td>${esc(x.r.descr)}</td><td class="c">${esc(um(x.r))}</td><td class="n">${fxN(x.r.qty, Number.isInteger(Number(x.r.qty)) ? 0 : 2)}</td><td class="n">${fxN(x.r.prezzo, 4)}</td><td class="c">${scEff(x.r.sconto) > 0 ? esc(String(x.r.sconto).replace(/\s/g, '')) : ''}</td><td class="n">${fxN(Math.round(lineNet(x.r) * 100) / 100, 2)}</td><td class="c">${esc(x.r.iva ?? '')}</td></tr>`;

    // Come Maestro (e la fattura elettronica): ogni riga arrotondata al
    // centesimo, l'IVA calcolata sull'imponibile di ciascuna aliquota.
    const c2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
    const perIva = {};
    righe.forEach(r => { const k = String(r.iva ?? 0); const b = perIva[k] = perIva[k] || { imp: 0, iva: 0 }; b.imp = c2(b.imp + c2(lineNet(r))); });
    Object.keys(perIva).forEach(k => { perIva[k].iva = c2(perIva[k].imp * Number(k) / 100); });
    const totImp = c2(Object.values(perIva).reduce((s, b) => s + b.imp, 0));
    const totIva = c2(Object.values(perIva).reduce((s, b) => s + b.iva, 0));
    const totDoc = c2(totImp + totIva);
    const ivaRows = Object.keys(perIva).sort((a, b) => b - a).map(k =>
      `<tr><td style="height:5.5mm"><span class="fx-v">${esc(k)}</span></td><td colspan="3"><span class="fx-v left">${Number(k) > 0 ? 'Aliquota ' + esc(k) + '%' : 'Esente / non imponibile'}${split && Number(k) > 0 ? ' - scissione pagamenti' : ''}</span></td><td colspan="2"><span class="fx-v">${fxN(perIva[k].imp, 2)}</span></td><td><span class="fx-v">${fxN(perIva[k].iva, 2)}</span></td></tr>`).join('');
    const nIva = Object.keys(perIva).length;
    const filler = nIva < 2 ? `<tr><td style="height:${(2 - nIva) * 5.5}mm"></td><td colspan="3"></td><td colspan="2"></td><td></td></tr>` : '';
    const daPagare = split ? totImp : totDoc;
    const bottom = `<div class="fx-bottom"><table>
      <colgroup><col style="width:7%"><col style="width:12%"><col style="width:9%"><col style="width:8%"><col style="width:13%"><col style="width:12%"><col style="width:12%"><col style="width:27%"></colgroup>
      <tr class="fx-tm"><td colspan="2" class="fx-tm"><span class="fx-l">Totale merce</span><span class="fx-v">${fxN(totImp, 2)}</span></td><td class="fx-tm"><span class="fx-l">Sc. cassa %</span><span class="fx-v"></span></td><td colspan="2" class="fx-tm"><span class="fx-l">Netto merce</span><span class="fx-v">${fxN(totImp, 2)}</span></td><td class="fx-tm"><span class="fx-l">Spese incasso</span><span class="fx-v">0,00</span></td><td class="fx-tm"><span class="fx-l">Spese trasporto</span><span class="fx-v">0,00</span></td><td class="fx-tm" style="padding:0"><table style="height:100%"><tr><td style="border:none;border-right:1px solid #000;width:50%"><span class="fx-l">Bolli in fattura</span><span class="fx-v">0,00</span></td><td style="border:none"><span class="fx-l">Acconto</span><span class="fx-v"></span></td></tr></table></td></tr>
      <tr><td colspan="7" class="fx-sp">RIEPILOGHI IVA</td><td rowspan="1" class="fx-tot" style="border-bottom:none"><span class="fx-l">Totale imponibile</span></td></tr>
      <tr><td><span class="fx-l">Cod. IVA</span></td><td colspan="3"><span class="fx-l">Descrizione cod. IVA</span></td><td colspan="2"><span class="fx-l">Imponibile</span></td><td><span class="fx-l">Imposta</span></td><td class="fx-tot" style="border-top:none" rowspan="${nIva + (filler ? 1 : 0) + 1}"><span class="fx-v">${fxN(totImp, 2)}</span><span class="fx-l" style="margin-top:3mm;border-top:1px solid #000;margin-left:-1mm;margin-right:-1mm;padding:.4mm 1mm 0">Totale imposta</span><span class="fx-v">${fxN(totIva, 2)}</span></td></tr>
      ${ivaRows}
      ${filler}
      <tr><td colspan="7" class="fx-sp">SCADENZE RATE E RELATIVO IMPORTO</td><td class="fx-tot" style="border-bottom:none"><span class="fx-l">Totale ${coll === 'noteCredito' ? 'nota di credito' : 'fattura'} (euro)</span></td></tr>
      <tr><td colspan="2" style="height:9mm"><span class="fx-v" style="text-align:right">${fxDue(it, p)}<br>${fxN(daPagare, 2)}</span></td><td></td><td colspan="2"></td><td></td><td></td><td class="fx-tot" style="border-top:none;vertical-align:bottom"><span class="fx-v fx-big">${fxN(totDoc, 2)}</span>${split ? `<span class="fx-l" style="text-align:right;text-transform:none;font-size:6.5pt">netto a pagare (split payment) ${fxN(totImp, 2)}</span>` : ''}</td></tr>
    </table></div>`;

    // DDT: in fondo i dati del trasporto e le firme, al posto dei totali.
    const bottomDdt = `<div class="fx-bottom"><table>
      <colgroup><col style="width:25%"><col style="width:12%"><col style="width:13%"><col style="width:25%"><col style="width:25%"></colgroup>
      <tr class="fx-tm"><td class="fx-tm"><span class="fx-l">Aspetto esteriore dei beni</span><span class="fx-v left">${esc(it.aspetto || '')}</span></td><td class="fx-tm"><span class="fx-l">N. colli</span><span class="fx-v">${esc(it.colli ?? '')}</span></td><td class="fx-tm"><span class="fx-l">Peso kg</span><span class="fx-v">${esc(it.peso ?? '')}</span></td><td class="fx-tm"><span class="fx-l">Data e ora inizio trasporto</span><span class="fx-v">${fdate(it.data)}</span></td><td class="fx-tm"><span class="fx-l">Porto</span><span class="fx-v">${esc(it.porto || 'Franco')}</span></td></tr>
      <tr><td colspan="2" style="height:16mm"><span class="fx-l">Vettore</span><span class="fx-v left">${esc(it.vettore || '')}</span></td><td colspan="2"><span class="fx-l">Firma conducente</span></td><td><span class="fx-l">Firma destinatario</span></td></tr>
    </table></div>`;
    const footA = [az.nome ? esc(az.nome) : '', az.piva ? 'P.IVA IT' + esc(az.piva) : '', az.cf ? 'C.F. ' + esc(az.cf) : '', set.rea ? 'REA ' + esc(set.rea) : '', [ind.via, ind.citta].filter(Boolean).map(esc).join(', ')].filter(Boolean).join(' - ');
    const foot = `<div class="fx-foot">${footA}<br><small>Contributo Conai assolto ove dovuto. I vostri dati indicati sono trattati nel rispetto della Legge sulla privacy DLGS n.196/2003</small></div>`;
    const loc = [p.cap, p.citta].filter(Boolean).map(esc).join('&nbsp;&nbsp; ');
    const note = [it.note, split ? 'Scissione dei pagamenti - art. 17-ter DPR 633/72' : ''].filter(Boolean).join(' - ');
    const dst = (it.destId && p.dest) ? (p.dest.find(x => x.id === it.destId) || null) : null;
    const head = pageNo => `<div class="fx-top"><div class="fx-logo">${fxImageHtml(az, ctx)}</div>
        <div class="fx-dest"><span class="fx-l">Spett.le</span><div class="fx-dn">${esc(p.nome)}</div><div class="fx-da">${esc(p.via) || ''}<div class="fx-dc"><span>${loc}</span><span>${esc(p.prov) || ''}</span></div></div></div></div>
      <table class="fx-info"><colgroup><col style="width:28%"><col style="width:12%"><col style="width:12%"><col style="width:14%"><col style="width:27%"><col style="width:7%"></colgroup>
        <tr><td><span class="fx-l">Tipo documento</span><span class="fx-v">${FX_TITLE[coll]}</span></td><td><span class="fx-l">Numero</span><span class="fx-v">${esc(fxNum(it.num))}</span></td><td><span class="fx-l">Data</span><span class="fx-v">${fdate(it.data)}</span></td><td><span class="fx-l">Partita IVA</span><span class="fx-v">${esc(p.piva) || ''}</span></td><td><span class="fx-l">Codice fiscale</span><span class="fx-v">${esc(p.cf || p.piva) || ''}</span></td><td><span class="fx-l">Pag.</span><span class="fx-v" style="text-align:right">${pageNo}</span></td></tr></table>
      ${isDdt ? `<table class="fx-info fx-info2"><colgroup><col style="width:33%"><col style="width:34%"><col style="width:33%"></colgroup>
        <tr><td><span class="fx-l">Causale del trasporto</span><span class="fx-v">${esc(it.causale || 'Vendita')}</span></td><td><span class="fx-l">Trasporto a cura del</span><span class="fx-v">${esc(it.trasporto || 'Mittente')}</span></td><td><span class="fx-l">Agente</span><span class="fx-v"></span></td></tr></table>
      <table class="fx-info fx-info2"><colgroup><col style="width:50%"><col style="width:50%"></colgroup>
        <tr><td><span class="fx-l">Luogo di destinazione</span><span class="fx-v left">${dst ? esc([dst.nome, dst.via, [dst.cap, dst.citta].filter(Boolean).join(' '), dst.prov].filter(Boolean).join(' - ')) : 'Idem'}</span></td><td><span class="fx-l">Annotazioni e variazioni</span><span class="fx-v left">${esc(note)}</span></td></tr>
` : `<table class="fx-info fx-info2"><colgroup><col style="width:33%"><col style="width:34%"><col style="width:33%"></colgroup>
        <tr><td><span class="fx-l">Condizioni di pagamento</span><span class="fx-v">${esc(fxPag(p))}</span></td><td><span class="fx-l">Banca</span><span class="fx-v">${esc(set.banca) || ''}</span></td><td><span class="fx-l">IBAN</span><span class="fx-v">${esc(set.iban) || ''}</span></td></tr></table>
      <table class="fx-info fx-info2"><colgroup><col style="width:67%"><col style="width:33%"></colgroup>
        <tr><td><span class="fx-l">Annotazioni e variazioni</span><span class="fx-v left">${esc(note)}</span></td><td><span class="fx-l">Agente</span><span class="fx-v"></span></td></tr>`}
      </table>`;
    const thead = isDdt ? `<colgroup><col style="width:15%"><col style="width:47%"><col style="width:7%"><col style="width:8%"><col style="width:12%"><col style="width:11%"></colgroup>
      <thead><tr><th>Codice</th><th>Descrizione</th><th>U.M.</th><th>Q.tà</th><th>Lotto</th><th>Scadenza</th></tr></thead>` : `<colgroup><col style="width:14%"><col style="width:40%"><col style="width:6%"><col style="width:7%"><col style="width:11%"><col style="width:7%"><col style="width:10%"><col style="width:5%"></colgroup>
      <thead><tr><th>Codice</th><th>Descrizione</th><th>U.M.</th><th>Q.tà</th><th>Prezzo</th><th>Sco. %</th><th>Importo</th><th>C.Iva</th></tr></thead>`;
    const html = pages.map((pg, i) => {
      const last = i === pages.length - 1;
      return `<div class="fx-page">${head(i + 1)}<table class="fx-lines">${thead}<tbody>${pg.map(rowHtml).join('')}</tbody></table>
        ${last ? (isDdt ? bottomDdt : bottom) : '<div class="fx-segue">segue &#9658;</div>'}${foot}</div>`;
    }).join('');
    return `<div class="fx-sheet">${html}</div>`;
  }

  // Dati in più per la fattura, letti al momento della stampa: numero e
  // data del DDT, unità di misura dal catalogo, immagine d'intestazione
  // (incorporata come data URL: la finestra di stampa è un documento a sé
  // e il PDF è una "fotografia" della pagina — un indirizzo relativo lì
  // non verrebbe trovato).
  const fxImgCache = {};
  async function fxDataUrl(path) {
    if (!path) return null;
    if (fxImgCache[path]) return fxImgCache[path];
    try {
      const res = await fetch(new URL(path, global.location.href).href);
      if (!res.ok) return null;
      const blob = await res.blob();
      fxImgCache[path] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(blob); });
      return fxImgCache[path];
    } catch (e) { return null; }
  }
  async function invoiceContext(it, company, coll) {
    const store = global.SaasStore;
    const companyId = (company && company.id) || (global.localStorage && localStorage.getItem('saas_company_id'));
    const ctx = { um: {} };
    const set = (company && company.settings) || {};
    const jobs = [fxDataUrl(set.intestazione).then(x => { ctx.headerImg = x; }),
      fxDataUrl(set.certificazione && set.certificazione.logo).then(x => { ctx.certImg = x; })];
    if (store && companyId) {
      if (coll === 'ddt' && it.ocId && store.docsByIds) jobs.push(store.docsByIds('ordiniCliente', companyId, [it.ocId]).then(d => { ctx.ordine = d[0] || null; }).catch(() => {}));
      if (coll !== 'ddt' && it.ddtId && store.docsByIds) jobs.push(store.docsByIds('ddt', companyId, [it.ddtId]).then(d => { ctx.ddt = d[0] || null; }).catch(() => {}));
      const cods = (it.righe || []).map(r => r.cod).filter(Boolean);
      if (cods.length && store.prodottiByCods) jobs.push(store.prodottiByCods(companyId, cods).then(ps => {
        // Il catalogo da Maestro ha in "unità" anche numeri di confezione
        // (12, 36…): vale solo una sigla vera (PZ, PAC, SCT…).
        ps.forEach(pr => { if (/^[A-Za-z]{1,4}$/.test(pr.unita || '')) ctx.um[pr.cod] = pr.unita.toUpperCase(); });
      }).catch(() => {}));
    }
    await Promise.all(jobs);
    return ctx;
  }

  // meta viewport: senza, un telefono apre questa finestra alla larghezza
  // "desktop" di default (~980px) e la mostra rimpicciolita per intero,
  // costretti a fare pinch-zoom per leggerla — non incide sulla stampa vera
  // (le regole @media print usano le dimensioni fisiche della pagina, non
  // lo zoom a schermo), conta solo se l'anteprima resta visibile: se
  // l'utente annulla la stampa, o "afterprint" sotto non scatta (non
  // garantito su ogni browser/versione mobile — alcuni gestiscono la
  // stampa tramite il foglio di condivisione del sistema operativo, fuori
  // dal controllo della pagina), la scheda resta aperta e va letta/chiusa
  // a mano.
  function buildStandaloneDoc(coll, it, party, company, ctx) {
    const fx = FX_COLLS.has(coll);
    const body = fx ? buildInvoiceHTML(coll, it, party, company, ctx) : buildPrintHTML(coll, it, party, company);
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(it.num)}</title><style>${fx ? FX_CSS : PRINT_CSS}</style></head><body style="margin:0" onload="window.print()" onafterprint="window.close()">${body}</body></html>`;
  }

  // Nell'app nativa Android (saas/mobile, MainActivity.java) la pagina
  // vive dentro una WebView incorporata, non un vero browser: window.open()
  // lì non crea nessuna finestra (Capacitor non abilita le finestre
  // multiple), quindi il pulsante mostrerebbe sempre "popup bloccato" —
  // fuorviante, non esiste un'impostazione "consenti popup" da attivare in
  // un'app nativa. window.AndroidPrint (iniettato SOLO da quella WebView,
  // via addJavascriptInterface — mai presente in un browser vero) prende
  // lo stesso HTML e lo stampa con l'API nativa di Android (PrintManager),
  // che apre il vero selettore di stampa/"Salva come PDF" del sistema.
  // Fattura/nota di credito: prima di scrivere la pagina servono i dati in
  // più (DDT, unità di misura, intestazione — invoiceContext). La finestra
  // si apre SUBITO, dentro il clic, altrimenti il browser la bloccherebbe
  // come popup; il contenuto arriva un istante dopo.
  async function openPrintWindow(coll, it, party, company) {
    const fx = FX_COLLS.has(coll);
    if (global.AndroidPrint) {
      const ctx = fx ? await invoiceContext(it, company, coll) : null;
      global.AndroidPrint.printHtml(buildStandaloneDoc(coll, it, party, company, ctx), String(it.num || 'Documento'));
      return;
    }
    const w = window.open('', '_blank');
    if (!w) { alert('Il browser ha bloccato la finestra di stampa. Consenti i popup per questo sito e riprova.'); return; }
    if (fx) w.document.write('<p style="font-family:sans-serif;padding:20px">Preparo la fattura…</p>');
    const ctx = fx ? await invoiceContext(it, company, coll) : null;
    w.document.open();
    w.document.write(buildStandaloneDoc(coll, it, party, company, ctx));
    w.document.close();
  }

  // label: cosa dire se il caricamento fallisce (rete assente/instabile —
  // più probabile su mobile che su desktop) — senza, ogni chiamante
  // ereditava lo stesso messaggio hardcoded "generatore PDF", sbagliato per
  // Excel (vedi loadXLSX più sotto: prima di questo parametro, un errore
  // di rete scaricando Excel diceva all'utente che era il PDF a non
  // caricarsi).
  function loadScript(src, label) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Impossibile caricare ${label} (serve una connessione internet)`));
      document.head.appendChild(s);
    });
  }
  async function loadJsPDF() {
    if (global.jspdf && global.jspdf.jsPDF) return global.jspdf.jsPDF;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'il generatore PDF');
    return global.jspdf.jsPDF;
  }
  async function loadHtml2Canvas() {
    if (global.html2canvas) return;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'il generatore PDF');
  }

  // Genera il documento jsPDF (usato sia per il download sia per l'allegato
  // email) — fattorizzato fuori da downloadPDF perché entrambi i casi devono
  // produrre esattamente lo stesso file, solo con destinazione diversa
  // (salvataggio locale vs allegato a un'email).
  // Fattura/nota di credito: ogni pagina A4 (.fx-page) è già impaginata,
  // quindi si fotografa una pagina alla volta e diventa una pagina del PDF
  // — niente impaginazione automatica di jsPDF, che taglierebbe righe e
  // riquadri a metà.
  async function renderInvoicePDF(coll, it, party, company) {
    const JsPDF = await loadJsPDF();
    await loadHtml2Canvas();
    const ctx = await invoiceContext(it, company, coll);
    if (!document.getElementById('saas-fx-css')) {
      const st = document.createElement('style'); st.id = 'saas-fx-css'; st.textContent = FX_CSS; document.head.appendChild(st);
    }
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;top:0;left:0;z-index:-1;background:#fff;width:210mm';
    wrap.innerHTML = buildInvoiceHTML(coll, it, party, company, ctx);
    // Senza lo sfondo grigio e i margini dell'anteprima a schermo.
    const sheet = wrap.querySelector('.fx-sheet'); if (sheet) sheet.className = '';
    document.body.appendChild(wrap);
    try {
      await Promise.all([...wrap.querySelectorAll('img')].map(im => im.complete ? null : new Promise(r => { im.onload = im.onerror = r; })));
      const doc = new JsPDF({ unit: 'mm', format: 'a4' });
      const pages = [...wrap.querySelectorAll('.fx-page')];
      for (let i = 0; i < pages.length; i++) {
        const canvas = await global.html2canvas(pages[i], { backgroundColor: '#ffffff', scale: 2, useCORS: true });
        if (i > 0) doc.addPage('a4');
        doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
      }
      return doc;
    } finally {
      wrap.remove();
    }
  }

  async function renderToJsPDF(coll, it, party, company) {
    if (FX_COLLS.has(coll)) return renderInvoicePDF(coll, it, party, company);
    const JsPDF = await loadJsPDF();
    await loadHtml2Canvas();
    const wrap = document.createElement('div');
    // Contenitore fuori dal flusso visibile ma a coordinate positive vicine
    // all'origine: coordinate negative o molto lontane mandano in tilt la
    // paginazione automatica di jsPDF (centinaia di pagine vuote prima del
    // contenuto vero) — z-index negativo lo tiene comunque invisibile.
    wrap.style.cssText = 'position:fixed;top:0;left:0;z-index:-1;background:#fff;width:780px';
    wrap.innerHTML = buildPrintHTML(coll, it, party, company);
    document.body.appendChild(wrap);
    try {
      const doc = new JsPDF({ unit: 'mm', format: 'a4' });
      await new Promise((resolve, reject) => {
        doc.html(wrap, {
          x: 0, y: 0, width: 210, windowWidth: 780,
          html2canvas: { backgroundColor: '#ffffff' },
          autoPaging: 'text',
          callback: () => resolve(),
        }).catch(reject);
      });
      return doc;
    } finally {
      wrap.remove();
    }
  }

  // Genera e scarica il PDF, con lo stesso template HTML della stampa —
  // così il file scaricato è sempre identico a quanto si vede stampando,
  // senza mantenere due layout paralleli.
  //
  // doc.save() usa lo stesso meccanismo <a download> di un Blob — nell'app
  // nativa Android (vedi la nota su window.AndroidPrint più sopra) un clic
  // così non ha ALCUN effetto: nessun gestore dei download in una WebView
  // incorporata, a differenza di un vero browser. window.AndroidDownload
  // (stesso discorso di AndroidPrint: iniettato solo da quella WebView)
  // riceve il PDF come base64 e lo salva/apre lui con l'API Android.
  async function downloadPDF(coll, it, party, company) {
    const doc = await renderToJsPDF(coll, it, party, company);
    const filename = String(it.num).replace(/\//g, '-') + '.pdf';
    if (global.AndroidDownload) {
      global.AndroidDownload.saveFile(doc.output('datauristring').split(',')[1], filename, 'application/pdf');
      return;
    }
    doc.save(filename);
  }

  // Stesso PDF di downloadPDF, ma come stringa base64 pronta per un allegato
  // email (send-email/index.ts, via store.sendEmail) invece che salvata sul
  // disco dell'utente.
  async function pdfBase64(coll, it, party, company) {
    const doc = await renderToJsPDF(coll, it, party, company);
    return doc.output('datauristring').split(',')[1];
  }

  // ---------------------------------------------------------------------------
  // Excel: stesso SheetJS già usato in report.html/prodotti.html (import
  // listino) per l'export, caricato da CDN al primo utilizzo — non nel
  // bundle. A differenza di quei due (righe di un elenco, tutte con le
  // stesse colonne), qui il "foglio" è UN documento: poche righe di
  // intestazione (numero/data/controparte), poi la stessa tabella righe di
  // buildPrintHTML — colonne Lotto/Scadenza/Sconto solo se il documento le
  // usa davvero, come in stampa.
  async function loadXLSX() {
    if (global.XLSX) return global.XLSX;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'il modulo Excel');
    return global.XLSX;
  }

  async function downloadExcel(coll, it, party, company) {
    const XLSX = await loadXLSX();
    const p = party || {};
    // ddtFornitore incluso: un DDT (cliente o fornitore) non riporta mai
    // prezzi — richiesta reale dopo il primo collaudo con documenti veri
    // ("togli prezzi e sconti e iva perché non ci sono"), estesa qui alla
    // stampa/export perché il dato non esiste più nemmeno nel documento
    // (vedi ddt-fornitore.html).
    const isDDT = coll === 'ddt' || coll === 'ddtFornitore';
    const isForn = FORN_COLLS.has(coll);
    const righe = it.righe || [];
    const hasSc = !isDDT && righe.some(r => scEff(r.sconto) > 0);
    const hasLot = ['ddt', 'ddtFornitore', 'fattureCliente', 'fattureFornitore', 'noteCredito'].includes(coll) && righe.some(r => r.lotto || r.scad);

    const aoa = [
      [TITLES[coll] || '', it.num],
      ['Data', fdate(it.data)],
      [isForn ? 'Fornitore' : 'Cliente', p.nome || ''],
      [],
    ];
    const head = ['Codice', 'Descrizione'];
    if (hasLot) head.push('Lotto', 'Scadenza');
    head.push('Q.tà');
    if (!isDDT) { head.push('Prezzo', 'Imponibile'); if (hasSc) head.push('Sconto %'); head.push('IVA %', 'Totale riga'); }
    aoa.push(head);
    righe.forEach(r => {
      const row = [r.cod || '', r.descr || ''];
      if (hasLot) row.push(r.lotto || '', r.scad ? fdate(r.scad) : '');
      row.push(r.qty || 0);
      if (!isDDT) {
        row.push(+(r.prezzo || 0).toFixed(4), +lineNet(r).toFixed(2));
        if (hasSc) row.push(scEff(r.sconto));
        row.push(r.iva || 0, +(lineNet(r) * (1 + (r.iva ?? 22) / 100)).toFixed(2));
      }
      aoa.push(row);
    });
    if (!isDDT) {
      aoa.push([]);
      aoa.push(['Imponibile', +imp(righe).toFixed(2)]);
      aoa.push(['IVA', +ivaT(righe).toFixed(2)]);
      aoa.push(['Totale documento', +tot(righe).toFixed(2)]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = head.map((h, i) => ({ wch: Math.max(h.length, ...aoa.map(r => String(r[i] == null ? '' : r[i]).length)) + 2 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Documento');
    const filename = String(it.num || 'documento').replace(/\//g, '-') + '.xlsx';
    // Stesso discorso di downloadPDF: XLSX.writeFile() non ha alcun
    // effetto nell'app nativa Android (nessun gestore dei download in
    // quella WebView) — window.AndroidDownload riceve il file come base64
    // e lo salva/apre lui.
    if (global.AndroidDownload) {
      global.AndroidDownload.saveFile(
        XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }),
        filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      return;
    }
    XLSX.writeFile(wb, filename);
  }

  // ---------------------------------------------------------------------------
  // Menu a comparsa del pulsante "⬇ Scarica" nel documento aperto: un solo
  // pulsante al posto di uno per formato ("prima avevo Stampa/Scarica PDF/
  // XML tutti separati, ne voglio uno solo con la scelta dentro"). btn è il
  // pulsante che apre/chiude, list è il contenitore (già nell'HTML, con i
  // suoi <button data-dl="pdf|excel|xml"> — il click su una voce lo gestisce
  // chi chiama, qui solo apertura/chiusura del menu). Chiuso da: un secondo
  // clic sul pulsante, un clic fuori dal menu, Esc, o il clic su una
  // qualunque voce della lista (bubbling — non serve saperne l'esito).
  function bindDownloadMenu(btn, list) {
    function close() {
      list.hidden = true;
      document.removeEventListener('click', onOutside);
      document.removeEventListener('keydown', onEsc);
    }
    function onOutside(e) { if (!list.contains(e.target) && e.target !== btn) close(); }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!list.hidden) { close(); return; }
      list.hidden = false;
      document.addEventListener('click', onOutside);
      document.addEventListener('keydown', onEsc);
    });
    list.addEventListener('click', e => { if (e.target.closest('button')) close(); });
  }

  // Totali di un documento (stessa aritmetica della stampa): usati
  // dall'esportazione multipla in Excel (app/bulk-export.js).
  function totals(righe) { return { imp: imp(righe), iva: ivaT(righe), tot: tot(righe) }; }

  global.SaasPrint = { buildPrintHTML, buildInvoiceHTML, openPrintWindow, downloadPDF, pdfBase64, downloadExcel, bindDownloadMenu,
    loadXLSX, totals, FORN_COLLS };
})(window);

