/* ============================================================================
 * bulk-export.js — "⬇ Esporta" per i documenti spuntati in un elenco.
 *
 * Compare nella barra delle azioni collettive (.bulkbar) di ogni elenco
 * documenti appena c'è almeno una riga spuntata (la spunta in testata
 * seleziona tutti i documenti filtrati, anche quelli non ancora disegnati).
 * Tre formati:
 *  - PDF: un file ZIP con un PDF per documento, identico a "Scarica PDF"
 *    del documento aperto (stesso template di stampa, app/print.js);
 *  - Excel riepilogativo: un foglio, una riga per documento con numero,
 *    data, controparte, imponibile, IVA, totale ed eventuale incasso o
 *    pagamento (per i DDT, che non hanno prezzi: righe e quantità);
 *  - XML FatturaPA (solo dove la pagina lo sa generare, cioè le fatture
 *    clienti): un file ZIP con un XML per fattura; quelle a cui mancano dati
 *    obbligatori vengono saltate ed elencate alla fine.
 *
 * Collegata da SaasDocPage.bindElenco() quando la pagina passa `export`:
 * { coll, partyOf(doc), getCompany(), xmlFile?(doc) -> {filename, xml} |
 * {error} }. Nell'app Android i file passano da window.AndroidDownload,
 * come i download del singolo documento.
 * ============================================================================ */

(function (global) {
  'use strict';

  const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const NO_PRICES = new Set(['ddt', 'ddtFornitore']);
  const PAID_LABEL = { fattureCliente: ['Incassata', 'Da incassare'], fattureFornitore: ['Pagata', 'Da pagare'] };
  const FILE_PREFIX = {
    fattureCliente: 'fatture', fattureFornitore: 'fatture-fornitori', ddt: 'ddt', ddtFornitore: 'ddt-fornitori',
    ordiniCliente: 'ordini-clienti', ordiniFornitore: 'ordini-fornitori', preventivi: 'preventivi',
    noteCredito: 'note-di-credito', noteCreditoFornitore: 'note-di-credito-fornitori',
  };

  function fdate(s) { return s ? new Date(s + 'T00:00:00').toLocaleDateString('it-IT') : ''; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function safeName(s) { return String(s || 'documento').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim(); }

  function loadJSZip() {
    if (global.JSZip) return Promise.resolve(global.JSZip);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSZIP_URL;
      s.onload = () => resolve(global.JSZip);
      s.onerror = () => reject(new Error('Impossibile caricare il modulo ZIP (serve una connessione internet)'));
      document.head.appendChild(s);
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function saveBlob(blob, filename, mime) {
    if (global.AndroidDownload) {
      global.AndroidDownload.saveFile(await blobToBase64(blob), filename, mime);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // Nomi dei file nello ZIP: il numero del documento; se due documenti hanno
  // lo stesso numero (fatture di fornitori diversi) si aggiunge la controparte.
  function uniqueNames(docs, o, ext) {
    const count = {};
    docs.forEach(d => { const k = safeName(d.num); count[k] = (count[k] || 0) + 1; });
    const used = new Set();
    return docs.map(d => {
      let base = safeName(d.num);
      if (count[base] > 1) base += ' - ' + safeName((o.partyOf(d) || {}).nome);
      let name = base + ext, i = 2;
      while (used.has(name)) name = `${base} (${i++})${ext}`;
      used.add(name);
      return name;
    });
  }

  function sorted(docs) {
    return docs.slice().sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || String(a.num || '').localeCompare(String(b.num || ''), 'it', { numeric: true }));
  }

  async function exportPdf(o, docs, progress) {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    const names = uniqueNames(docs, o, '.pdf');
    const company = o.getCompany();
    for (let i = 0; i < docs.length; i++) {
      progress(`PDF ${i + 1} di ${docs.length}…`);
      zip.file(names[i], await global.SaasPrint.pdfBase64(o.coll, docs[i], o.partyOf(docs[i]), company), { base64: true });
    }
    progress('Preparo lo ZIP…');
    const blob = await zip.generateAsync({ type: 'blob' });
    await saveBlob(blob, `${FILE_PREFIX[o.coll] || 'documenti'}-pdf-${today()}.zip`, 'application/zip');
  }

  async function exportXml(o, docs, progress) {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    const skipped = [];
    let n = 0;
    docs.forEach((d, i) => {
      progress(`XML ${i + 1} di ${docs.length}…`);
      const r = o.xmlFile(d);
      if (!r || r.error) { skipped.push(`${d.num}: ${r ? r.error : 'non generabile'}`); return; }
      zip.file(r.filename, r.xml);
      n++;
    });
    if (n) {
      progress('Preparo lo ZIP…');
      await saveBlob(await zip.generateAsync({ type: 'blob' }), `${FILE_PREFIX[o.coll] || 'fatture'}-xml-${today()}.zip`, 'application/zip');
    }
    if (skipped.length) {
      alert(`${n} fatture esportate.\n${skipped.length} saltate perché mancano dati obbligatori:\n\n` + skipped.slice(0, 25).join('\n') +
        (skipped.length > 25 ? `\n… e altre ${skipped.length - 25}` : ''));
    }
  }

  async function exportExcel(o, docs) {
    const P = global.SaasPrint;
    const XLSX = await P.loadXLSX();
    const isForn = P.FORN_COLLS.has(o.coll);
    const noPrices = NO_PRICES.has(o.coll);
    const paid = PAID_LABEL[o.coll];
    const head = ['Numero', 'Data', isForn ? 'Fornitore' : 'Cliente'];
    if (noPrices) head.push('Righe', 'Q.tà totale');
    else head.push('Imponibile', 'IVA', 'Totale');
    if (paid) head.push('Stato', paid[0] === 'Incassata' ? 'Data incasso' : 'Data pagamento');
    const aoa = [head];
    let sImp = 0, sIva = 0, sTot = 0, sQty = 0;
    docs.forEach(d => {
      const row = [d.num || '', fdate(d.data), ((o.partyOf(d) || {}).nome) || ''];
      const righe = d.righe || [];
      if (noPrices) {
        const q = righe.reduce((s, r) => s + (Number(r.qty) || 0), 0);
        sQty += q;
        row.push(righe.length, q);
      } else {
        const t = P.totals(righe);
        sImp += t.imp; sIva += t.iva; sTot += t.tot;
        row.push(+t.imp.toFixed(2), +t.iva.toFixed(2), +t.tot.toFixed(2));
      }
      if (paid) row.push(d.paid ? paid[0] : paid[1], d.paid ? fdate(d.paidDate) : '');
      aoa.push(row);
    });
    aoa.push([]);
    aoa.push(noPrices ? [`Totale (${docs.length} documenti)`, '', '', '', sQty]
                      : [`Totale (${docs.length} documenti)`, '', '', +sImp.toFixed(2), +sIva.toFixed(2), +sTot.toFixed(2)]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = head.map((h, i) => ({ wch: Math.min(60, Math.max(h.length, ...aoa.map(r => String(r[i] == null ? '' : r[i]).length)) + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Documenti');
    const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const filename = `${FILE_PREFIX[o.coll] || 'documenti'}-riepilogo-${today()}.xlsx`;
    if (global.AndroidDownload) { global.AndroidDownload.saveFile(b64, filename, mime); return; }
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    await saveBlob(new Blob([bytes], { type: mime }), filename, mime);
  }

  // area: il contenitore dell'elenco appena disegnato. o: { coll, partyOf,
  // getCompany, xmlFile?, docs (spuntati), deselect }.
  function attach(area, o) {
    const docs = sorted(o.docs || []);
    if (!docs.length) return;
    let bar = area.querySelector('.bulkbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'bulkbar';
      bar.innerHTML = `<span>${docs.length} selezionat${docs.length === 1 ? 'o' : 'i'}</span><div class="sp"></div>` +
        `<button type="button" data-bx-deselect>✕ Deseleziona</button>`;
      area.insertBefore(bar, area.firstChild);
      bar.querySelector('[data-bx-deselect]').addEventListener('click', o.deselect);
    }
    const menu = document.createElement('div');
    menu.className = 'dl-menu';
    menu.innerHTML = `<button type="button" data-bx-open>⬇ Esporta (${docs.length})</button>
      <div class="dl-list" hidden data-bx-list>
        <button type="button" data-bx="pdf">📄 PDF (un file ZIP)</button>
        <button type="button" data-bx="excel">📊 Excel riepilogativo</button>
        ${o.xmlFile ? '<button type="button" data-bx="xml">🧾 XML FatturaPA (un file ZIP)</button>' : ''}
      </div>`;
    const status = document.createElement('span');
    status.className = 'bulk-export-status';
    status.setAttribute('role', 'status');
    const before = bar.querySelector('#bulk-deselect, [data-bx-deselect]');
    bar.insertBefore(menu, before);
    bar.insertBefore(status, menu);
    const openBtn = menu.querySelector('[data-bx-open]');
    global.SaasPrint.bindDownloadMenu(openBtn, menu.querySelector('[data-bx-list]'));
    menu.querySelectorAll('[data-bx]').forEach(btn => btn.addEventListener('click', async () => {
      const kind = btn.dataset.bx;
      if (kind === 'pdf' && docs.length > 50 &&
          !confirm(`Creare ${docs.length} PDF richiede circa ${Math.ceil(docs.length / 60)} minut${docs.length > 60 ? 'i' : 'o'}: la pagina deve restare aperta. Procedo?`)) return;
      openBtn.disabled = true;
      const progress = t => { status.textContent = t; };
      try {
        if (kind === 'pdf') await exportPdf(o, docs, progress);
        else if (kind === 'xml') await exportXml(o, docs, progress);
        else await exportExcel(o, docs);
        status.textContent = '';
      } catch (err) {
        status.textContent = '';
        alert('Errore durante l\'esportazione: ' + (err.message || err));
      } finally {
        openBtn.disabled = false;
      }
    }));
  }

  global.SaasBulkExport = { attach };
})(window);
