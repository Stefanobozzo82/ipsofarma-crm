const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// app/doc-page.js: le funzioni condivise dalle nove pagine documento. Prima
// del modulo ogni pagina ne aveva una copia propria; questi test fissano il
// comportamento che quelle copie avevano in comune.
// Eseguito nel realm principale (non in un vm.Context separato) così gli
// oggetti che il modulo restituisce hanno gli stessi prototipi degli
// oggetti attesi da assert.deepEqual; i globali del browser che il modulo
// usa arrivano come parametri, sostituibili dal singolo test.
const GLOBALS = ['localStorage', 'location', 'alert', 'setTimeout', 'clearTimeout'];
const factory = new Function('window', ...GLOBALS, fs.readFileSync(path.join(__dirname, '../web/app/doc-page.js'), 'utf8'));
function load(extra = {}) {
  const window = {};
  factory(window, ...GLOBALS.map(n => n in extra ? extra[n] : globalThis[n]));
  return { api: window.SaasDocPage, window };
}
const { api } = load();

test('discount cascade "N+M" and zero VAT lines', () => {
  assert.equal(api.scFactor('50+10'), 0.45);
  assert.equal(api.scFactor(''), 1);
  assert.equal(api.scEff('50+10'), 55);
  const righe = [{ qty: 2, prezzo: 10, sconto: '50+10', iva: 22 }, { qty: 1, prezzo: 100, sconto: '', iva: 0 }];
  assert.equal(api.impTot(righe), 109);
  assert.equal(api.ivaTot(righe).toFixed(2), '1.98');
  assert.equal(api.docTotale(righe).toFixed(2), '110.98');
  assert.equal(api.docTotale(undefined), 0);
  assert.equal(api.rigaTotale({ qty: 1, prezzo: 10 }), 10, 'IVA assente conta come 0, non NaN');
});

test('esc, eur and dates', () => {
  assert.equal(api.esc('<b>&"x"</b>'), '&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
  assert.equal(api.esc(null), '');
  assert.match(api.eur(12345.5), /12\.345,50/); // it-IT raggruppa le migliaia solo da 5 cifre in su
  assert.equal(api.eur('x'), api.eur(0));
  assert.equal(api.itDate(''), '—');
});

test('column sorting: header html, toggling and comparison', () => {
  const sort = { key: 'num', dir: 'desc' };
  assert.match(api.thHtml(sort, 'num', 'Numero'), /class="thsort on".*Numero ↓/);
  assert.doesNotMatch(api.thHtml(sort, 'data', 'Data'), /on"|↓|↑/);
  api.toggleSort(sort, 'num'); assert.deepEqual(sort, { key: 'num', dir: 'asc' });
  api.toggleSort(sort, 'cliente'); assert.deepEqual(sort, { key: 'cliente', dir: 'asc' });
  api.toggleSort(sort, 'data'); assert.deepEqual(sort, { key: 'data', dir: 'desc' });
  assert.ok(api.sortCmp('OC/2026/0010', 'OC/2026/0009', 'asc') > 0, 'confronto numerico dentro le stringhe');
  assert.ok(api.sortCmp(5, 10, 'desc') > 0);
  assert.deepEqual(api.sortByNome([{ nome: 'zeta' }, { nome: 'Alfa' }, {}]).map(x => x.nome), [undefined, 'Alfa', 'zeta']);
  assert.equal(api.partyOptionsHtml([{ id: '1', nome: 'B <x>' }, { id: '2', nome: 'A' }]), '<option value="2">A</option><option value="1">B &lt;x&gt;</option>');
});

test('text search and date range', () => {
  assert.equal(api.matchesText('', {}, undefined), true);
  assert.equal(api.matchesText('ross', { num: 'FT/1' }, 'Mario Rossi'), true);
  assert.equal(api.matchesText('ft/1', { num: 'FT/1' }, ''), true);
  assert.equal(api.matchesText('x', { num: 'FT/1' }, 'Rossi'), false);
  assert.equal(api.inDateRange({ data: '2026-05-01' }, '2026-01-01', '2026-12-31'), true);
  assert.equal(api.inDateRange({ data: '2025-05-01' }, '2026-01-01', ''), false);
  assert.equal(api.ordineCompleto({ righe: [{ qty: 2, qtyEv: 2 }, { qty: 1, qtyEv: 0 }] }), false);
  assert.equal(api.ordineCompleto({ righe: [{ qty: 2, qtyEv: 3 }] }), true);
  assert.equal(api.ordineCompleto({ righe: [] }), false);
});

test('search input is debounced and lower-cased', async () => {
  let handler; const seen = [];
  api.bindSearch({ value: '  Rossi ', addEventListener: (e, fn) => { assert.equal(e, 'input'); handler = fn; } }, q => seen.push(q));
  const timers = [];
  const { api: api2 } = load({ setTimeout: (fn, ms) => { timers.push([fn, ms]); return 1; }, clearTimeout: () => {} });
  api2.bindSearch({ value: '  Rossi ', addEventListener: (e, fn) => { handler = fn; } }, q => seen.push(q));
  handler(); handler();
  assert.equal(timers.length, 2); assert.equal(timers[0][1], 200);
  timers[1][0]();
  assert.deepEqual(seen, ['rossi']);
});

test('last price and price history follow document date, filtered by party', () => {
  const storico = {
    fattureCliente: [{ clienteId: 'A', data: '2026-01-10', num: 'FT1', righe: [{ cod: 'X', prezzo: 9, sconto: '10' }] }],
    ddt: [{ clienteId: 'B', data: '2026-03-01', num: 'D1', righe: [{ cod: 'X', prezzo: 1 }] }],
    ordiniCliente: [{ clienteId: 'A', data: '2026-02-01', num: 'OC1', righe: [{ cod: 'X', prezzo: 8 }] }, { clienteId: 'A', data: '2026-02-15', num: 'OC2', righe: [{ cod: 'X', prezzo: null }] }],
  };
  const colls = ['fattureCliente', 'ddt', 'ordiniCliente'];
  assert.deepEqual(api.lastLinePrice(storico, colls, 'X', d => d.clienteId === 'A'), { data: '2026-02-01', prezzo: 8, sconto: '' });
  assert.equal(api.lastLinePrice(storico, colls, 'X').prezzo, 1, 'senza filtro vince il documento più recente di chiunque');
  assert.equal(api.lastLinePrice(storico, colls, '', () => true), null);
  assert.deepEqual(api.linePriceHistory(storico, colls, 'X', d => d.clienteId === 'A').map(h => h.num), ['OC1', 'FT1']);
  assert.deepEqual(api.linePriceHistory(storico, colls, 'X', null, 1).map(h => h.num), ['D1']);
});

test('repricing keeps manual rows, uses last price, else catalogue price, else zero', async () => {
  const mkRow = (last, cod) => { const cells = { '.r-cod': { value: cod }, '.r-prezzo': { value: '99' }, '.r-sconto': { value: '5' } }; return { dataset: last ? { last: '1' } : {}, querySelector: s => cells[s], cells }; };
  const rows = [mkRow(true, 'A'), mkRow(true, 'B'), mkRow(true, 'C'), mkRow(false, 'A')];
  const tbody = { querySelectorAll: () => rows };
  const store = { async searchProdotti(company, cod) { assert.equal(company, 'c1'); return cod === 'B' ? [{ cod: 'B', listinoVen: 3 }] : []; } };
  await api.repriceRows(tbody, cod => cod === 'A' ? { prezzo: 7, sconto: '20' } : null, store, 'c1', 'listinoVen');
  assert.deepEqual(rows.map(r => [r.cells['.r-prezzo'].value, r.cells['.r-sconto'].value]), [[7, '20'], [3, ''], [0, ''], ['99', '5']]);
  assert.equal(rows[1].dataset.last, undefined, 'senza storico il badge sparisce');
  assert.equal(rows[0].dataset.last, '1');
});

test('delivery destinations: hidden without extra addresses, sorted by label, sede legale first', () => {
  const select = {}, wrap = {};
  api.fillDestOptions(select, wrap, { dest: [{ id: '2', citta: 'Torino' }, { id: '1', nome: 'Magazzino' }] });
  assert.equal(wrap.hidden, false);
  assert.equal(select.innerHTML, '<option value="">Sede legale</option><option value="1">Magazzino</option><option value="2">Torino</option>');
  api.fillDestOptions(select, wrap, { dest: [] });
  assert.equal(wrap.hidden, true);
  assert.equal(api.destSubHtml({ dest: [{ id: '1', nome: 'Magazzino' }] }, { destId: '1' }).includes('📍 Magazzino'), true);
  assert.equal(api.destSubHtml({ dest: [] }, { destId: '1' }), '');
});

test('supplier document references resolve only an unambiguous order', () => {
  const ordini = [{ num: 'OF/2026/0201' }, { num: 'OF/2026/0007' }, { num: 'OF/2025/0007' }];
  assert.equal(api.findOrdineByRiferimento(ordini, 'Vs.ord. 201 del 31.08.2026'), ordini[0]);
  assert.equal(api.findOrdineByRiferimento(ordini, '7'), null, 'due candidati: non collega da solo');
  assert.equal(api.findOrdineByRiferimento(ordini, 'nessun numero'), null);
  assert.equal(api.lastDigits('OF/2026/0201'), 201);
});

test('evasione cells and summary', () => {
  assert.match(api.evasioneCellsHtml({ qty: 3, consegnato: 3, residuo: 0 }, 'ricevuta'), /pill paid">ricevuta/);
  assert.match(api.evasioneCellsHtml({ qty: 3, consegnato: 1 }, 'consegnata'), /num-col">1<\/td><td class="ev-col num-col">2<\/td>.*pill partial/);
  assert.match(api.evasioneCellsHtml({ qty: 3 }, 'consegnata'), /in attesa/);
  const els = { box: {}, pct: {}, fill: { style: {} } };
  const { api: api2, window: w } = load();
  w.SaasCascade = { residuoRighe: o => o.righe.map(r => ({ ...r, consegnato: r.qtyEv || 0, residuo: r.qty - (r.qtyEv || 0) })) };
  api2.renderEvasioneSummary({ righe: [{ qty: 4, qtyEv: 1 }] }, els);
  assert.equal(els.box.hidden, false); assert.equal(els.pct.textContent, '1/4 pz · 25%'); assert.equal(els.fill.style.width, '25%');
  api2.renderEvasioneSummary(null, els); assert.equal(els.box.hidden, true);
});

test('list loading writes the error into the list area and returns null', async () => {
  const area = {};
  const ok = await api.loadList({ async loadCollection(coll, c) { assert.equal(coll, 'ddt'); assert.equal(c, 'c1'); return [1]; } }, 'ddt', 'c1', area);
  assert.deepEqual(ok, [1]);
  const ko = await api.loadList({ async loadCollection() { throw new Error('<rete>'); } }, 'ddt', 'c1', area);
  assert.equal(ko, null); assert.match(area.innerHTML, /Errore nel caricamento: &lt;rete&gt;/);
});

test('list interactions: sort headers, selection, opening rows and special rows', () => {
  const listeners = [];
  const el = (attrs = {}) => ({ ...attrs, addEventListener(ev, fn) { listeners.push([this, ev, fn]); } });
  const th = el({ dataset: { sort: 'data' } }), all = el({}), check = el({ dataset: { id: 'b' } }), edit = el({ dataset: { edit: 'a' } });
  const rowA = el({ dataset: { id: 'a' } }), rowNc = el({ dataset: { id: 'n', nc: '1', num: 'NC1' } });
  const area = { querySelector: s => s === '#check-all' ? all : null, querySelectorAll: s => ({ '[data-sort]': [th], '.row-check': [check], '[data-edit]': [edit], 'tbody tr[data-id]': [rowA, rowNc] })[s] };
  const elenco = [{ id: 'a' }, { id: 'b' }], pick = new Set(), calls = [];
  api.bindElenco(area, { elenco, pick, rerender: () => calls.push('rerender'), setSort: k => calls.push('sort:' + k), openForm: d => calls.push('open:' + d.id), onSpecialRow: tr => tr.dataset.nc === '1' && calls.push('nc:' + tr.dataset.num) });
  const fire = (target, ev, event = {}) => listeners.find(l => l[0] === target && l[1] === ev)[2]({ stopPropagation() {}, target: { closest: () => null }, ...event });
  fire(th, 'click'); assert.deepEqual(calls, ['sort:data']);
  fire(all, 'click', { target: { checked: true } }); assert.deepEqual([...pick], ['a', 'b']);
  fire(all, 'click', { target: { checked: false } }); assert.equal(pick.size, 0);
  fire(check, 'click', { target: { checked: true } }); assert.deepEqual([...pick], ['b']);
  fire(edit, 'click'); fire(rowA, 'click'); fire(rowNc, 'click');
  fire(rowA, 'click', { target: { closest: () => ({}) } }); // clic su un pulsante dentro la riga: non apre
  assert.deepEqual(calls.slice(1), ['rerender', 'rerender', 'rerender', 'open:a', 'open:a', 'nc:NC1']);
});

test('print actions disable the button while generating and report failures', async () => {
  const handlers = {}, calls = [], alerts = [];
  const els = Object.fromEntries(['f-btn-print', 'f-btn-download', 'f-download-list', 'f-dl-pdf', 'f-dl-excel'].map(id => [id, { disabled: false, addEventListener: (ev, fn) => { handlers[id] = fn; } }]));
  const { api: api2, window: w } = load({ alert: m => alerts.push(m) });
  w.SaasPrint = { openPrintWindow: (...a) => calls.push(['print', ...a]), bindDownloadMenu: (...a) => calls.push(['menu']), downloadPDF: async () => { throw new Error('boom'); }, downloadExcel: async (...a) => calls.push(['excel', ...a]) };
  let doc = null;
  api2.bindPrintActions(id => els[id], 'ddt', () => doc, d => ({ party: d.clienteId }), () => ({ nome: 'Az' }));
  handlers['f-btn-print'](); assert.deepEqual(calls, [['menu']], 'documento nuovo: niente da stampare');
  doc = { id: '1', clienteId: 'c' };
  handlers['f-btn-print']();
  assert.deepEqual(calls[1], ['print', 'ddt', doc, { party: 'c' }, { nome: 'Az' }]);
  await handlers['f-dl-pdf'](); assert.match(alerts[0], /PDF: boom/); assert.equal(els['f-dl-pdf'].disabled, false);
  await handlers['f-dl-excel'](); assert.equal(calls.at(-1)[0], 'excel');
});

test('page start: redirect without session or company, nav rendered otherwise', async () => {
  const mk = (session, companyId) => {
    const storage = { saas_company_id: companyId, saas_company_nome: 'Az' };
    const location = { href: 'x' }; const nav = [];
    const { api: api2, window: w } = load({ localStorage: { getItem: k => storage[k] ?? null, removeItem: k => delete storage[k] }, location });
    w.SaasNav = { render: (...a) => nav.push(a) };
    const store = { async getSession() { return session; }, async getCompany() { return { nome: 'Az' }; }, async signOut() { storage.signedOut = true; } };
    return { api2, location, nav, store, storage };
  };
  let m = mk(null, 'c'); assert.equal(await m.api2.initPage(m.store, 'ddt'), null); assert.equal(m.location.href, 'index.html');
  m = mk({ user: { email: 'u@x' } }, null); assert.equal(await m.api2.initPage(m.store, 'ddt'), null); assert.equal(m.location.href, 'index.html');
  m = mk({ user: { email: 'u@x' } }, 'c');
  const ctx = await m.api2.initPage(m.store, 'ddt');
  assert.deepEqual({ companyId: ctx.companyId, company: ctx.company }, { companyId: 'c', company: { nome: 'Az' } });
  assert.equal(m.nav[0][0], 'ddt'); assert.equal(m.nav[0][1].email, 'u@x');
  await m.nav[0][1].onLogout();
  assert.equal(m.storage.signedOut, true); assert.equal(m.storage.saas_company_id, undefined); assert.equal(m.location.href, 'index.html');
});

test('pending open from lineage opens the matching document only', async () => {
  const { api: api2, window: w } = load();
  w.SaasLineage = { consumePendingOpenNum: coll => coll === 'ddt' ? 'DDT/1' : null };
  const opened = [];
  await api2.openPendingFromLineage({ async loadCollection() { return [{ num: 'DDT/2' }, { num: 'DDT/1' }]; } }, 'c', 'ddt', d => opened.push(d.num));
  await api2.openPendingFromLineage({ async loadCollection() { throw new Error('non deve caricare'); } }, 'c', 'fattureCliente', d => opened.push(d.num));
  assert.deepEqual(opened, ['DDT/1']);
});
