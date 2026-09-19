const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { database, seedTenants, asRole, uuid } = require('./helpers/database.cjs');
let db, users, companies, serial=3000;
const customerA=uuid(30),customerB=uuid(31),customerOther=uuid(32);
const baseRows=()=>[{cod:'P',descr:'First',qty:10,qtyEv:2,prezzo:4,iva:22},{cod:'P',descr:'Second',qty:10,prezzo:7,iva:22}];
before(async()=>{
  db=await database(19); ({users,companies}=await seedTenants(db));
  for(const [id,company] of [[customerA,companies.A],[customerB,companies.B],[customerOther,companies.A]]) {
    await db.query('insert into clienti(id,company_id,nome) values($1,$2,$3)',[id,company,'Synthetic customer']);
  }
});
after(async()=>{if(db)await db.close();});

async function order(rows=baseRows(),company=companies.A,customer=customerA) {
  const id=uuid(++serial);
  const saved=(await db.query(`insert into ordini_cliente(id,company_id,num,data,cliente_id,righe,extra)
    values($1,$2,$3,'2025-12-31',$4,$5,$6) returning *`,[id,company,'OC-'+serial,customer,JSON.stringify(rows),JSON.stringify({historic:'keep',ddtIds:['LEGACY/1'],ddtId:'LEGACY/1'})])).rows[0];
  return saved;
}
function request(source,rows=[{cod:'P',qty:3,source_order_index:0}],overrides={}) {
  return {company:source.company_id,orderId:source.id,requestId:uuid(++serial),expected:source.righe,
    document:{data:'2026-09-19',cliente_id:source.cliente_id,dest_id:null,righe:rows},...overrides};
}
async function call(r,user=users.admin,role='authenticated') {
  return asRole(db,role,user,async tx=>(await tx.query(
    'select public.create_customer_ddt($1,$2,$3,$4::jsonb,$5::jsonb) as result',
    [r.company,r.orderId,r.requestId,JSON.stringify(r.expected),JSON.stringify(r.document)]
  )).rows[0].result);
}
async function state(id) {
  return {
    order:(await db.query('select righe,extra from ordini_cliente where id=$1',[id])).rows[0],
    ddts:(await db.query('select id from ddt where oc_id=$1',[id])).rows,
    counters:(await db.query('select * from document_counters order by company_id,doc_type,anno')).rows,
    operations:(await db.query('select count(*)::int as n from customer_ddt_operations')).rows[0].n,
  };
}

test('partial delivery assigns duplicated product codes to individual source rows and preserves history',async()=>{
  const source=await order();
  const result=await call(request(source,[{cod:'P',qty:3,source_order_index:1}]));
  assert.equal(result.ordine.righe[0].qtyEv,2); assert.equal(result.ordine.righe[1].qtyEv,3);
  assert.equal(result.ordine.extra.historic,'keep');
  assert.deepEqual(result.ordine.extra.ddtIds,['LEGACY/1',result.ddt.num]);
  assert.equal(result.ordine.extra.ddtId,result.ddt.num);
  assert.equal(result.ddt.oc_id,source.id); assert.equal(result.ddt.company_id,companies.A);
  assert.match(result.ddt.num,/^DDT\/2026\//); // DDT date, not the 2025 order date.
  assert.equal(result.replayed,false);
});
test('same request retries once, including after another delivery changed the order',async()=>{
  const source=await order(); const r=request(source);
  const first=await call(r); const afterFirst=await state(source.id);
  const replay=await call(r);
  assert.equal(replay.ddt.id,first.ddt.id); assert.equal(replay.replayed,true);
  assert.deepEqual(await state(source.id),afterFirst);
  const updated={...source,righe:first.ordine.righe};
  await call(request(updated,[{cod:'P',qty:1,source_order_index:1}]));
  const afterSecond=await state(source.id);
  assert.equal((await call(r)).ddt.id,first.ddt.id);
  assert.deepEqual(await state(source.id),afterSecond);
});
test('reusing a key with a changed payload or another actor fails without effects',async()=>{
  const source=await order(),r=request(source);await call(r);
  const saved=await state(source.id);
  await assert.rejects(call({...r,document:{...r.document,data:'2026-09-20'}}));
  await assert.rejects(call(r,users.operator));
  assert.deepEqual(await state(source.id),saved);
});
test('a distinct request against stale expected rows fails (serialized conflict test)',async()=>{
  const source=await order(),r=request(source);await call(r);
  const saved=await state(source.id);
  await assert.rejects(call({...r,requestId:uuid(++serial)}));
  assert.deepEqual(await state(source.id),saved);
});
test('lot splits aggregate per source row and cannot overdeliver',async()=>{
  const source=await order();
  const rows=[{cod:'P',qty:3,source_order_index:0,lotto:'L1'},{cod:'P',qty:5,source_order_index:0,lotto:'L2'}];
  const saved=await call(request(source,rows));
  assert.equal(saved.ordine.righe[0].qtyEv,10);assert.equal(saved.ordine.righe[1].qtyEv,undefined);
  const before=await state(source.id);
  await assert.rejects(call(request({...source,righe:saved.ordine.righe},[{cod:'P',qty:1,source_order_index:0}])));
  assert.deepEqual(await state(source.id),before);
});
test('unique legacy code fallback works; duplicate unreferenced rows are rejected',async()=>{
  const unique=await order([{cod:'UNIQUE',qty:5,qtyEv:1,descr:'Legacy'}]);
  assert.equal((await call(request(unique,[{cod:'UNIQUE',qty:2}]))).ordine.righe[0].qtyEv,3);
  const duplicated=await order(),before=await state(duplicated.id);
  await assert.rejects(call(request(duplicated,[{cod:'P',qty:2}])));
  assert.deepEqual(await state(duplicated.id),before);
});
test('singular legacy DDT links survive missing/null arrays without rewriting unrelated metadata',async()=>{
  for(const extra of [{ddtId:'OLD-SINGLE',historic:1},{ddtId:'OLD-SINGLE',ddtIds:null,historic:2},
    {ddtId:'OLD-SINGLE',ddtIds:['OLDER'],historic:3}]) {
    const source=await order();
    await db.query('update ordini_cliente set extra=$1 where id=$2',[JSON.stringify(extra),source.id]);
    const result=await call(request(source));
    assert.deepEqual(result.ordine.extra.ddtIds,[...(extra.ddtIds||[]),'OLD-SINGLE',result.ddt.num]);
    assert.equal(result.ordine.extra.historic,extra.historic);
  }
});
for(const [label,rows] of [
  ['zero',[{cod:'P',qty:0,source_order_index:0}]],['negative',[{cod:'P',qty:-1,source_order_index:0}]],
  ['string quantity',[{cod:'P',qty:'3',source_order_index:0}]],['NaN',[{cod:'P',qty:'NaN',source_order_index:0}]],
  ['unknown code',[{cod:'OTHER',qty:1,source_order_index:0}]],['bad index',[{cod:'P',qty:1,source_order_index:99}]],
  ['fractional index',[{cod:'P',qty:1,source_order_index:0.5}]],['overdelivery',[{cod:'P',qty:9,source_order_index:0}]],
  ['empty',[]],
])test(`invalid ${label} leaves order, document, counter and operation unchanged`,async()=>{
  const source=await order(),before=await state(source.id);
  await assert.rejects(call(request(source,rows)));
  assert.deepEqual(await state(source.id),before);
});
test('only own tenant operators/admins may create; customer must match order',async()=>{
  const source=await order(),r=request(source),before=await state(source.id);
  for(const [user,role] of [[users.viewer,'authenticated'],[users.otherAdmin,'authenticated'],[null,'anon'],[null,'authenticated']]) {
    await assert.rejects(call(r,user,role));
  }
  for(const customer of [customerB,customerOther])await assert.rejects(call({...r,document:{...r.document,cliente_id:customer}}));
  await assert.rejects(call({...r,company:companies.B}));
  assert.deepEqual(await state(source.id),before);
  assert.equal((await call(r,users.operator)).ddt.company_id,companies.A);
});
test('client cannot edit the operation ledger or invoke as anonymous',async()=>{
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.exec('delete from customer_ddt_operations')),{code:'42501'});
  assert.equal((await db.query("select has_function_privilege('anon','public.create_customer_ddt(uuid,uuid,uuid,jsonb,jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
});
test('manual number is atomic, duplicate failure rolls back, automatic numbering exceeds 9999',async()=>{
  const source=await order(),r=request(source);
  r.document.num='DDT/2026/15000'; const first=await call(r);
  assert.equal(first.ddt.num,'DDT/2026/15000');
  const secondSource=await order(),second=request(secondSource);second.document.num=r.document.num;
  const before=await state(secondSource.id);
  await assert.rejects(call(second)); assert.deepEqual(await state(secondSource.id),before);
  const next=await call({...second,requestId:uuid(++serial),document:{...second.document,num:null}});
  assert.equal(next.ddt.num,'DDT/2026/15001');
});
test('shared counter preserves sequential document numbers across 9999',async()=>{
  await db.query("insert into document_counters(company_id,doc_type,anno,next_value) values($1,'FT',2026,9999)",[companies.A]);
  const next=()=>asRole(db,'authenticated',users.admin,async tx=>(await tx.query(
    "select next_document_number($1,'FT',2026) as num",[companies.A])).rows[0].num);
  assert.equal(await next(),'FT/2026/9999');
  assert.equal(await next(),'FT/2026/10000');
});
for(const [label,table,operation] of [['document insert','ddt','insert'],['order update','ordini_cliente','update'],['operation persistence','customer_ddt_operations','insert']]) {
  test(`injected failure at ${label} rolls back the entire transaction`,async()=>{
    const source=await order(),r=request(source),before=await state(source.id);
    await db.exec(`create function test_reject_ddt_write() returns trigger language plpgsql as $$ begin raise exception 'injected failure'; end $$;
      create trigger test_reject_write before ${operation} on ${table} for each row execute function test_reject_ddt_write();`);
    try {await assert.rejects(call(r),/injected failure/);assert.deepEqual(await state(source.id),before);}
    finally {await db.exec(`drop trigger test_reject_write on ${table}; drop function test_reject_ddt_write();`);}
    assert.equal((await call(r)).replayed,false,'same key can retry after rollback');
  });
}
