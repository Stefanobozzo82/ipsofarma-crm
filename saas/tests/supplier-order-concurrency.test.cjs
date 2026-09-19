const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { database, seedTenants, asRole, uuid } = require('./helpers/database.cjs');
let db, users, companies, clientA, clientB, sequence=400;
before(async()=>{
  db=await database(34); ({users,companies}=await seedTenants(db));
  clientA=uuid(301); clientB=uuid(302);
  await db.query('insert into fornitori(id,company_id,nome) values($1,$2,$3),($4,$5,$6)',[clientA,companies.A,'Client A',clientB,companies.B,'Client B']);
});
after(async()=>{if(db)await db.close();});
const snapshot=o=>({...structuredClone(Object.fromEntries(['num','data','fornitore_id','ftf_ids','righe','extra'].map(k=>[k,o[k]]))),data:o.data instanceof Date?o.data.toISOString().slice(0,10):o.data});
const edit=o=>({...snapshot(o),righe:o.righe.map((r,i)=>({...r,source_order_index:i}))});
async function order(righe=[{cod:'X',qty:5,qtyEv:2,line_id:'legacy-a',custom:'keep'},{cod:'X',qty:7,qtyEv:0}],extra={note:'keep',ddtfId:'OLD-DDT'}){
  const id=uuid(++sequence);
  return (await db.query('insert into ordini_fornitore(id,company_id,num,data,fornitore_id,righe,extra) values($1,$2,$3,$4,$5,$6,$7) returning *',[id,companies.A,`OF/2026/${sequence}`,'2026-09-19',clientA,JSON.stringify(righe),JSON.stringify(extra)])).rows[0];
}
async function save(o,document=edit(o),user=users.admin,expected=snapshot(o)){
  return (await asRole(db,'authenticated',user,tx=>tx.query('select update_supplier_order($1,$2,$3,$4) as result',[companies.A,o.id,JSON.stringify(expected),JSON.stringify(document)]))).rows[0].result;
}
async function deliver(o){
  const document={data:'2026-09-19',fornitore_id:clientA,righe:[{cod:'X',qty:1,source_order_index:0}]};
  return (await asRole(db,'authenticated',users.admin,tx=>tx.query('select create_supplier_ddt($1,$2,$3,$4,$5) as result',[companies.A,o.id,uuid(++sequence),JSON.stringify(o.righe),JSON.stringify(document)]))).rows[0].result.ordine;
}
test('CAS detects a stale editor after another edit and keeps successful changes',async()=>{
  const o=await order(),doc=edit(o);doc.extra.note='first';await save(o,doc);
  await assert.rejects(save(o),/ordine modificato/);
  assert.equal((await db.query('select extra from ordini_fornitore where id=$1',[o.id])).rows[0].extra.note,'first');
});
test('CAS detects fulfillment changed by atomic DDT and never resets qtyEv',async()=>{
  const o=await order();await deliver(o);await assert.rejects(save(o),/ordine modificato/);
  assert.equal((await db.query('select righe from ordini_fornitore where id=$1',[o.id])).rows[0].righe[0].qtyEv,3);
});
test('duplicate codes retain individual fulfillment, metadata and identity by original index',async()=>{
  const o=await order(),doc=edit(o);doc.righe.reverse();delete doc.righe[1].custom;delete doc.righe[1].qtyEv;
  const saved=await save(o,doc);
  assert.equal(saved.righe[0].qtyEv,0);assert.equal(saved.righe[1].qtyEv,2);
  assert.equal(saved.righe[1].custom,'keep');assert.equal(saved.righe[1].line_id,'legacy-a');
  assert.ok(saved.righe.every(r=>!('source_order_index'in r)));
});
for(const [name,change,pattern] of [
  ['increase qtyEv',d=>d.righe[0].qtyEv=3,/quantità ricevuta/],
  ['decrease qtyEv',d=>d.righe[0].qtyEv=1,/quantità ricevuta/],
  ['remove delivered row',d=>d.righe.shift(),/non può essere rimossa/],
  ['change delivered code',d=>d.righe[0].cod='Y',/non può cambiare codice/],
  ['reduce ordered quantity below delivered',d=>d.righe[0].qty=1,/scendere sotto/],
  ['duplicate source index',d=>d.righe[1].source_order_index=0,/più volte/],
  ['out of range source index',d=>d.righe[1].source_order_index=22,/riferimento/],
  ['change stable line identity',d=>d.righe[0].line_id='fake',/identità/],
  ['forge linked document',d=>d.extra={ddtfId:'fake'},/collegamenti/],
])test(`RPC rejects ${name}`,async()=>{const o=await order(),d=edit(o);change(d);await assert.rejects(save(o,d),pattern);});
test('new zero-delivery rows allowed; new delivered rows rejected',async()=>{
  const o=await order(),d=edit(o);d.righe.push({cod:'NEW',qty:4});const saved=await save(o,d);assert.equal(saved.righe.length,3);
  const bad=edit(saved);bad.righe.push({cod:'BAD',qty:2,qtyEv:1});await assert.rejects(save(saved,bad),/già ricevuta/);
});
test('RPC merges omitted extra metadata and preserves document links',async()=>{
  const o=await order(),d=edit(o);d.extra={business:'new'};const saved=await save(o,d);
  assert.deepEqual(saved.extra,{note:'keep',ddtfId:'OLD-DDT',business:'new'});
});
test('manual renumber bumps counter transactionally',async()=>{
  const o=await order(),d=edit(o);d.num='OF/2035/12000';const saved=await save(o,d);assert.equal(saved.num,d.num);
  assert.equal((await db.query("select next_value from document_counters where company_id=$1 and doc_type='OF' and anno=2035",[companies.A])).rows[0].next_value,12001);
});

test('invoice links are immutable and included in stale snapshot comparison',async()=>{
  const o=await order(),d=edit(o);d.ftf_ids=['fake'];await assert.rejects(save(o,d),/collegamenti alle fatture/);
  await db.query('update ordini_fornitore set ftf_ids=$1 where id=$2',[JSON.stringify(['legacy-invoice']),o.id]);
  await assert.rejects(save(o),/ordine modificato/);
  const fresh=(await db.query('select * from ordini_fornitore where id=$1',[o.id])).rows[0];
  const saved=await save(fresh);assert.deepEqual(saved.ftf_ids,['legacy-invoice']);
});

test('failed write rolls numbering back atomically',async()=>{
  const first=await order(),second=await order();
  await db.query('update ordini_fornitore set num=$1 where id=$2',['OF/2040/9999',first.id]);
  const d=edit(second);d.num='OF/2040/9999';await assert.rejects(save(second,d),/duplicate key/);
  assert.equal((await db.query("select count(*)::int n from document_counters where company_id=$1 and doc_type='OF' and anno=2040",[companies.A])).rows[0].n,0);
});
test('viewer and other tenant cannot update; operator can edit own order',async()=>{
  const o=await order();for(const user of [users.viewer,users.otherAdmin])await assert.rejects(save(o,edit(o),user),/non autorizzata/);
  assert.equal((await save(o,edit(o),users.operator)).id,o.id);
});
test('cross-tenant client rejected',async()=>{
  const o=await order(),d=edit(o);d.fornitore_id=clientB;await assert.rejects(save(o,d),/fornitore non disponibile/);
});
test('tracked DDT freezes array structure but allows safe field edits',async()=>{
  const tracked=await deliver(await order());
  for(const change of [d=>d.righe.reverse(),d=>d.righe.pop(),d=>d.righe.push({cod:'N',qty:1})]){
    const d=edit(tracked);change(d);await assert.rejects(save(tracked,d),/DDT collegati/);
  }
  const d=edit(tracked);d.righe[0].descr='Edited';d.righe[0].prezzo=99;d.righe[0].qty=8;
  const saved=await save(tracked,d);assert.equal(saved.righe[0].qtyEv,3);assert.equal(saved.righe[0].prezzo,99);
});
test('tracked row code remains frozen even when cancellation resets delivery to zero',async()=>{
  const tracked=await deliver(await order([{cod:'X',qty:5}]));
  const rows=tracked.righe.map(r=>({...r,qtyEv:0}));
  await asRole(db,'service_role',null,tx=>tx.query('update ordini_fornitore set righe=$1 where id=$2',[JSON.stringify(rows),tracked.id]));
  const reset={...tracked,righe:rows},doc=edit(reset);doc.righe[0].cod='OTHER';
  await assert.rejects(save(reset,doc),/non può cambiare codice/);
});
