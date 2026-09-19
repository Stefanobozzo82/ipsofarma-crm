const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,seedTenants,asRole,uuid}=require('./helpers/database.cjs');
let db,users,companies,serial=12000;
const customer=uuid(901),otherCustomer=uuid(902);
const next=()=>uuid(++serial);
const json=JSON.stringify;
before(async()=>{
  db=await database(21);({users,companies}=await seedTenants(db));
  for(const [id,company] of [[customer,companies.A],[otherCustomer,companies.B]])
    await db.query('insert into clienti(id,company_id,nome) values($1,$2,$3)',[id,company,'Synthetic']);
});
after(async()=>{if(db)await db.close();});
const base=()=>[{cod:'P',qty:10,qtyEv:2,custom:'historic'}, {cod:'P',qty:10,qtyEv:1}];
const line=(index,qty,lotto='L1')=>({cod:'P',source_order_index:index,qty,lotto});
async function setup(rows=[line(0,3),line(1,2)]) {
  const order=(await db.query("insert into ordini_cliente(id,company_id,num,data,cliente_id,righe,extra) values($1,$2,$3,'2026-09-19',$4,$5,$6) returning *",
    [next(),companies.A,'OC-'+serial,customer,json(base()),json({historic:'keep',ddtIds:['LEGACY']})])).rows[0];
  const result=await asRole(db,'authenticated',users.admin,async tx=>(await tx.query('select create_customer_ddt($1,$2,$3,$4::jsonb,$5::jsonb) as result',
    [companies.A,order.id,next(),json(order.righe),json({data:'2026-09-19',cliente_id:customer,righe:rows})])).rows[0].result);
  return result;
}
function snapshot(ddt) {
  const result=Object.fromEntries(['num','data','cliente_id','oc_id','dest_id','righe','extra'].map(k=>[k,ddt[k]]));
  if(result.data instanceof Date) result.data=result.data.toISOString().slice(0,10);
  return result;
}
function request(result,action='update',rows=[line(0,1),line(1,1)]) {
  const expected=snapshot(result.ddt);
  return {company:companies.A,id:result.ddt.id,key:next(),action,expected,
    document:action==='cancel'?{}:{...expected,righe:rows},reason:action==='cancel'?'Errore di consegna':'Correzione quantità'};
}
async function call(r,user=users.admin,role='authenticated') {
  return asRole(db,role,user,async tx=>(await tx.query('select change_customer_ddt($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) as result',
    [r.company,r.id,r.key,r.action,json(r.expected),json(r.document),r.reason])).rows[0].result);
}
async function state(result) {
  return {ddt:(await db.query('select * from ddt where id=$1',[result.ddt.id])).rows[0],
    order:(await db.query('select * from ordini_cliente where id=$1',[result.ordine.id])).rows[0],
    changes:(await db.query('select * from customer_ddt_changes where ddt_id=$1 order by id',[result.ddt.id])).rows};
}

test('tracked creation, partial correction and cancellation compensate only proven quantities and retain legacy history',async()=>{
  const created=await setup();
  assert.deepEqual(created.ordine.righe.map(r=>r.qtyEv),[5,3]);
  const updated=await call(request(created));
  assert.deepEqual(updated.ordine.righe.map(r=>r.qtyEv),[3,2]);
  const canceled=await call(request(updated,'cancel'));
  assert.deepEqual(canceled.ordine.righe.map(r=>r.qtyEv),[2,1]);
  assert.equal(canceled.ordine.righe[0].custom,'historic');assert.equal(canceled.ordine.extra.historic,'keep');
  assert.equal(canceled.ddt.extra.annullato,true);assert.equal(canceled.ddt.extra.motivo_annullamento,'Errore di consegna');
  assert.equal((await state(created)).changes.length,2);
  assert.deepEqual(canceled.ordine.extra.ddtIds,['LEGACY',created.ddt.num]);
});

test('duplicate codes and split lots aggregate per source index, including moving quantities between rows',async()=>{
  const created=await setup([line(0,2,'L1'),line(0,1,'L2'),line(1,2,'L3')]);
  const updated=await call(request(created,'update',[line(0,1,'L1'),line(1,2,'L2'),line(1,2,'L3')]));
  assert.deepEqual(updated.ordine.righe.map(r=>r.qtyEv),[3,5]);
  assert.deepEqual((await call(request(updated,'cancel'))).ordine.righe.map(r=>r.qtyEv),[2,1]);
});

test('identical retry replays even after cancellation; changed payload or actor cannot reuse request key',async()=>{
  const created=await setup(),r=request(created),updated=await call(r);
  await call(request(updated,'cancel'));const before=await state(created);
  const replay=await call(r);assert.equal(replay.replayed,true);assert.equal(replay.ddt.id,created.ddt.id);
  await assert.rejects(call({...r,reason:'Different'}));await assert.rejects(call(r,users.operator));
  assert.deepEqual(await state(created),before);
});

test('stale expected snapshot and a fresh second cancellation cannot change quantities twice',async()=>{
  const created=await setup(),r=request(created);const updated=await call(r);const before=await state(created);
  await assert.rejects(call({...r,key:next()}),/DDT modificato/);assert.deepEqual(await state(created),before);
  const canceled=await call(request(updated,'cancel'));const final=await state(created);
  await assert.rejects(call(request(canceled,'cancel')),/già annullato/);assert.deepEqual(await state(created),final);
});

test('viewer, unrelated member and anonymous are rejected; operator may update but cannot cancel',async()=>{
  const created=await setup(),r=request(created),before=await state(created);
  for(const [user,role] of [[users.viewer,'authenticated'],[users.otherAdmin,'authenticated'],[null,'authenticated'],[null,'anon']])
    await assert.rejects(call(r,user,role));
  await assert.rejects(call({...r,company:companies.B}));
  await assert.rejects(call(request(created,'cancel'),users.operator));assert.deepEqual(await state(created),before);
  assert.equal((await call(r,users.operator)).ddt.id,created.ddt.id);
});

for(const via of ['extra','invoice']) test(`invoiced DDT via ${via} refuses update and cancellation`,async()=>{
  const created=await setup();
  if(via==='extra') await db.query("update ddt set extra=extra||'{\"ftId\":\"FT-1\"}'::jsonb where id=$1",[created.ddt.id]);
  else await db.query("insert into fatture_cliente(company_id,num,data,cliente_id,ddt_id) values($1,$2,'2026-09-19',$3,$4)",[companies.A,'FT-'+serial,customer,created.ddt.id]);
  const fresh=await state(created);created.ddt=fresh.ddt;
  for(const action of ['update','cancel'])await assert.rejects(call(request(created,action)),/fatturato/);
  assert.deepEqual(await state(created),fresh);
});

test('linked historical DDT without a creation record is never guessed from product codes',async()=>{
  const created=await setup();const legacy=(await db.query("insert into ddt(company_id,num,data,cliente_id,oc_id,righe) values($1,$2,'2026-09-19',$3,$4,$5) returning *",
    [companies.A,'LEGACY-'+serial,customer,created.ordine.id,json([line(0,1)])])).rows[0];
  const source={...created,ddt:legacy},before=await state(source);
  for(const action of ['update','cancel'])await assert.rejects(call(request(source,action)),/storico/);
  assert.deepEqual(await state(source),before);
});

test('out-of-band row tampering refuses correction instead of guessing its contribution',async()=>{
  const created=await setup();await db.query('update ddt set righe=$1 where id=$2',[json([line(0,1)]),created.ddt.id]);
  created.ddt=(await state(created)).ddt;const before=await state(created);
  await assert.rejects(call(request(created,'cancel')),/alterato fuori/);assert.deepEqual(await state(created),before);
});

for(const [name,rows] of [['overdelivery',[line(0,99)]],['zero',[line(0,0)]],['negative',[line(0,-1)]],
  ['missing source',[{cod:'P',qty:1}]],['wrong source',[line(99,1)]],['fractional source',[line(0.5,1)]],['empty',[]]]) {
  test(`invalid correction ${name} leaves DDT, order and audit unchanged`,async()=>{
    const created=await setup(),before=await state(created);
    await assert.rejects(call(request(created,'update',rows)));assert.deepEqual(await state(created),before);
  });
}

test('direct writes cannot bypass correction or remove audit evidence',async()=>{
  const created=await setup(),before=await state(created);
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('update ddt set righe=$1 where id=$2',[json([line(0,1)]),created.ddt.id])),/rettifica transazionale/);
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('delete from ddt where id=$1',[created.ddt.id])),/annullamento tracciato/);
  for(const sql of ['select * from customer_ddt_changes','delete from customer_ddt_changes'])
    await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.exec(sql)),{code:'42501'});
  assert.deepEqual(await state(created),before);
});

for(const action of ['update','cancel']) for(const table of ['ordini_cliente','ddt','customer_ddt_changes']) test(`injected ${table} failure rolls back ${action} and audit together`,async()=>{
  const created=await setup(),before=await state(created);
  await db.exec(`create function fail_lifecycle_test() returns trigger language plpgsql as $$begin raise exception 'injected lifecycle failure';end;$$;
    create trigger fail_lifecycle_test before ${table==='customer_ddt_changes'?'insert':'update'} on ${table} for each row execute function fail_lifecycle_test();`);
  try {await assert.rejects(call(request(created,action)),/injected lifecycle failure/);assert.deepEqual(await state(created),before);}
  finally {await db.exec(`drop trigger fail_lifecycle_test on ${table};drop function fail_lifecycle_test();`);}
});

test('issued identity and metadata are immutable and cancellation requires a reason',async()=>{
  const created=await setup(),r=request(created),before=await state(created);
  for(const patch of [{num:'CHANGED'},{cliente_id:otherCustomer},{oc_id:null},{extra:{invented:true}}])
    await assert.rejects(call({...r,key:next(),document:{...r.document,...patch}}),/non sono modificabili/);
  await assert.rejects(call({...request(created,'cancel'),reason:' '}),/motivo/);
  assert.deepEqual(await state(created),before);
});

test('standalone DDT lifecycle retains document and audits cancellation without touching any order',async()=>{
  const existing=await setup();const before=(await state(existing)).order;
  const ddt=(await db.query("insert into ddt(company_id,num,data,cliente_id,righe) values($1,$2,'2026-09-19',$3,$4) returning *",
    [companies.A,'STANDALONE-'+serial,customer,json([{cod:'FREE',qty:2}])])).rows[0];
  const updated=await call(request({ddt},'update',[{cod:'FREE',qty:1}]));
  assert.equal(updated.ordine,null);assert.equal(updated.ddt.righe[0].qty,1);
  const canceled=await call(request(updated,'cancel'));
  assert.equal(canceled.ordine,null);assert.equal(canceled.ddt.extra.annullato,true);
  assert.deepEqual((await state(existing)).order,before);
});
