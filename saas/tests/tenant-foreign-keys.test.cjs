const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { database, migrate, asRole, seedTenants, uuid } = require('./helpers/database.cjs');

// Explicit independent inventory, not parsed from the migration being tested.
const links = [
  ['prodotti', 'fornitore_id', 'fornitori'],
  ['preventivi', 'cliente_id', 'clienti', 'null'],
  ['preventivi', 'oc_id', 'ordini_cliente', 'null'],
  ['ordini_cliente', 'cliente_id', 'clienti'],
  ['ordini_cliente', 'prev_id', 'preventivi', 'null'],
  ['ordini_fornitore', 'fornitore_id', 'fornitori'],
  ['ddt', 'cliente_id', 'clienti'], ['ddt', 'oc_id', 'ordini_cliente', 'null'],
  ['fatture_cliente', 'cliente_id', 'clienti'], ['fatture_cliente', 'ddt_id', 'ddt', 'null'],
  ['fatture_cliente', 'oc_id', 'ordini_cliente', 'null'],
  ['fatture_fornitore', 'fornitore_id', 'fornitori'], ['fatture_fornitore', 'of_id', 'ordini_fornitore', 'null'],
  ['fatture_fornitore', 'ddtf_id', 'ddt_fornitore', 'null'],
  ['note_credito', 'cliente_id', 'clienti'], ['note_credito', 'fattura_id', 'fatture_cliente', 'null'],
  ['note_credito_fornitore', 'fornitore_id', 'fornitori'], ['note_credito_fornitore', 'fattura_id', 'fatture_fornitore', 'null'],
  ['movimenti_magazzino', 'prodotto_id', 'prodotti', 'cascade'],
  ['movimenti_magazzino', 'deposito_id', 'depositi', 'restrict'],
  ['ddt_fornitore', 'fornitore_id', 'fornitori'], ['ddt_fornitore', 'of_id', 'ordini_fornitore', 'null'],
];
const tables = ['clienti','fornitori','prodotti','depositi','preventivi','ordini_cliente',
  'ordini_fornitore','ddt','fatture_cliente','ddt_fornitore','fatture_fornitore',
  'note_credito','note_credito_fornitore','movimenti_magazzino'];
let db, tenant, sequence = 1000;
const fixtures = { A: {}, B: {} };
async function insert(connection, table, row) {
  const columns = Object.keys(row);
  return connection.query(`insert into ${table} (${columns.join(',')}) values (${columns.map((_,i)=>'$'+(i+1)).join(',')}) returning *`, Object.values(row));
}
function copy(table, company = 'A') {
  const row = { ...fixtures[company][table], id: uuid(++sequence) };
  if (row.num) row.num = `TEST-${sequence}`;
  if (row.cod) row.cod = `PROD-${sequence}`;
  return row;
}
const authenticated = fn => asRole(db, 'authenticated', tenant.users.admin, fn);

before(async () => {
  db = await database(); tenant = await seedTenants(db);
  tenant.users.dual = uuid(15);
  await db.query('insert into auth.users(id,email) values($1,$2)',[tenant.users.dual,'dual@example.test']);
  for (const company of Object.values(tenant.companies)) {
    await db.query("insert into memberships(company_id,user_id,role) values($1,$2,'admin')",[company,tenant.users.dual]);
  }
  for (const [letter, company_id] of Object.entries(tenant.companies)) {
    const refs = Object.fromEntries(tables.map((t,i) => [t, uuid((letter==='A'?100:200)+i)]));
    for (const table of tables) {
      let row = { id: refs[table], company_id };
      if (['clienti','fornitori','depositi'].includes(table)) row.nome = table;
      else if (table === 'prodotti') Object.assign(row, {cod: 'P', descr: 'Synthetic product', fornitore_id: refs.fornitori});
      else if (table === 'movimenti_magazzino') Object.assign(row, {prodotto_id:refs.prodotti, deposito_id:refs.depositi, tipo:'carico', quantita:1});
      else {
        Object.assign(row, {num:table, data:'2026-09-19'});
        row[table.includes('fornitore') ? 'fornitore_id' : 'cliente_id'] = table.includes('fornitore') ? refs.fornitori : refs.clienti;
        for (const [child,column,parent] of links) {
          if(child===table && column!=='cliente_id' && column!=='fornitore_id') row[column] = table==='preventivi' ? null : refs[parent];
        }
      }
      fixtures[letter][table] = row;
      await insert(db, table, row);
    }
    await db.query('update preventivi set oc_id=$1 where id=$2', [refs.ordini_cliente,refs.preventivi]);
    fixtures[letter].preventivi.oc_id = refs.ordini_cliente;
  }
  // Prove the baseline admits cross-tenant structural links, even under RLS.
  await authenticated(tx => insert(tx, 'prodotti', {
    ...copy('prodotti'), id:uuid(999), fornitore_id:fixtures.B.fornitori.id,
  }));
  await migrate(db, 17, 18);
});
after(async () => { if (db) await db.close(); });

test('all 22 new constraints protect writes while legacy bad data is preserved', async () => {
  const constraints = await db.query("select conname, convalidated from pg_constraint where conname like '%_tenant_fkey'");
  assert.equal(constraints.rows.length, links.length);
  assert.ok(constraints.rows.every(c => c.convalidated === false));
  const legacy = (await db.query('select company_id,fornitore_id from prodotti where id=$1',[uuid(999)])).rows[0];
  assert.equal(legacy.company_id, tenant.companies.A);
  assert.equal(legacy.fornitore_id, fixtures.B.fornitori.id);
  const rollout = fs.readFileSync(path.join(__dirname,'../docs/TENANT_FK_ROLLOUT.md'),'utf8');
  const preflightSql = [...rollout.matchAll(/```sql\s*([\s\S]*?)```/g)][0][1];
  const preflight = (await db.query(preflightSql)).rows;
  assert.equal(preflight.length,22);
  assert.deepEqual(preflight.filter(row=>Number(row.anomalie)>0).map(row=>row.vincolo),['prodotti_fornitore_id_tenant_fkey']);
  assert.equal(Number(preflight.find(row=>row.vincolo==='prodotti_fornitore_id_tenant_fkey').anomalie),1);
  await assert.rejects(db.exec('alter table prodotti validate constraint prodotti_fornitore_id_tenant_fkey'), {code:'23503'});
  // A descriptive update does not fix or erase a pre-existing invalid FK.
  await authenticated(tx => tx.query('update prodotti set descr=$1 where id=$2',['Legacy preserved',uuid(999)]));
});

for (const [child,column,parent,action] of links) {
  test(`${child}.${column}: same tenant accepted, foreign insert/update denied`, async () => {
    const valid = copy(child);
    valid[column] = fixtures.A[parent].id;
    await authenticated(tx => insert(tx,child,valid));
    const invalid = { ...copy(child), [column]:fixtures.B[parent].id };
    for (const user of [tenant.users.admin,tenant.users.operator,tenant.users.dual]) {
      await assert.rejects(asRole(db,'authenticated',user,tx=>insert(tx,child,invalid)),{code:'23503'});
    }
    // Owner path exercises the constraint even where RLS deliberately forbids updates (stock ledger).
    await assert.rejects(db.query(`update ${child} set ${column}=$1 where id=$2`,[fixtures.B[parent].id,valid.id]),{code:'23503'});
    if(child!=='movimenti_magazzino') {
      await assert.rejects(asRole(db,'authenticated',tenant.users.dual,
        tx=>tx.query(`update ${child} set company_id=$1 where id=$2`,[tenant.companies.B,valid.id])),{code:'23503'});
    }
    const unchanged = (await db.query(`select ${column} from ${child} where id=$1`,[valid.id])).rows[0];
    assert.equal(unchanged[column],fixtures.A[parent].id);
    if(action==='null' || child==='prodotti') {
      await authenticated(tx=>insert(tx,child,{...copy(child),[column]:null}));
    } else {
      await assert.rejects(authenticated(tx=>insert(tx,child,{...copy(child),[column]:null})),{code:'23502'});
    }
    if(!action) {
      const referenced=copy(parent); await insert(db,parent,referenced);
      await insert(db,child,{...copy(child),[column]:referenced.id});
      await assert.rejects(authenticated(tx=>tx.query(`delete from ${parent} where id=$1`,[referenced.id])),{code:'23503'});
    }
  });
}

for (const [child,column,parent,action] of links.filter(l=>l[3]==='null')) {
  test(`${child}.${column}: deleting parent clears reference but keeps company`,async()=>{
    const parentRow = copy(parent); await insert(db,parent,parentRow);
    const childRow = {...copy(child),[column]:parentRow.id}; await insert(db,child,childRow);
    await authenticated(tx=>tx.query(`delete from ${parent} where id=$1`,[parentRow.id]));
    const saved = (await db.query(`select company_id,${column} from ${child} where id=$1`,[childRow.id])).rows[0];
    assert.equal(saved.company_id,tenant.companies.A); assert.equal(saved[column],null);
  });
}

test('a referenced parent cannot be reassigned to a different tenant',async()=>{
  await assert.rejects(db.query('update clienti set company_id=$1 where id=$2',[tenant.companies.B,fixtures.A.clienti.id]),{code:'23503'});
});
test('stock parent delete semantics are preserved: depot RESTRICT, product CASCADE',async()=>{
  const product=copy('prodotti'), depot=copy('depositi');
  await insert(db,'prodotti',product); await insert(db,'depositi',depot);
  const movement={...copy('movimenti_magazzino'),prodotto_id:product.id,deposito_id:depot.id};
  await insert(db,'movimenti_magazzino',movement);
  await assert.rejects(authenticated(tx=>tx.query('delete from depositi where id=$1',[depot.id])),
    error => ['23001','23503'].includes(error.code)); // RESTRICT SQLSTATE differs across PG versions.
  await authenticated(tx=>tx.query('delete from prodotti where id=$1',[product.id]));
  assert.equal((await db.query('select id from movimenti_magazzino where id=$1',[movement.id])).rows.length,0);
});

for(const table of tables) {
  test(`${table}: SQL RLS prevents tenant A from reading, inserting, updating or deleting B`,async()=>{
    const foreignRow=fixtures.B[table];
    for(const user of [tenant.users.admin,tenant.users.operator,tenant.users.viewer]) {
      const own=await asRole(db,'authenticated',user,tx=>tx.query(`select id from ${table} where id=$1`,[fixtures.A[table].id]));
      assert.equal(own.rows.length,1);
      const visible=await asRole(db,'authenticated',user,tx=>tx.query(`select id from ${table} where company_id=$1`,[tenant.companies.B]));
      assert.equal(visible.rows.length,0);
      await assert.rejects(asRole(db,'authenticated',user,tx=>insert(tx,table,copy(table,'B'))),{code:'42501'});
      const updated=await asRole(db,'authenticated',user,tx=>tx.query(`update ${table} set company_id=company_id where id=$1 returning id`,[foreignRow.id]));
      const deleted=await asRole(db,'authenticated',user,tx=>tx.query(`delete from ${table} where id=$1 returning id`,[foreignRow.id]));
      assert.equal(updated.rows.length,0); assert.equal(deleted.rows.length,0);
    }
  });
}

test('viewer is read-only; operator writes but cannot delete; admin may delete a free client',async()=>{
  const row=copy('clienti');
  await assert.rejects(asRole(db,'authenticated',tenant.users.viewer,tx=>insert(tx,'clienti',row)),{code:'42501'});
  await asRole(db,'authenticated',tenant.users.operator,tx=>insert(tx,'clienti',row));
  for(const [user,count] of [[tenant.users.viewer,0],[tenant.users.operator,1],[tenant.users.admin,1]]) {
    const result=await asRole(db,'authenticated',user,tx=>tx.query('update clienti set nome=$1 where id=$2 returning id',['Updated',row.id]));
    assert.equal(result.rows.length,count);
  }
  assert.equal((await asRole(db,'authenticated',tenant.users.operator,tx=>tx.query('delete from clienti where id=$1 returning id',[row.id]))).rows.length,0);
  assert.equal((await authenticated(tx=>tx.query('delete from clienti where id=$1 returning id',[row.id]))).rows.length,1);
});

test('all constraints validate after explicit repair of the synthetic legacy mismatch',async()=>{
  await db.query('update prodotti set fornitore_id=$1 where id=$2',[fixtures.A.fornitori.id,uuid(999)]);
  for(const [child,column] of links) await db.exec(`alter table ${child} validate constraint ${child}_${column}_tenant_fkey`);
  assert.equal((await db.query("select conname from pg_constraint where conname like '%_tenant_fkey' and not convalidated")).rows.length,0);
});

test('company cleanup still cascades consistently through the cyclic document graph',async()=>{
  await asRole(db,'service_role',null,tx=>tx.query('delete from companies where id=$1',[tenant.companies.B]));
  for(const table of tables) {
    assert.equal((await db.query(`select id from ${table} where company_id=$1`,[tenant.companies.B])).rows.length,0);
    assert.equal((await db.query(`select id from ${table} where id=$1`,[fixtures.A[table].id])).rows.length,1);
  }
});
