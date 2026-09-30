const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const { readDbf } = require('../supabase/functions/maestro-sync/dbf.ts');
const { createMaestroSyncHandler, sha256hex } = require('../supabase/functions/maestro-sync/handler.ts');
const { database, migrate, seedTenants, asRole } = require('./helpers/database.cjs');

// Costruisce un file dBase IV minimo, con eventuale memo .DBT, come quelli di Maestro.
function makeDbf(fields, rows, { memo = {} } = {}) {
  const headerLen = 32 + fields.length * 32 + 1;
  const recordLen = 1 + fields.reduce((s, f) => s + f.length, 0);
  const buf = Buffer.alloc(headerLen + rows.length * recordLen + 1, 0x20);
  buf.fill(0, 0, headerLen);
  buf[0] = 0x8b; buf.writeUInt32LE(rows.length, 4); buf.writeUInt16LE(headerLen, 8); buf.writeUInt16LE(recordLen, 10);
  fields.forEach((f, i) => {
    const o = 32 + i * 32;
    buf.write(f.name, o, 'latin1'); buf[o + 11] = f.type.charCodeAt(0); buf[o + 16] = f.length; buf[o + 17] = f.decimals || 0;
  });
  buf[headerLen - 1] = 0x0d;
  rows.forEach((r, n) => {
    let o = headerLen + n * recordLen;
    buf[o] = r._deleted ? 0x2a : 0x20; o++;
    for (const f of fields) {
      const v = r[f.name] == null ? '' : String(r[f.name]);
      const text = f.type === 'N' || f.type === 'M' ? v.padStart(f.length) : v.padEnd(f.length);
      buf.write(text.slice(0, f.length), o, 'latin1'); o += f.length;
    }
  });
  buf[buf.length - 1] = 0x1a;
  let dbt = null;
  const blocks = Object.entries(memo);
  if (blocks.length) {
    dbt = Buffer.alloc(512 * (blocks.length + 1), 0);
    dbt.writeUInt16LE(512, 20);
    blocks.forEach(([block, text]) => {
      const o = Number(block) * 512; const body = Buffer.from(text, 'latin1');
      dbt.writeUInt32LE(0x0008ffff, o); dbt.writeUInt32LE(body.length + 8, o + 4); body.copy(dbt, o + 8);
    });
  }
  return { dbf: new Uint8Array(buf), dbt: dbt && new Uint8Array(dbt) };
}

const FIELDS = [
  { name: 'NUMFAT', type: 'N', length: 8 }, { name: 'DATAFAT', type: 'C', length: 10 },
  { name: 'CLIENTE', type: 'C', length: 20 }, { name: 'TOTALE', type: 'N', length: 10, decimals: 2 },
  { name: 'PAGATO', type: 'L', length: 1 }, { name: 'SCAD', type: 'D', length: 8 }, { name: 'NOTE', type: 'M', length: 10 },
];

test('DBF reader decodes Maestro field types, deleted flags, Windows-1252 text and dBase IV memos', () => {
  const { dbf, dbt } = makeDbf(FIELDS, [
    { NUMFAT: 318, DATAFAT: '30/09/2026', CLIENTE: 'CA.GI. SPA', TOTALE: '122.50', PAGATO: 'T', SCAD: '20261031', NOTE: 1 },
    { NUMFAT: 7, DATAFAT: '01/02/2026', CLIENTE: 'Città\xe0', TOTALE: '', PAGATO: 'F', SCAD: '', _deleted: true },
  ], { memo: { 1: 'Consegna al piano terra' } });
  const { fields, records } = readDbf(dbf, dbt);
  assert.deepEqual(fields.map(f => f.name), FIELDS.map(f => f.name));
  assert.deepEqual(records[0].values, { NUMFAT: 318, DATAFAT: '30/09/2026', CLIENTE: 'CA.GI. SPA', TOTALE: 122.5, PAGATO: true, SCAD: '2026-10-31', NOTE: 'Consegna al piano terra' });
  assert.equal(records[0].deleted, false);
  assert.equal(records[1].deleted, true);
  assert.equal(records[1].values.TOTALE, null);
  assert.equal(records[1].values.SCAD, null);
  assert.equal(records[1].values.NOTE, null);
  assert.equal(records[1].values.CLIENTE, 'Cittàà');
});

function fakeDeps(companyByHash) {
  const store = new Map(), runs = [];
  return {
    store, runs,
    deps: {
      companyForKeyHash: async hash => companyByHash[hash] || null,
      existingHashes: async (c, t) => new Map([...store.values()].filter(r => r.company_id === c && r.tabella === t).map(r => [r.chiave, r.hash])),
      upsert: async rows => rows.forEach(r => store.set(`${r.company_id}|${r.tabella}|${r.chiave}`, r)),
      startRun: async (c, t, meta) => { runs.push({ c, t, meta }); return 'run-' + runs.length; },
      finishRun: async (id, stato, report) => { runs[Number(id.split('-')[1]) - 1].result = { stato, report }; },
    },
  };
}
function request(key, tabella, files) {
  const form = new FormData();
  form.set('tabella', tabella);
  for (const [name, bytes] of Object.entries(files)) form.set(name, new Blob([gzipSync(bytes)]), name);
  return new Request('https://edge.test/maestro-sync', { method: 'POST', headers: key ? { 'x-maestro-key': key } : {}, body: form });
}

test('sync endpoint authenticates by key hash, stores only new or changed records, and scopes them to the key company', async () => {
  const key = 'msk_' + 'a'.repeat(48);
  const f = fakeDeps({ [await sha256hex(key)]: 'company-A' });
  const handler = createMaestroSyncHandler(f.deps);
  const first = makeDbf(FIELDS, [{ NUMFAT: 1, CLIENTE: 'A' }, { NUMFAT: 2, CLIENTE: 'B' }]);

  let res = await handler(request(key, 'bolle', { dbf: first.dbf }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, tabella: 'BOLLE', record: 2, nuovi: 2, modificati: 0, invariati: 0 });
  assert.ok([...f.store.values()].every(r => r.company_id === 'company-A' && r.tabella === 'BOLLE'));

  const second = makeDbf(FIELDS, [{ NUMFAT: 1, CLIENTE: 'A' }, { NUMFAT: 2, CLIENTE: 'B modificato' }, { NUMFAT: 3, CLIENTE: 'C' }]);
  res = await handler(request(key, 'BOLLE', { dbf: second.dbf }));
  assert.deepEqual(await res.json(), { ok: true, tabella: 'BOLLE', record: 3, nuovi: 1, modificati: 1, invariati: 1 });
  assert.equal(f.store.get('company-A|BOLLE|2').dati.CLIENTE, 'B modificato');
  assert.equal(f.runs.length, 2);
  assert.equal(f.runs[1].result.stato, 'ok');
});

test('sync endpoint rejects missing, malformed or unknown keys and tables it does not manage', async () => {
  const key = 'msk_' + 'b'.repeat(48);
  const f = fakeDeps({ [await sha256hex(key)]: 'company-A' });
  const handler = createMaestroSyncHandler(f.deps);
  const { dbf } = makeDbf(FIELDS, [{ NUMFAT: 1 }]);
  assert.equal((await handler(request(null, 'BOLLE', { dbf }))).status, 401);
  assert.equal((await handler(request('msk_short', 'BOLLE', { dbf }))).status, 401);
  assert.equal((await handler(request('msk_' + 'c'.repeat(48), 'BOLLE', { dbf }))).status, 401);
  assert.equal((await handler(request(key, 'CONFIG', { dbf }))).status, 400);
  assert.equal((await handler(new Request('https://edge.test', { method: 'GET' }))).status, 405);
  assert.equal(f.store.size, 0);
  assert.equal(f.runs.length, 0);
});

test('a corrupt file is recorded as a failed run without writing records', async () => {
  const key = 'msk_' + 'd'.repeat(48);
  const f = fakeDeps({ [await sha256hex(key)]: 'company-A' });
  const res = await createMaestroSyncHandler(f.deps)(request(key, 'BOLLE', { dbf: new Uint8Array(10) }));
  assert.equal(res.status, 422);
  assert.equal(f.store.size, 0);
  assert.equal(f.runs[0].result.stato, 'errore');
});

let db, users, companies;
before(async () => { db = await database(37); ({ users, companies } = await seedTenants(db)); await migrate(db, 38, 38); });
after(async () => { if (db) await db.close(); });

test('only a company admin can create a sync key; it is returned once and stored only as a hash', async () => {
  const key = (await asRole(db, 'authenticated', users.admin, tx => tx.query('select create_maestro_sync_key($1) k', [companies.A]))).rows[0].k;
  assert.match(key, /^msk_[0-9a-f]{48}$/);
  const stored = (await db.query('select key_hash, company_id, revocata_at from maestro_sync_keys')).rows;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].key_hash, require('node:crypto').createHash('sha256').update(key).digest('hex'));
  assert.equal(stored[0].company_id, companies.A);

  for (const user of [users.operator, users.viewer, users.otherAdmin]) {
    await assert.rejects(asRole(db, 'authenticated', user, tx => tx.query('select create_maestro_sync_key($1)', [companies.A])), /amministratore/);
  }
  await assert.rejects(asRole(db, 'authenticated', users.admin, tx => tx.query('select * from maestro_sync_keys')), /permission denied/);

  await asRole(db, 'authenticated', users.admin, tx => tx.query('select create_maestro_sync_key($1)', [companies.A]));
  const active = (await db.query('select count(*)::int n from maestro_sync_keys where revocata_at is null')).rows[0].n;
  assert.equal(active, 1, 'una nuova chiave revoca la precedente');
  const status = (await asRole(db, 'authenticated', users.operator, tx => tx.query('select * from maestro_sync_status($1)', [companies.A]))).rows[0];
  assert.equal(status.chiave_attiva, true);
  assert.equal((await asRole(db, 'authenticated', users.otherAdmin, tx => tx.query('select * from maestro_sync_status($1)', [companies.A]))).rows.length, 0);
});

test('sync records and runs are readable only inside the company and never writable from the browser', async () => {
  await db.query("insert into maestro_sync_runs(id,company_id,tabella,stato) values('00000000-0000-4000-8000-000000000901',$1,'BOLLE','ok')", [companies.A]);
  await db.query("insert into maestro_records(company_id,tabella,chiave,hash,dati) values($1,'BOLLE','1','h','{}')", [companies.A]);
  const read = (user, table) => asRole(db, 'authenticated', user, tx => tx.query(`select count(*)::int n from ${table}`)).then(r => r.rows[0].n);
  assert.equal(await read(users.admin, 'maestro_records'), 1);
  assert.equal(await read(users.operator, 'maestro_records'), 0, 'i record grezzi solo agli admin');
  assert.equal(await read(users.otherAdmin, 'maestro_records'), 0);
  assert.equal(await read(users.operator, 'maestro_sync_runs'), 1);
  assert.equal(await read(users.otherAdmin, 'maestro_sync_runs'), 0);
  await assert.rejects(asRole(db, 'authenticated', users.admin, tx => tx.query("insert into maestro_records(company_id,tabella,chiave,hash,dati) values($1,'BOLLE','2','h','{}')", [companies.A])), /permission denied|row-level security/);
});

test('the downloadable agent zip matches the agent sources and only sends tables the server accepts', () => {
  const fs = require('node:fs'), path = require('node:path'), dir = path.join(__dirname, '../web/agente-maestro');
  const { TABELLE_AMMESSE } = require('../supabase/functions/maestro-sync/handler.ts');
  const entries = unzipEntries(fs.readFileSync(path.join(dir, 'agente-maestro.zip')));
  for (const name of ['LEGGIMI.txt', 'installa.bat', 'maestro-agent.ps1', 'run-hidden.vbs']) {
    assert.ok(entries[name], `${name} manca nello zip`);
    assert.ok(entries[name].equals(fs.readFileSync(path.join(dir, name))), `${name} nello zip è diverso dal sorgente: rigenera agente-maestro.zip`);
  }
  const ps = fs.readFileSync(path.join(dir, 'maestro-agent.ps1'), 'utf8');
  const tables = ps.slice(ps.indexOf('$TABELLE = @('), ps.indexOf(')', ps.indexOf('$TABELLE = @('))).match(/'([A-Z_]+)'/g).map(s => s.slice(1, -1));
  assert.ok(tables.length >= 10);
  for (const t of tables) assert.ok(TABELLE_AMMESSE.has(t), `${t} non è accettata dalla funzione`);
  const bat = fs.readFileSync(path.join(dir, 'installa.bat'), 'utf8');
  assert.match(bat, /\r\n/, 'installa.bat deve avere fine riga CRLF');
  assert.match(bat, /functions\/v1\/maestro-sync/);
});

function unzipEntries(buf) {
  const zlib = require('node:zlib'); const out = {};
  for (let o = 0; o + 30 <= buf.length && buf.readUInt32LE(o) === 0x04034b50;) {
    const method = buf.readUInt16LE(o + 8), size = buf.readUInt32LE(o + 18), nameLen = buf.readUInt16LE(o + 26), extraLen = buf.readUInt16LE(o + 28);
    const name = buf.toString('utf8', o + 30, o + 30 + nameLen), start = o + 30 + nameLen + extraLen;
    const data = buf.subarray(start, start + size);
    out[name] = method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data);
    o = start + size;
  }
  return out;
}
