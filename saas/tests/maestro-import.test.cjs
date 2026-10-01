const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const { createMaestroSyncHandler, sha256hex } = require('../supabase/functions/maestro-sync/handler.ts');
const { database, seedTenants, asRole } = require('./helpers/database.cjs');

let db, users, companies, chiave = 0;
before(async () => { db = await database(42); ({ users, companies } = await seedTenants(db)); });
after(async () => { if (db) await db.close(); });

// Un record di Maestro come lo salva maestro-sync (chiave = posizione nel file).
async function record(tabella, dati, company = companies.A) {
  await db.query('insert into maestro_records(company_id,tabella,chiave,hash,dati) values($1,$2,$3,$4,$5)',
    [company, tabella, String(++chiave), 'h' + chiave, JSON.stringify(dati)]);
}
const riga = (numreg, codedue, qty, prezzo, extra = {}) =>
  ({ NUMREG: numreg, CODICE: 'X' + codedue, CODEDUE: codedue, DESCRIZION: 'Articolo ' + codedue, QUANTITA: qty, PREZZO: prezzo,
     SCONTO: 0, SCOAC2: 0, SCOAC3: 0, IVA: 22, NLOTTO: '', DLOTTO: '1899-12-30', ...extra });
const importa = () => asRole(db, 'service_role', null, tx => tx.query('select maestro_import($1) r', [companies.A])).then(r => r.rows[0].r);
const uno = async (sql, params = []) => (await db.query(sql, params)).rows[0];

test('missing Maestro documents are created in the CRM format, deferred invoices linked to their DDT, and nothing is imported twice', async () => {
  const cliente = (await uno("insert into clienti(company_id,nome,piva) values($1,'Clinica Uno S.R.L.','01234567890') returning id", [companies.A])).id;
  const altro = (await uno("insert into clienti(company_id,nome,piva) values($1,'Altro Cliente','09999999999') returning id", [companies.A])).id;
  // Già nel gestionale: un preventivo con lo stesso numero ma di un altro cliente.
  await db.query("insert into preventivi(company_id,num,data,cliente_id) values($1,'PREV/2026/0001','2026-08-07',$2)", [companies.A, altro]);

  await record('BOLLE', { NUMREG: 10, TIPO: 'B', NUMFAT: 5, DATAFAT: '05/09/2026', N_DATAFAT: '2026-09-05', NUMCLI: '7', CLIENTE: 'CLINICA UNO SRL',
    PIVACF: 'IT01234567890', TOTALE: 100, ANNOTAZ: 'ORDINE 12 DEL 01/09/2026', COLLI: 2, NRIFPERBOL: 11 });
  await record('ARCART_B', riga(10, 'C001', 2, 50, { SCONTO: 55, SCOAC2: 10, NLOTTO: 'L1', DLOTTO: '2030-01-31' }));
  await record('ARCART_B', riga(10, 'C002', 1, 10));
  // Fattura differita: in Maestro non ha righe proprie, stanno sul DDT.
  await record('VENDITE', { NUMREG: 11, TIPO: 'S', NUMFAT: 5, DATAFAT: '05/09/2026', N_DATAFAT: '2026-09-05', NUMCLI: '7', CLIENTE: 'CLINICA UNO SRL',
    PIVACF: '01234567890', TOTALE: 122, PAGATO: false });
  await record('PREVENTI', { NUMREG: 12, TIPO: 'P', NUMFAT: 1, DATAFAT: '26/01/2026', N_DATAFAT: '2026-01-26', NUMCLI: '7', CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: 5 });
  await record('ARCART_P', riga(12, 'C003', 1, 5));
  // Fornitore che il gestionale non conosce: si crea dall'anagrafica di Maestro.
  await record('FORNITOR', { CODICE: 3, NOME: 'Nuovo Fornitore SpA', PIVACF: '05555555555', ADDRESS: 'Via Roma 1', CITTA: 'MILANO', PROV: 'MI', CAP: 20100 });
  await record('ACQUISTI', { NUMREG: 20, TIPO: 'F', NUMERO: 'A-77', NUMFAT: 3, DATAFAT: '10/09/2026', N_DATAFAT: '2026-09-10', NUMFOR: '3',
    FORNITORE: 'Nuovo Fornitore SpA', PIVACF: '05555555555', TOTALE: 61, PAGATO: true, DRATA1: '2026-09-20' });
  await record('ARCART_A', riga(20, 'C001', 1, 50));
  // Prima della data di partenza: resta fuori.
  await record('BOLLE', { NUMREG: 1, TIPO: 'B', NUMFAT: 300, DATAFAT: '20/12/2025', N_DATAFAT: '2025-12-20', NUMCLI: '7', CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: 9 });
  await record('ARCART_B', riga(1, 'C009', 1, 9));

  const report = await importa();
  assert.deepEqual(report.importati, { ddt: 1, fatture_cliente: 1, preventivi: 1, fatture_fornitore: 1 });
  assert.deepEqual(report.nuove_anagrafiche, [{ tipo: 'fornitore', nome: 'Nuovo Fornitore SpA' }]);

  const ddt = await uno("select * from ddt where company_id=$1 and num='DDT/2026/0005'", [companies.A]);
  assert.equal(ddt.cliente_id, cliente);
  assert.equal(ddt.data.toISOString().slice(0, 10), '2026-09-05');
  assert.deepEqual(ddt.righe[0], { cod: 'C001', descr: 'Articolo C001', qty: 2, prezzo: 50, sconto: '55+10', iva: 22, lotto: 'L1', scad: '2030-01-31' });
  assert.equal(ddt.righe[1].sconto, '');
  assert.equal(ddt.righe[1].scad, '');
  assert.deepEqual(ddt.extra, { note: 'ORDINE 12 DEL 01/09/2026', colli: 2, ftId: 'FT/2026/0005' });

  const ft = await uno("select * from fatture_cliente where company_id=$1 and num='FT/2026/0005'", [companies.A]);
  assert.equal(ft.ddt_id, ddt.id);
  assert.deepEqual(ft.righe.map(r => [r.cod, r.source_ddt_index]), [['C001', 0], ['C002', 1]]);
  assert.equal(ft.paid, false);

  const prev = await uno("select * from preventivi where company_id=$1 and num='PREV/2026/0001-M'", [companies.A]);
  assert.equal(prev.cliente_id, cliente);

  const fornitore = await uno("select * from fornitori where company_id=$1 and piva='05555555555'", [companies.A]);
  assert.equal(fornitore.nome, 'Nuovo Fornitore SpA');
  assert.equal(fornitore.citta, 'MILANO');
  const ftf = await uno("select * from fatture_fornitore where company_id=$1 and num='A-77'", [companies.A]);
  assert.equal(ftf.fornitore_id, fornitore.id);
  assert.equal(ftf.paid, true);
  assert.equal(ftf.paid_date.toISOString().slice(0, 10), '2026-09-20');
  assert.deepEqual(ftf.pagamenti, [{ data: '2026-09-20', importo: 61 }]);

  assert.equal((await uno("select count(*)::int n from ddt where company_id=$1 and num like 'DDT/2025/%'", [companies.A])).n, 0);

  // Secondo giro: niente di nuovo, nessun doppione.
  const again = await importa();
  assert.deepEqual(again.importati, {});
  assert.equal((await uno('select count(*)::int n from ddt where company_id=$1', [companies.A])).n, 1);
  assert.equal((await uno('select count(*)::int n from fornitori where company_id=$1', [companies.A])).n, 1);
});

test('a number already used by another document, or the same document under another number, is reported instead of imported', async () => {
  const cliente = (await uno("select id from clienti where company_id=$1 and piva='01234567890'", [companies.A])).id;
  const altro = (await uno("select id from clienti where company_id=$1 and piva='09999999999'", [companies.A])).id;
  await db.query("insert into ddt(company_id,num,data,cliente_id,righe) values($1,'DDT/2026/0006','2026-09-08',$2,'[]')", [companies.A, altro]);
  // Stessa consegna già registrata nel gestionale come DDT 7 (righe diverse, stesso imponibile).
  await db.query(`insert into ddt(company_id,num,data,cliente_id,righe) values($1,'DDT/2026/0007','2026-09-09',$2,
    '[{"cod":"C004","qty":1,"prezzo":125,"sconto":""}]')`, [companies.A, cliente]);

  await record('BOLLE', { NUMREG: 30, TIPO: 'B', NUMFAT: 6, DATAFAT: '08/09/2026', NUMCLI: '7', CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: 10 });
  await record('ARCART_B', riga(30, 'C001', 1, 10));
  await record('BOLLE', { NUMREG: 31, TIPO: 'B', NUMFAT: 8, DATAFAT: '10/09/2026', NUMCLI: '7', CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: 125 });
  await record('ARCART_B', riga(31, 'C004', 25, 5));
  // Reso con totale negativo: non diventa un DDT.
  await record('BOLLE', { NUMREG: 32, TIPO: 'B', NUMFAT: 9, DATAFAT: '11/09/2026', NUMCLI: '7', CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: -40 });
  await record('ARCART_B', riga(32, 'C001', -1, 40));

  const report = await importa();
  assert.deepEqual(report.importati, {});
  assert.equal((await uno("select count(*)::int n from ddt where company_id=$1 and num in ('DDT/2026/0008','DDT/2026/0009')", [companies.A])).n, 0);
  const log = Object.fromEntries((await db.query("select numreg, esito, doc_num, motivo from maestro_import_log where company_id=$1 and numreg in (30,31,32)", [companies.A])).rows.map(r => [r.numreg, r]));
  assert.equal(log[30].esito, 'conflitto');
  assert.match(log[30].motivo, /già usato da un altro documento/);
  assert.equal(log[31].esito, 'conflitto');
  assert.equal(log[31].doc_num, 'DDT/2026/0007');
  assert.equal(log[32].esito, 'ignorato');
  assert.equal(report.da_verificare, 2);

  // Corretto il gestionale, il giro successivo lo riconosce.
  await db.query("update ddt set cliente_id=$2, righe=$3 where company_id=$1 and num='DDT/2026/0006'",
    [companies.A, cliente, JSON.stringify([{ cod: 'C001', qty: 1, prezzo: 10, sconto: '' }])]);
  await importa();
  assert.equal((await uno('select esito from maestro_import_log where company_id=$1 and numreg=30', [companies.A])).esito, 'presente');
});

test('documents whose lines have not arrived yet wait for the next run', async () => {
  await record('ORDINI', { NUMREG: 40, TIPO: 'O', NUMFAT: 50, DATAFAT: '12/09/2026', NUMFOR: '3', FORNITORE: 'Nuovo Fornitore SpA', PIVACF: '05555555555', TOTALE: 20 });
  let report = await importa();
  assert.equal(report.in_attesa, 1);
  await record('ARCART_O', riga(40, 'C001', 2, 10));
  report = await importa();
  assert.deepEqual(report.importati, { ordini_fornitore: 1 });
  assert.equal(report.in_attesa, 0);
});

test('only the server runs the import; members read the outcome of their own company only', async () => {
  await assert.rejects(asRole(db, 'authenticated', users.admin, tx => tx.query('select maestro_import($1)', [companies.A])), /permission denied/);
  const read = user => asRole(db, 'authenticated', user, tx => tx.query('select count(*)::int n from maestro_import_log')).then(r => r.rows[0].n);
  assert.ok(await read(users.viewer) > 0);
  assert.equal(await read(users.otherAdmin), 0);
  await assert.rejects(asRole(db, 'authenticated', users.admin, tx => tx.query("delete from maestro_import_log")), /permission denied/);
});

test('the sync endpoint runs the import only when a file brought changes, and an import error does not lose the upload', async () => {
  const key = 'msk_' + 'e'.repeat(48);
  const store = new Map(); let imports = 0, fail = false;
  const handler = createMaestroSyncHandler({
    companyForKeyHash: async h => (h === await sha256hex(key) ? 'company-A' : null),
    existingHashes: async () => new Map([...store].map(([k, v]) => [k, v])),
    upsert: async rows => rows.forEach(r => store.set(r.chiave, r.hash)),
    startRun: async () => 'run-1',
    finishRun: async () => {},
    importDocuments: async () => { imports++; if (fail) throw new Error('boom'); return { importati: { ddt: 1 } }; },
  });
  // DBF minimo: un campo C(4), un record.
  const header = Buffer.alloc(32 + 32 + 1); header[0] = 3; header.writeUInt32LE(1, 4); header.writeUInt16LE(65, 8); header.writeUInt16LE(5, 10);
  Buffer.from('NOME').copy(header, 32); header[32 + 11] = 'C'.charCodeAt(0); header[32 + 16] = 4; header[64] = 0x0d;
  const dbf = Buffer.concat([header, Buffer.from(' ABCD'), Buffer.from([0x1a])]);
  const send = () => {
    const form = new FormData(); form.set('tabella', 'BOLLE'); form.set('dbf', new Blob([gzipSync(dbf)]), 'dbf');
    return handler(new Request('https://edge.test', { method: 'POST', headers: { 'x-maestro-key': key }, body: form })).then(r => r.json());
  };
  assert.deepEqual((await send()).import, { importati: { ddt: 1 } });
  assert.equal((await send()).import, undefined);
  assert.equal(imports, 1);
  store.clear(); fail = true;
  const res = await send();
  assert.equal(res.ok, true);
  assert.deepEqual(res.import, { errore: 'boom' });
});

test('numbers Maestro has twice get the CRM -2 suffix, duplicate parties match by content, and counters continue after the last number', async () => {
  const cliente = (await uno("select id from clienti where company_id=$1 and piva='01234567890'", [companies.A])).id;
  // Anagrafica doppia nel gestionale (senza P.IVA) usata per l'ordine 70-2.
  const doppio = (await uno("insert into clienti(company_id,nome) values($1,'Clinica Uno per immagini') returning id", [companies.A])).id;
  await db.query(`insert into ordini_cliente(company_id,num,data,cliente_id,righe) values
    ($1,'OC/2026/0070','2026-09-01',$2,'[{"cod":"C001","qty":1,"prezzo":10,"sconto":""}]'),
    ($1,'OC/2026/0070-2','2026-06-30',$3,'[{"cod":"C005","qty":3,"prezzo":20,"sconto":""}]')`, [companies.A, cliente, doppio]);
  await db.query("insert into document_counters(company_id,doc_type,anno,next_value) values($1,'DDT',2026,3) on conflict (company_id,doc_type,anno) do update set next_value=3", [companies.A]);

  // Maestro ha due ordini 70 e due DDT 12 (numeri doppi nel suo archivio).
  for (const [reg, cod, qty, prezzo] of [[50, 'C001', 1, 10], [51, 'C005', 3, 20]]) {
    await record('ORDINICL', { NUMREG: reg, TIPO: 'L', NUMFAT: 70, DATAFAT: '01/09/2026', NUMCLI: '7', CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: 1 });
    await record('ARCART_L', riga(reg, cod, qty, prezzo));
  }
  for (const reg of [52, 53]) {
    await record('BOLLE', { NUMREG: reg, TIPO: 'B', NUMFAT: 12, DATAFAT: '15/09/2026', NUMCLI: '7', CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: reg });
    await record('ARCART_B', riga(reg, 'C00' + (reg - 50), 1, reg));
  }

  const report = await importa();
  assert.deepEqual(report.importati, { ddt: 2 });
  const log = Object.fromEntries((await db.query('select numreg, esito, doc_num from maestro_import_log where company_id=$1 and numreg between 50 and 53', [companies.A])).rows.map(r => [r.numreg, r]));
  assert.deepEqual([log[50].esito, log[50].doc_num], ['presente', 'OC/2026/0070']);
  assert.deepEqual([log[51].esito, log[51].doc_num], ['presente', 'OC/2026/0070-2']);
  assert.deepEqual([log[52].doc_num, log[53].doc_num], ['DDT/2026/0012', 'DDT/2026/0012-2']);

  const counters = Object.fromEntries((await db.query('select doc_type, next_value from document_counters where company_id=$1 and anno=2026', [companies.A])).rows.map(r => [r.doc_type, r.next_value]));
  assert.equal(counters.DDT, 13);
  assert.equal(counters.FT, 6);
  assert.equal(counters.OC, 71);
  assert.equal(counters.PREV, 2);
});

test('invoices collected in Maestro get the actual payment date, without touching payments already recorded in the CRM', async () => {
  const cliente = (await uno("select id from clienti where company_id=$1 and piva='01234567890'", [companies.A])).id;
  const righe = JSON.stringify([{ cod: 'C001', qty: 1, prezzo: 100, sconto: '' }]);
  await db.query("insert into fatture_cliente(company_id,num,data,cliente_id,righe) values($1,'FT/2026/0080','2026-07-22',$2,$3)", [companies.A, cliente, righe]);
  await db.query(`insert into fatture_cliente(company_id,num,data,cliente_id,righe,paid,paid_date,pagamenti) values
    ($1,'FT/2026/0081','2026-07-23',$2,$3,true,'2026-08-01','[{"data":"2026-08-01","importo":122}]')`, [companies.A, cliente, righe]);
  // In Maestro: rata saldata, DRATA1 è diventata la data dell'incasso (scadenza era il 21/08).
  const incassata = { TIPO: 'S', DATAFAT: '22/07/2026', NUMCLI: '7', CLIENTE: 'CLINICA UNO SRL', PIVACF: '01234567890', TOTALE: 122,
    LRATA1: true, SRATA1: true, DRATA1: '2026-08-05', PRATA1: 122, PSALDO: 100, PAGATO: false };
  await record('VENDITE', { ...incassata, NUMREG: 80, NUMFAT: 80 });
  await record('VENDITE', { ...incassata, NUMREG: 81, NUMFAT: 81, DATAFAT: '23/07/2026', DRATA1: '2026-08-09' });

  const report = await importa();
  assert.equal(report.incassi, 1);
  const f80 = await uno("select paid, paid_date, pagamenti from fatture_cliente where company_id=$1 and num='FT/2026/0080'", [companies.A]);
  assert.equal(f80.paid, true);
  assert.equal(f80.paid_date.toISOString().slice(0, 10), '2026-08-05');
  assert.deepEqual(f80.pagamenti, [{ data: '2026-08-05', importo: 122 }]);
  const f81 = await uno("select paid_date, pagamenti from fatture_cliente where company_id=$1 and num='FT/2026/0081'", [companies.A]);
  assert.deepEqual(f81.pagamenti, [{ data: '2026-08-01', importo: 122 }]);
  assert.equal((await uno("select count(*)::int n from invoice_payment_operations where company_id=$1 and action='maestro_sync'", [companies.A])).n, 1);

  assert.equal((await importa()).incassi, 0);
});

test('a Maestro credit note kept as a negative invoice is closed too, and VAT rounding cents do not leave a paid invoice open', async () => {
  const forn = (await uno("select id from fornitori where company_id=$1 and piva='05555555555'", [companies.A])).id;
  await db.query(`insert into fatture_fornitore(company_id,num,data,fornitore_id,righe) values
    ($1,'NC-90','2026-06-30',$2,'[{"cod":"C001","qty":1,"prezzo":-46.8,"iva":22,"sconto":""}]'),
    ($1,'FT-91','2026-02-26',$2,'[{"cod":"C001","qty":3,"prezzo":33.33,"iva":22,"sconto":""}]')`, [companies.A, forn]);
  const base = { DATAFAT: '30/06/2026', NUMFOR: '3', FORNITORE: 'Nuovo Fornitore SpA', PIVACF: '05555555555', LRATA1: true, SRATA1: true, PSALDO: 100 };
  await record('ACQUISTI', { ...base, NUMREG: 90, TIPO: 'N', NUMERO: 'NC-90', TOTALE: 57.1, PRATA1: 57.1, DRATA1: '2026-09-25' });
  await record('ACQUISTI', { ...base, NUMREG: 91, TIPO: 'F', NUMERO: 'FT-91', DATAFAT: '26/02/2026', TOTALE: 122, PRATA1: 122, DRATA1: '2026-03-31' });

  await importa();
  const nc = await uno("select paid, pagamenti from fatture_fornitore where company_id=$1 and num='NC-90'", [companies.A]);
  assert.equal(nc.paid, true);
  assert.deepEqual(nc.pagamenti, [{ data: '2026-09-25', importo: -57.1 }]);
  const ft = await uno("select paid, pagamenti, invoice_gross_total(righe)::float tot from fatture_fornitore where company_id=$1 and num='FT-91'", [companies.A]);
  assert.equal(ft.paid, true);
  assert.equal(ft.pagamenti[0].importo, ft.tot);
});
