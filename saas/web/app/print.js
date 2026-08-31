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
    ddt: 'DOCUMENTO DI TRASPORTO', fattureCliente: 'FATTURA', fattureFornitore: 'FATTURA FORNITORE',
    preventivi: 'PREVENTIVO', noteCredito: 'NOTA DI CREDITO', noteCreditoFornitore: 'NOTA DI CREDITO FORNITORE',
  };
  const FORN_COLLS = new Set(['ordiniFornitore', 'fattureFornitore', 'noteCreditoFornitore']);

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
.pa-footer{margin-top:26px;padding-top:10px;border-top:1px solid #e5e9ee;font-size:9.5px;color:#aaa;text-align:center}`;

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

  function buildPrintHTML(coll, it, party, company) {
    ensureCssInjected();
    const az = company || {};
    const ind = az.indirizzo || {};
    const set = az.settings || {};
    const p = party || {};
    const isForn = FORN_COLLS.has(coll);
    const azLine = [ind.via, `${ind.cap || ''} ${ind.citta || ''}${ind.prov ? ' (' + ind.prov + ')' : ''}`.trim()].filter(Boolean).join('<br>');
    const azMeta = [az.piva ? 'P.IVA ' + az.piva : '', az.cf && az.cf !== az.piva ? 'C.F. ' + az.cf : '', set.tel ? 'Tel ' + set.tel : '', set.email || '', az.pec ? 'PEC ' + az.pec : '', set.web || ''].filter(Boolean).join(' · ');
    const pAddr = [p.via, `${p.cap || ''} ${p.citta || ''}${p.prov ? ' (' + p.prov + ')' : ''}`.trim()].filter(Boolean).join('<br>');
    // Destinazione di consegna diversa dalla sede legale, se il documento
    // ne indica una (destId) e il cliente ne ha di registrate — stessa
    // idea di docDest() nell'originale.
    const dst = (!isForn && it.destId && p.dest) ? p.dest.find(x => x.id === it.destId) || null : null;
    const dstAddr = dst ? [dst.via, `${dst.cap || ''} ${dst.citta || ''}${dst.prov ? ' (' + dst.prov + ')' : ''}`.trim()].filter(Boolean).join('<br>') : '';
    const shipBlock = dst ? `<div class="pa-party pa-ship"><div class="pa-pl">Luogo di consegna</div><div class="pa-pn">${esc(dst.nome) || esc(p.nome)}</div><div class="pa-pa">${dstAddr}</div></div>` : '';
    // Col riquadro di consegna separato, quello del cliente indica solo il
    // destinatario (altrimenti i due riquadri si contraddicono, entrambi
    // etichettati "luogo di consegna" ma con indirizzi diversi).
    const partyLabel = isForn ? 'Spettabile fornitore' : (coll === 'ddt' ? (dst ? 'Destinatario' : 'Destinatario / luogo di consegna') : 'Spettabile cliente');
    const pMeta = [p.piva ? 'P.IVA ' + p.piva : '', p.cf && p.cf !== p.piva ? 'C.F. ' + p.cf : '', p.sdi ? 'Cod. SDI ' + p.sdi : '', p.pec ? 'PEC ' + p.pec : ''].filter(Boolean).join('<br>');
    const isDDT = coll === 'ddt';
    const righe = it.righe || [];
    const hasSc = !isDDT && righe.some(r => scEff(r.sconto) > 0);
    const hasLot = ['ddt', 'fattureCliente', 'fattureFornitore', 'noteCredito'].includes(coll) && righe.some(r => r.lotto || r.scad);
    const rows = righe.map(r => `<tr><td>${esc(r.cod)}</td><td>${esc(r.descr)}</td>${hasLot ? `<td>${esc(r.lotto) || '—'}</td><td class="r">${r.scad ? fdate(r.scad) : '—'}</td>` : ''}<td class="r">${r.qty}</td>${isDDT ? '' : `<td class="r">${eur(r.prezzo)}</td><td class="r">${eur(lineNet(r))}</td>${hasSc ? `<td class="r">${scLabel(r.sconto)}</td>` : ''}<td class="r">${r.iva}%</td><td class="r">${eur(lineNet(r) * (1 + (r.iva || 22) / 100))}</td>`}</tr>`).join('');
    let ddtBlock = '';
    if (isDDT) ddtBlock = `<table class="pa-info"><tr><td><b>Causale del trasporto</b><br>Vendita</td><td><b>Trasporto a cura di</b><br>Mittente</td><td><b>Porto</b><br>Franco</td><td><b>Aspetto dei beni</b><br>Colli n. ${it.colli || '____'}</td></tr></table>`;
    const userNote = it.note ? `<div class="pa-note pa-usernote"><b>Note:</b> ${esc(it.note)}</div>` : '';
    let note = '';
    if (coll === 'fattureCliente' || coll === 'noteCredito') {
      if (p.split === 'si') note += '<div class="pa-note">Operazione soggetta a scissione dei pagamenti — art. 17‑ter DPR 633/72. IVA versata dall\'ente acquirente.</div>';
      if (coll === 'noteCredito' && it.fatturaId) note += `<div class="pa-note">A storno (parziale) della fattura collegata.</div>`;
      if (coll === 'fattureCliente') {
        const term = p.term ? `Pagamento: ${p.pag || 'Bonifico'} a ${p.term} gg` : '';
        const iban = set.iban ? ` · IBAN ${set.iban}` : '';
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
      <table class="pa-lines"><thead><tr><th>Codice</th><th>Descrizione</th>${hasLot ? '<th>Lotto</th><th class="r">Scadenza</th>' : ''}<th class="r">Q.tà</th>${isDDT ? '' : `<th class="r">Prezzo</th><th class="r">Imponibile</th>${hasSc ? '<th class="r">Sconto</th>' : ''}<th class="r">IVA</th><th class="r">Totale</th>`}</tr></thead><tbody>${rows}</tbody></table>
      ${isDDT ? '' : `<div class="pa-tot"><table>
        <tr><td>Imponibile</td><td class="r">${eur(imp(righe))}</td></tr>
        <tr><td>IVA</td><td class="r">${eur(ivaT(righe))}</td></tr>
        <tr class="g"><td>Totale documento</td><td class="r">${eur(tot(righe))}</td></tr>
      </table></div>`}
      ${userNote}
      ${note}
      <div class="pa-footer">Documento generato con il gestionale</div>
    </div>`;
  }

  function buildStandaloneDoc(coll, it, party, company) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(it.num)}</title><style>${PRINT_CSS}</style></head><body onload="window.print()" onafterprint="window.close()">${buildPrintHTML(coll, it, party, company)}</body></html>`;
  }

  function openPrintWindow(coll, it, party, company) {
    const w = window.open('', '_blank');
    if (!w) { alert('Il browser ha bloccato la finestra di stampa. Consenti i popup per questo sito e riprova.'); return; }
    w.document.write(buildStandaloneDoc(coll, it, party, company));
    w.document.close();
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Impossibile caricare il generatore PDF (serve una connessione internet)'));
      document.head.appendChild(s);
    });
  }
  async function loadJsPDF() {
    if (global.jspdf && global.jspdf.jsPDF) return global.jspdf.jsPDF;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    return global.jspdf.jsPDF;
  }
  async function loadHtml2Canvas() {
    if (global.html2canvas) return;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  }

  // Genera e scarica il PDF, con lo stesso template HTML della stampa —
  // così il file scaricato è sempre identico a quanto si vede stampando,
  // senza mantenere due layout paralleli.
  async function downloadPDF(coll, it, party, company) {
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
      doc.save(String(it.num).replace(/\//g, '-') + '.pdf');
    } finally {
      wrap.remove();
    }
  }

  global.SaasPrint = { buildPrintHTML, openPrintWindow, downloadPDF };
})(window);
