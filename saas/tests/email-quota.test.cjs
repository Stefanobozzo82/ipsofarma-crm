// 0046: limite di 100 email al giorno per azienda (reserve_email_send).
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,seedTenants,asRole}=require('./helpers/database.cjs');
let db,users,companies;
before(async()=>{db=await database(46);({users,companies}=await seedTenants(db));});
after(async()=>{if(db)await db.close();});
const reserve=(user,company=companies.A)=>asRole(db,'authenticated',user,tx=>tx.query('select reserve_email_send($1) as r',[company])).then(x=>x.rows[0].r);
const oggi="(now() at time zone 'Europe/Rome')::date";

test('only admins and operators of the company may reserve; usage is not writable directly',async()=>{
  assert.equal((await reserve(users.viewer)).reason,'forbidden');
  assert.equal((await reserve(users.otherAdmin)).reason,'forbidden');
  assert.equal((await reserve(null)).reason,'forbidden');
  await assert.rejects(asRole(db,'anon',null,tx=>tx.query('select reserve_email_send($1)',[companies.A])),e=>e.code==='42501');
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('insert into email_daily_usage(company_id,giorno) values($1,current_date)',[companies.A])),e=>e.code==='42501');
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('select * from email_daily_usage')),e=>e.code==='42501');
  assert.equal((await reserve(users.operator)).allowed,true);
});

test('a burst never exceeds 100 per company per day; other companies and other days are separate',async()=>{
  await db.query(`update email_daily_usage set inviate=90 where company_id=$1 and giorno=${oggi}`,[companies.A]);
  const results=await Promise.all(Array.from({length:25},()=>reserve(users.admin)));
  assert.equal(results.filter(r=>r.allowed).length,10);
  assert.ok(results.filter(r=>!r.allowed).every(r=>r.reason==='quota'&&r.limit===100));
  assert.equal((await db.query(`select inviate from email_daily_usage where company_id=$1 and giorno=${oggi}`,[companies.A])).rows[0].inviate,100);
  assert.equal((await reserve(users.otherAdmin,companies.B)).allowed,true);
  await db.query(`update email_daily_usage set giorno=giorno-1 where company_id=$1`,[companies.A]);
  const r=await reserve(users.admin);
  assert.equal(r.allowed,true);assert.equal(r.used,1);
});
