const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,seedTenants,asRole,uuid}=require('./helpers/database.cjs');
let db,users,companies,sequence=800;
before(async()=>{db=await database(23);({users,companies}=await seedTenants(db));await db.exec("update plans set limite_ai_mese=3 where id='trial'");});
after(async()=>{if(db)await db.close();});
const reserve=(request=uuid(++sequence),actor=users.admin,hash='a'.repeat(64),company=companies.A)=>asRole(db,'service_role',null,tx=>tx.query('select reserve_ai_attempt($1,$2,$3,$4,$5) as result',[company,actor,request,hash,'gemini-2.5-flash'])).then(r=>r.rows[0].result);
test('atomic AI admission, replay, failure charging and historical use',async t=>{
  await t.test('members and service cannot write usage directly; only service may reserve',async()=>{
    for(const role of ['anon','authenticated','service_role'])await assert.rejects(asRole(db,role,users.admin,tx=>tx.query('insert into ai_usage(company_id) values($1)',[companies.A])),e=>e.code==='42501');
    await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('select reserve_ai_attempt($1,$2,$3,$4,$5)',[companies.A,users.admin,uuid(799),'a'.repeat(64),'gemini-2.5-flash'])),e=>e.code==='42501');
  });
  await t.test('wrong tenant membership and missing plan fail closed',async()=>{
    assert.equal((await reserve(uuid(++sequence),users.otherAdmin)).reason,'forbidden');
    await db.exec("delete from plans where id='pro'");await db.query("update companies set piano='pro' where id=$1",[companies.B]);
    assert.equal((await reserve(uuid(++sequence),users.otherAdmin,'a'.repeat(64),companies.B)).reason,'unavailable');
  });
  const request=uuid(++sequence);
  await t.test('same request reserved once and mismatched payload rejected',async()=>{
    assert.equal((await reserve(request)).reserved,true);assert.equal((await reserve(request)).reserved,false);
    assert.equal((await reserve(request,users.admin,'b'.repeat(64))).reason,'conflict');
    assert.equal((await reserve(request,users.operator)).reason,'conflict');
  });
  await t.test('provider failure consumes attempt and is terminal',async()=>{
    await asRole(db,'service_role',null,tx=>tx.query('select finish_ai_attempt($1,$2,$3,$4,$5)',[companies.A,users.admin,request,'failed',500]));
    assert.equal((await reserve(request)).status,'failed');
    await assert.rejects(asRole(db,'service_role',null,tx=>tx.query('select finish_ai_attempt($1,$2,$3,$4,$5)',[companies.A,users.admin,request,'succeeded',200])),/already recorded/);
  });
  await t.test('historical monthly rows count; previous month does not; burst cannot exceed limit',async()=>{
    await db.query("insert into ai_usage(company_id,created_at) values($1,now()),($1,date_trunc('month',now())-interval '1 day')",[companies.A]);
    const admissions=await Promise.all(Array.from({length:8},()=>reserve()));
    assert.equal(admissions.filter(r=>r.reserved).length,1);assert.equal(admissions.filter(r=>r.reason==='quota').length,7);
    const count=await asRole(db,'authenticated',users.admin,tx=>tx.query('select count_ai_usage_this_month($1) as n',[companies.A]));assert.equal(count.rows[0].n,3);
  });
  await t.test('metadata ledger contains no prompt or provider response columns',async()=>{
    const columns=await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='ai_usage'");
    assert.ok(!columns.rows.some(r=>/prompt|response|messages|content/.test(r.column_name)));
  });
});
