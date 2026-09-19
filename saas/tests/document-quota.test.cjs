const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,migrate,seedTenants,asRole,uuid}=require('./helpers/database.cjs');
let db,users,companies,serial=40000;
const tables=['preventivi','ordini_cliente','ordini_fornitore','ddt','fatture_cliente','fatture_fornitore','note_credito','note_credito_fornitore','ddt_fornitore'];
const next=()=>uuid(++serial);
before(async()=>{db=await database(26);({users,companies}=await seedTenants(db));await migrate(db,27,27);});
after(async()=>{if(db)await db.close();});
async function fixture(limit=50){
  await db.query("update plans set limite_documenti_mese=$1 where id='trial'",[limit]);
  const company=next(),customer=next(),supplier=next();
  await db.query("insert into companies(id,nome,slug) values($1,'Quota test',$2)",[company,'quota-'+serial]);
  for(const [user,role] of [[users.admin,'admin'],[users.operator,'operatore'],[users.viewer,'viewer']])
    await db.query('insert into memberships(company_id,user_id,role) values($1,$2,$3)',[company,user,role]);
  await db.query("insert into clienti(id,company_id,nome) values($1,$2,'Customer')",[customer,company]);
  await db.query("insert into fornitori(id,company_id,nome) values($1,$2,'Supplier')",[supplier,company]);
  return {company,customer,supplier};
}
function document(table,f,extra={}){return {id:next(),company_id:f.company,num:'DOC-'+serial,data:'2026-09-19',
  [table.includes('fornitore')?'fornitore_id':'cliente_id']:table.includes('fornitore')?f.supplier:f.customer,...extra};}
async function insert(table,row,user=users.admin,role='authenticated',suffix=''){
  const columns=Object.keys(row);
  const sql=`insert into ${table}(${columns.join(',')}) values(${columns.map((_,i)=>'$'+(i+1)).join(',')}) ${suffix} returning *`;
  return asRole(db,role,user,tx=>tx.query(sql,Object.values(row)));
}
async function count(f,user=users.admin){return Number((await asRole(db,'authenticated',user,tx=>tx.query('select count_documents_this_month($1) n',[f.company]))).rows[0].n);}
async function rawCount(f){return Number((await db.query('select coalesce(sum(used),0) n from document_monthly_usage where company_id=$1',[f.company])).rows[0].n);}

test('all nine document collections share one monthly limit including supplier DDT',async()=>{
  const f=await fixture(9);
  for(const t of tables)await insert(t,document(t,f));
  assert.equal(await count(f),9);
  for(const t of tables)await assert.rejects(insert(t,document(t,f)),/limite documenti/);
  assert.equal(await count(f),9);
});

test('upsert existing ID and ON CONFLICT DO NOTHING consume no extra capacity at the limit',async()=>{
  const f=await fixture(1),r=document('preventivi',f);await insert('preventivi',r);
  const original=(await db.query('select created_at from preventivi where id=$1',[r.id])).rows[0].created_at;
  await insert('preventivi',{...r,created_at:'1990-01-01'},users.admin,'authenticated','on conflict(id) do update set num=excluded.num,created_at=excluded.created_at');
  await insert('preventivi',r,users.admin,'authenticated','on conflict do nothing');
  assert.equal(await count(f),1);
  assert.deepEqual((await db.query('select created_at from preventivi where id=$1',[r.id])).rows[0].created_at,original);
});

test('delete, cancellation and editing creation date do not refund or move charged usage',async()=>{
  const f=await fixture(2),one=document('preventivi',f),two=document('preventivi',f);
  await insert('preventivi',one);await insert('preventivi',two);
  await asRole(db,'authenticated',users.admin,tx=>tx.query('delete from preventivi where id=$1',[one.id]));
  await asRole(db,'authenticated',users.admin,tx=>tx.query("update preventivi set extra='{\"annullato\":true}',created_at='1990-01-01' where id=$1",[two.id]));
  assert.equal(await count(f),2);await assert.rejects(insert('preventivi',document('preventivi',f)),/limite documenti/);
});

test('historical bootstrap uses UTC creation month across tables, ignores previous/future months and handles first real insert once',async()=>{
  const f=await fixture(4);
  const month=(await db.query("select date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' as start")).rows[0].start;
  await insert('preventivi',document('preventivi',f,{created_at:month}),null,'service_role');
  await insert('ddt_fornitore',document('ddt_fornitore',f,{created_at:month}),null,'service_role');
  await insert('preventivi',document('preventivi',f,{created_at:'1990-01-01'}),null,'service_role');
  await insert('preventivi',document('preventivi',f,{created_at:'2099-01-01'}),null,'service_role');
  await insert('preventivi',document('preventivi',f));
  assert.equal(await count(f),3);await insert('preventivi',document('preventivi',f));assert.equal(await count(f),4);
});

test('first deletion captures historical baseline before the row disappears',async()=>{
  const f=await fixture(1),r=document('preventivi',f);await insert('preventivi',r,null,'service_role');
  assert.equal(await rawCount(f),0);
  await asRole(db,'authenticated',users.admin,tx=>tx.query('delete from preventivi where id=$1',[r.id]));
  assert.equal(await count(f),1);await assert.rejects(insert('preventivi',document('preventivi',f)),/limite documenti/);
});

test('client backdated and future created_at values are replaced with server transaction time',async()=>{
  const f=await fixture(2);
  for(const created_at of ['1990-01-01','2099-01-01']){
    const result=await insert('preventivi',document('preventivi',f,{created_at}));
    assert.ok(Math.abs(Date.now()-new Date(result.rows[0].created_at).getTime())<60000);
  }
  assert.equal(await count(f),2);
});

test('membership and viewer rules cannot be bypassed; viewer may read own usage and foreign users cannot',async()=>{
  const f=await fixture(5);
  await insert('preventivi',document('preventivi',f),users.operator);assert.equal(await count(f,users.viewer),1);
  for(const user of [users.viewer,users.otherAdmin])await assert.rejects(insert('preventivi',document('preventivi',f),user));
  await assert.rejects(insert('preventivi',document('preventivi',f),null,'anon'));
  await assert.rejects(count(f,users.otherAdmin));assert.equal(await count(f),1);
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.exec('update document_monthly_usage set used=0')),{code:'42501'});
});

test('company and document identity cannot change on update or cross-tenant upsert',async()=>{
  const f=await fixture(),g=await fixture(),r=document('preventivi',f);await insert('preventivi',r);
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('update preventivi set company_id=$1,cliente_id=$2 where id=$3',[g.company,g.customer,r.id])),/non modificabile/);
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('update preventivi set id=$1 where id=$2',[next(),r.id])),/non modificabile/);
  await assert.rejects(insert('preventivi',{...r,company_id:g.company,cliente_id:g.customer},users.admin,'authenticated','on conflict(id) do update set company_id=excluded.company_id,cliente_id=excluded.cliente_id'),/non modificabile/);
  assert.equal(await count(f),1);assert.equal(await count(g),0);
});

test('unlimited plan still accounts usage and a missing plan fails closed',async()=>{
  const f=await fixture(null);await insert('preventivi',document('preventivi',f));assert.equal(await count(f),1);
  await db.exec("alter table companies drop constraint companies_piano_check");
  try{
    await db.query("update companies set piano='missing-test' where id=$1",[f.company]);
    await assert.rejects(insert('preventivi',document('preventivi',f)),/piano aziendale/);assert.equal(await count(f),1);
  }finally{
    await db.query("update companies set piano='trial' where id=$1",[f.company]);
    await db.exec("alter table companies add constraint companies_piano_check check(piano in ('trial','base','pro'))");
  }
});

test('statement rollback after quota charge restores both row and usage',async()=>{
  const f=await fixture(2);await insert('preventivi',document('preventivi',f));
  await db.exec("create function quota_fail_test() returns trigger language plpgsql as $$begin raise exception 'injected quota failure';end;$$; create trigger z_quota_fail_test after insert on preventivi for each row execute function quota_fail_test();");
  const r=document('preventivi',f);
  try{await assert.rejects(insert('preventivi',r),/injected quota failure/);assert.equal(await count(f),1);assert.equal((await db.query('select id from preventivi where id=$1',[r.id])).rows.length,0);}
  finally{await db.exec('drop trigger z_quota_fail_test on preventivi;drop function quota_fail_test();');}
  await insert('preventivi',r);assert.equal(await count(f),2);
});

test('atomic DDT RPC is subject to quota and failure rolls back number, document, order and operation',async()=>{
  const f=await fixture(1);
  const order=(await insert('ordini_cliente',document('ordini_cliente',f,{righe:JSON.stringify([{cod:'P',qty:3}])}))).rows[0];
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('select create_customer_ddt($1,$2,$3,$4::jsonb,$5::jsonb)',
    [f.company,order.id,next(),JSON.stringify(order.righe),JSON.stringify({data:'2026-09-19',cliente_id:f.customer,righe:[{cod:'P',qty:1,source_order_index:0}]})])),/limite documenti/);
  assert.equal(await count(f),1);
  assert.equal((await db.query('select id from ddt where company_id=$1',[f.company])).rows.length,0);
  assert.equal((await db.query('select * from document_counters where company_id=$1',[f.company])).rows.length,0);
  assert.equal((await db.query('select * from customer_ddt_operations where company_id=$1',[f.company])).rows.length,0);
  assert.deepEqual((await db.query('select righe from ordini_cliente where id=$1',[order.id])).rows[0].righe,order.righe);
});

test('trusted maintenance without auth.uid deliberately bypasses quota once counter is initialized',async()=>{
  const f=await fixture(0);assert.equal(await count(f),0);
  await insert('preventivi',document('preventivi',f,{created_at:'1990-01-01'}),null,'service_role');
  assert.equal(await count(f),0);
  await assert.rejects(insert('preventivi',document('preventivi',f)),/limite documenti/);
});

test('first multi-row INSERT charges each actual row once and an over-limit batch rolls back entirely',async()=>{
  const f=await fixture(3);
  const batch=(f,n)=>asRole(db,'authenticated',users.admin,tx=>tx.query(
    "insert into preventivi(company_id,num,data,cliente_id) select $1,'BATCH-'||g,current_date,$2 from generate_series(1,$3::integer) g",[f.company,f.customer,n]));
  await batch(f,3);assert.equal(await count(f),3);
  const g=await fixture(2);await assert.rejects(batch(g,3),/limite documenti/);
  assert.equal((await db.query('select id from preventivi where company_id=$1',[g.company])).rows.length,0);
  assert.equal(await count(g),0);
});
