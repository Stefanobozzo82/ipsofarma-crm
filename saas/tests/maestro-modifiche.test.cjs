const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { database, seedTenants, asRole } = require('./helpers/database.cjs');

let db, companies, chiave = 0;
before(async () => {
  db = await database(49); ({ companies } = await seedTenants(db));
  await db.query("insert into clienti(company_id,nome,piva) values($1,'Clinica Uno S.R.L.','01234567890')", [companies.A]);
});
after(async () => { if (db) await db.close(); });

async function record(tabella, dati) {
  await db.query('insert into maestro_records(company_id,tabella,chiave,hash,dati) values($1,$2,$3,$4,$5)',
    [companies.A, tabella, String(++chiave), 'h' + chiave, JSON.stringify(dati)]);
}
// Come fa maestro-sync quando un documento cambia: le righe vecchie restano
// marcate eliminate, arrivano quelle nuove.
async function cambiaRighe(tabella, numreg, righe) {
  await db.query("update maestro_records set deleted=true where company_id=$1 and tabella=$2 and dati->>'NUMREG'=$3", [companies.A, tabella, String(numreg)]);
  for (const r of righe) await record(tabella, r);
}
const riga = (numreg, codedue, qty, prezzo, extra = {}) =>
  ({ NUMREG: numreg, CODICE: 'X' + codedue, CODEDUE: codedue, DESCRIZION: 'Articolo ' + codedue, QUANTITA: qty, PREZZO: prezzo,
     SCONTO: 0, SCOAC2: 0, SCOAC3: 0, IVA: 22, NLOTTO: '', DLOTTO: '1899-12-30', ...extra });
const importa = () => asRole(db, 'service_role', null, tx => tx.query('select maestro_import($1) r', [companies.A])).then(r => r.rows[0].r);
const uno = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const ordine = n => uno("select * from ordini_cliente where company_id=$1 and num=$2", [companies.A, n]);
const log = n => uno("select * from maestro_import_log where company_id=$1 and doc_num=$2", [companies.A, n]);
const testata = (reg, n) => ({ NUMREG: reg, TIPO: 'L', NUMFAT: n, DATAFAT: '06/10/2026', N_DATAFAT: '2026-10-06', NUMCLI: '7',
  CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: 1 });

test('an order changed in Maestro after the import is changed in the CRM too, keeping CRM-only data', async () => {
  await record('ORDINICL', testata(500, 240));
  await record('ARCART_L', riga(500, 'C001', 5, 10));
  await record('ARCART_L', riga(500, 'PREM', 1, 422));
  await record('ARCART_L', riga(500, 'C002', 5, 20));
  await importa();
  const prima = await ordine('OC/2026/0240');
  assert.deepEqual(prima.righe.map(r => r.cod), ['C001', 'PREM', 'C002']);
  // Un dato che esiste solo nel gestionale: deve sopravvivere all'aggiornamento.
  await db.query("update ordini_cliente set righe=jsonb_set(righe,'{0,nota}','\"solo crm\"') where id=$1", [prima.id]);

  // In Maestro: tolto il Premilene, C002 da 5 a 4 più 1 in sconto merce.
  await cambiaRighe('ARCART_L', 500, [riga(500, 'C001', 5, 10), riga(500, 'C002', 4, 20), riga(500, 'C002', 1, 0)]);
  await importa();
  const dopo = await ordine('OC/2026/0240');
  assert.deepEqual(dopo.righe.map(r => [r.cod, r.qty, r.prezzo]), [['C001', 5, 10], ['C002', 4, 20], ['C002', 1, 0]]);
  assert.equal(dopo.righe[0].nota, 'solo crm');
  assert.match((await log('OC/2026/0240')).motivo, /^aggiornato da Maestro il /);

  // Nessuna nuova modifica in Maestro: il giro dopo non tocca nulla.
  const stamp = (await ordine('OC/2026/0240')).updated_at;
  await importa();
  assert.deepEqual((await ordine('OC/2026/0240')).updated_at, stamp);
});

test('a document changed in both Maestro and the CRM is left alone and reported', async () => {
  await record('ORDINICL', testata(501, 241));
  await record('ARCART_L', riga(501, 'C001', 2, 10));
  await importa();
  const oc = await ordine('OC/2026/0241');
  await db.query("update ordini_cliente set righe='[{\"cod\":\"C001\",\"qty\":3,\"prezzo\":10,\"sconto\":\"\",\"iva\":22}]' where id=$1", [oc.id]);
  await cambiaRighe('ARCART_L', 501, [riga(501, 'C001', 6, 10)]);
  await importa();
  assert.equal((await ordine('OC/2026/0241')).righe[0].qty, 3);
  assert.match((await log('OC/2026/0241')).motivo, /cambiato anche nel gestionale/);
});

test('an update that would drop quantities already delivered in the CRM is not applied', async () => {
  await record('ORDINICL', testata(502, 242));
  await record('ARCART_L', riga(502, 'C001', 2, 10));
  await record('ARCART_L', riga(502, 'C003', 2, 10));
  await importa();
  const oc = await ordine('OC/2026/0242');
  await db.query("update ordini_cliente set righe=jsonb_set(righe,'{1,qtyEv}','2') where id=$1", [oc.id]);
  await cambiaRighe('ARCART_L', 502, [riga(502, 'C001', 2, 10)]);
  await importa();
  assert.deepEqual((await ordine('OC/2026/0242')).righe.map(r => r.cod), ['C001', 'C003']);
  assert.match((await log('OC/2026/0242')).motivo, /quantità già evase/);
});

test('a DDT corrected in Maestro keeps the lot recorded in the CRM', async () => {
  await record('BOLLE', { NUMREG: 503, TIPO: 'B', NUMFAT: 77, DATAFAT: '06/10/2026', N_DATAFAT: '2026-10-06', NUMCLI: '7',
    CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: 100 });
  await record('ARCART_B', riga(503, 'C001', 2, 50));
  await importa();
  const ddt = await uno("select * from ddt where company_id=$1 and num='DDT/2026/0077'", [companies.A]);
  await db.query("update ddt set righe=jsonb_set(jsonb_set(righe,'{0,lotto}','\"L9\"'),'{0,scad}','\"2031-01-01\"') where id=$1", [ddt.id]);
  await cambiaRighe('ARCART_B', 503, [riga(503, 'C001', 3, 50)]);
  await importa();
  const dopo = await uno('select righe from ddt where id=$1', [ddt.id]);
  assert.deepEqual([dopo.righe[0].qty, dopo.righe[0].lotto, dopo.righe[0].scad], [3, 'L9', '2031-01-01']);
});

test('a deferred invoice follows the changes of the DDT lines it takes from in Maestro', async () => {
  await record('BOLLE', { NUMREG: 504, TIPO: 'B', NUMFAT: 78, DATAFAT: '07/10/2026', N_DATAFAT: '2026-10-07', NUMCLI: '7',
    CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: 100, NRIFPERBOL: 505 });
  await record('ARCART_B', riga(504, 'C001', 2, 50));
  await record('VENDITE', { NUMREG: 505, TIPO: 'S', NUMFAT: 78, DATAFAT: '07/10/2026', N_DATAFAT: '2026-10-07', NUMCLI: '7',
    CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: 122, PAGATO: false });
  await importa();
  await cambiaRighe('ARCART_B', 504, [riga(504, 'C001', 2, 45)]);
  await importa();
  const ft = await uno("select righe from fatture_cliente where company_id=$1 and num='FT/2026/0078'", [companies.A]);
  assert.deepEqual([ft.righe[0].prezzo, ft.righe[0].source_ddt_index], [45, 0]);
});
