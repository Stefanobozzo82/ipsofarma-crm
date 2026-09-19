const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,seedTenants,asRole,uuid}=require('./helpers/database.cjs');
let db,users,companies,supplier,otherSupplier,seq=7000;
before(async()=>{db=await database(28);({users,companies}=await seedTenants(db));supplier=uuid(6900);otherSupplier=uuid(6901);await db.query('insert into fornitori(id,company_id,nome) values($1,$2,$3),($4,$5,$6)',[supplier,companies.A,'Supplier',otherSupplier,companies.B,'Other']);});
after(async()=>{if(db)await db.close();});
async function order(){return (await db.query('insert into ordini_fornitore(id,company_id,num,data,fornitore_id,righe,extra) values($1,$2,$3,$4,$5,$6,$7) returning *',[uuid(++seq),companies.A,'OF'+seq,'2026-09-19',supplier,JSON.stringify([{cod:'X',qty:5,qtyEv:1},{cod:'X',qty:7}]),JSON.stringify({ddtfId:'LEGACY',note:'keep'})])).rows[0];}
const document=(o,rows=[{cod:'X',qty:2,source_order_index:1}])=>({num:'SUP'+(++seq),data:'2026-09-19',fornitore_id:supplier,righe:rows});
async function create(o,doc=document(o),request=uuid(++seq),actor=users.admin){return (await asRole(db,'authenticated',actor,tx=>tx.query('select create_supplier_ddt($1,$2,$3,$4,$5) as result',[companies.A,o.id,request,JSON.stringify(o.righe),JSON.stringify(doc)]))).rows[0].result;}
const snap=d=>Object.fromEntries(['num','data','fornitore_id','of_id','righe','extra'].map(k=>[k,d[k]]));
async function change(d,action,doc={},request=uuid(++seq),actor=users.admin){return (await asRole(db,'authenticated',actor,tx=>tx.query('select change_supplier_ddt($1,$2,$3,$4,$5,$6,$7) as result',[companies.A,d.id,request,action,JSON.stringify(snap(d)),JSON.stringify(doc),'Test correction']))).rows[0].result;}
test('duplicate codes allocated once by source index, metadata preserved and replay no double receipt',async()=>{
  const o=await order(),doc=document(o),id=uuid(++seq);const result=await create(o,doc,id);
  assert.equal(result.ordine.righe[0].qtyEv,1);assert.equal(result.ordine.righe[1].qtyEv,2);
  assert.deepEqual(result.ordine.extra.ddtfIds,['LEGACY',doc.num]);assert.equal(result.ordine.extra.note,'keep');
  assert.equal((await create(o,doc,id)).replayed,true);
  await assert.rejects(create(o,{...doc,num:'different'},id),/dati diversi/);
  await assert.rejects(create(o,document(o)),/ordine modificato/);
});
test('ambiguous legacy code, overdelivery and unauthorized tenant/role fail before effects',async()=>{
  const o=await order();await assert.rejects(create(o,document(o,[{cod:'X',qty:1}])),/ambigua/);
  await assert.rejects(create(o,document(o,[{cod:'X',qty:4,source_order_index:1},{cod:'X',qty:4,source_order_index:1}])),/superiore/);
  await assert.rejects(create(o,document(o),uuid(++seq),users.viewer),/non autorizzata/);
  await assert.rejects(create(o,{...document(o),fornitore_id:otherSupplier}),/non corrispondente/);
  assert.equal((await db.query('select count(*)::int as n from ddt_fornitore where of_id=$1',[o.id])).rows[0].n,0);
});
test('receipt edits adjust delta and cancellation restores baseline without deleting document',async()=>{
  const o=await order(),created=await create(o),edited={...snap(created.ddt),righe:[{cod:'X',qty:4,source_order_index:1}]};
  const updated=await change(created.ddt,'update',edited);assert.equal(updated.ordine.righe[1].qtyEv,4);
  const request=uuid(++seq),cancelled=await change(updated.ddt,'cancel',{},request);assert.equal(cancelled.ordine.righe[0].qtyEv,1);assert.equal(cancelled.ordine.righe[1].qtyEv,0);assert.equal(cancelled.ddt.extra.annullato,true);
  assert.equal((await change(updated.ddt,'cancel',{},request)).replayed,true);
  assert.equal((await db.query('select count(*)::int as n from ddt_fornitore where id=$1',[created.ddt.id])).rows[0].n,1);
});
test('operator may receive but not cancel',async()=>{const o=await order(),created=await create(o,document(o),uuid(++seq),users.operator);await assert.rejects(change(created.ddt,'cancel',{},uuid(++seq),users.operator),/non autorizzata/);});
test('invoice linking is atomic, same tenant/supplier only and blocks later receipt changes',async()=>{
  const o=await order(),invoice=uuid(++seq);await db.query('insert into fatture_fornitore(id,company_id,num,data,fornitore_id,of_id) values($1,$2,$3,$4,$5,$6)',[invoice,companies.A,'INV'+seq,'2026-09-19',supplier,o.id]);
  const result=await create(o,{...document(o),fattura_id:invoice});assert.equal(result.fattura.ddtf_id,result.ddt.id);assert.equal(result.ddt.extra.ftfId,result.fattura.num);
  await assert.rejects(change(result.ddt,'cancel'),/fatturato/);
  const second=await order();await assert.rejects(create(second,{...document(second),fattura_id:invoice}),/fattura non disponibile/);
  assert.equal((await db.query('select count(*)::int as n from ddt_fornitore where of_id=$1',[second.id])).rows[0].n,0);
});
test('raw API cannot create linked receipt, edit quantities, delete receipt or restructure received order',async()=>{
  const o=await order(),created=await create(o);
  for(const sql of ["update ddt_fornitore set righe='[]' where id=$1",'delete from ddt_fornitore where id=$1'])await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query(sql,[created.ddt.id])),/tracciato|transazionale/);
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query("insert into ddt_fornitore(company_id,num,data,fornitore_id,of_id) values($1,'RAW','2026-09-19',$2,$3)",[companies.A,supplier,o.id])),/transazionale/);
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('update ordini_fornitore set righe=$1 where id=$2',[JSON.stringify([...created.ordine.righe].reverse()),o.id])),/ricezioni tracciate/);
  // Legacy invoice linkage remains compatible; no quantitative change permitted.
  await asRole(db,'authenticated',users.admin,tx=>tx.query("update ddt_fornitore set extra=extra||'{\"ftfId\":\"LINKED\"}'::jsonb where id=$1",[created.ddt.id]));
});
test('historical linked receipt has no guessed reversal',async()=>{
  const o=await order(),d=(await db.query('insert into ddt_fornitore(company_id,num,data,fornitore_id,of_id,righe) values($1,$2,$3,$4,$5,$6) returning to_jsonb(ddt_fornitore) as d',[companies.A,'HIST'+(++seq),'2026-09-19',supplier,o.id,JSON.stringify([{cod:'X',qty:1}])])).rows[0].d;
  await assert.rejects(change(d,'cancel'),/storico/);
});
test('failure after automatic numbering rolls back counter, receipt and operation ledger',async()=>{
  const o=await order(),request=uuid(++seq);
  const count=async table=>(await db.query(`select count(*)::int as n from ${table} where company_id=$1`,[companies.A])).rows[0].n;
  const before={ddt:await count('ddt_fornitore'),ledger:await count('supplier_ddt_operations')};
  const counters=(await db.query("select * from document_counters where company_id=$1 and doc_type='DDTF'",[companies.A])).rows;
  await assert.rejects(create(o,{...document(o),num:null,fattura_id:uuid(999999)},request),/fattura non disponibile/);
  assert.equal(await count('ddt_fornitore'),before.ddt);assert.equal(await count('supplier_ddt_operations'),before.ledger);
  assert.deepEqual((await db.query("select * from document_counters where company_id=$1 and doc_type='DDTF'",[companies.A])).rows,counters);
  assert.deepEqual((await db.query('select righe from ordini_fornitore where id=$1',[o.id])).rows[0].righe,o.righe);
});
