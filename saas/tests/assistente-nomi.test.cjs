const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '../web/assistente-ai.html'), 'utf8');
const slice = (from, to) => { const a = html.indexOf(from), b = html.indexOf(to, a); return html.slice(a, b); };

function load() {
  const ctx = {
    DOC_COLLS: [], MESI_IT: ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'],
    today: () => '2026-10-13', eur: n => n.toFixed(2), due: f => f.tot, residuo: f => f.res,
    inPeriod: (d, m) => d.startsWith(m), periodLabel: m => m, docDetailText: () => '',
  };
  vm.createContext(ctx);
  vm.runInContext(slice('  function parseMeseFromText(', '  function docDetailText(') + slice('  function findMirroredDetail(', '  async function send('), ctx);
  return ctx;
}
const db = {
  clienti: [{ id: 'c1', nome: 'AMERICAN CENTER PLASTIC SURGERY S.R.L.' }],
  fornitori: [{ id: 'f1', nome: 'B.BRAUN MILANO S.P.A.' }, { id: 'f2', nome: 'ASSUT EUROPE S.P.A.' }],
  fattureCliente: [], noteCredito: [], righeMagazzino: [],
  fattureFornitore: [
    { num: 'A1', data: '2026-09-05', fornitoreId: 'f1', tot: 100, res: 100 },
    { num: 'A2', data: '2026-09-20', fornitoreId: 'f1', tot: 50, res: 0 },
    { num: 'A3', data: '2026-08-02', fornitoreId: 'f1', tot: 70, res: 70 },
  ],
};

test('a supplier named as it sounds (B. Brown for B.Braun) is still recognised, with the open total of the month', () => {
  const out = load().findMirroredDetail('a quanto ammontano le fatture non saldate di settembre della ditta B. Brown', db);
  assert.match(out, /Fornitore "B.BRAUN MILANO S.P.A."/);
  assert.match(out, /Ancora da pagare a "B.BRAUN MILANO S.P.A." per le fatture di 2026-09: 100.00 \(1 fatture non saldate\)/);
});

test('generic words like a city or "socio unico" never pick a supplier on their own', () => {
  assert.equal(load().findMirroredDetail('quanto ho speso a Milano?', db), null);
});
