const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,migrate,seedTenants,asRole,uuid}=require('./helpers/database.cjs');
let db,users,companies,serial=7000; const customer=uuid(70);
before(async()=>{db=await database(22);({users,companies}=await seedTenants(db));await db.query('insert into clienti(id,company_id,nome) values($1,$2,$3)',[customer,companies.A,'Test']);});
after(async()=>{if(db)await db.close();});
async function fixture(withOrder=true){
 let order=null;
 if(withOrder)order=(await db.query("insert into ordini_cliente(company_id,num,data,cliente_id,righe,extra) values($1,$2,'2025-01-01',$3,$4,$5) returning *",[companies.A,'OC'+(++serial),customer,JSON.stringify([{cod:'A',qty:8,qtyEv:5}]),JSON.stringify({ftIds:['OLD'],keep:1})])).rows[0];
 const d=(await db.query("insert into ddt(company_id,num,data,cliente_id,oc_id,righe) values($1,$2,'2025-01-01',$3,$4,$5) returning *",[companies.A,'DDT'+(++serial),customer,order?.id||null,JSON.stringify([{cod:'A',qty:2,prezzo:3},{cod:'A',qty:3,prezzo:4}])])).rows[0];
 return {d,order,company:companies.A,key:uuid(++serial),expected:{cliente_id:customer,oc_id:order?.id||null,righe:d.righe,extra:{ftId:null,annullato:false}},document:{cliente_id:customer,oc_id:order?.id||null,data:'2026-09-19',righe:d.righe.map((r,i)=>({...r,source_ddt_index:i,prezzo:99}))}};
}
async function call(r,user=users.admin){return asRole(db,'authenticated',user,async tx=>(await tx.query('select create_customer_invoice($1,$2,$3,$4,$5) result',[r.company,r.d.id,r.key,JSON.stringify(r.expected),JSON.stringify(r.document)])).rows[0].result);}
async function state(r){return {ddt:(await db.query('select * from ddt where id=$1',[r.d.id])).rows,ft:(await db.query('select * from fatture_cliente where ddt_id=$1',[r.d.id])).rows,counters:(await db.query('select * from document_counters order by company_id,doc_type,anno')).rows,ops:(await db.query('select count(*)::int n from customer_invoice_operations')).rows,order:r.order?(await db.query('select righe,extra from ordini_cliente where id=$1',[r.order.id])).rows:null};}
test('full duplicate-code DDT creates invoice and links atomically without changing delivery quantities',async()=>{
 const r=await fixture(),out=await call(r);assert.match(out.fattura.num,/^FT\/2026\//);assert.equal(out.fattura.righe[0].prezzo,99);assert.equal(out.ddt.extra.ftId,out.fattura.num);assert.deepEqual(out.ordine.righe,r.order.righe);assert.deepEqual(out.ordine.extra.ftIds,['OLD',out.fattura.num]);assert.equal(out.ordine.extra.keep,1);assert.equal(out.fattura.paid,false);
 const saved=await state(r);assert.equal((await call(r)).replayed,true);assert.deepEqual(await state(r),saved);
 await assert.rejects(call({...r,key:uuid(++serial)}),/già fatturato/);
 await assert.rejects(call({...r,document:{...r.document,data:'2026-09-20'}}),/dati diversi/);
});
test('standalone DDT needs no order; split source rows may sum to full quantity',async()=>{
 const r=await fixture(false);r.document.righe=[{cod:'A',qty:1,source_ddt_index:0},{cod:'A',qty:1,source_ddt_index:0},{cod:'A',qty:3,source_ddt_index:1}];assert.equal((await call(r)).ordine,null);
});
test('viewer and other tenant cannot invoice',async()=>{const r=await fixture();for(const user of [users.viewer,users.otherAdmin])await assert.rejects(call(r,user),/non autorizzata/);assert.equal((await state(r)).ft.length,0);});
test('partial, excess, ambiguous, stale, mismatched and cancelled requests have no effects',async()=>{
 for(const kind of ['partial','excess','ambiguous','stale','customer','cancelled']){
  const r=await fixture();
  if(kind==='partial')r.document.righe.pop();
  if(kind==='excess')r.document.righe[0].qty=3;
  if(kind==='ambiguous')delete r.document.righe[0].source_ddt_index;
  if(kind==='stale')r.expected.righe=[];
  if(kind==='customer')r.document.cliente_id=uuid(999);
  if(kind==='cancelled')await db.query('update ddt set extra=$1 where id=$2',[JSON.stringify({annullato:true}),r.d.id]);
  const before=await state(r);await assert.rejects(call(r));assert.deepEqual(await state(r),before,kind);
 }
});
test('existing invoice blocks another even when historical DDT marker is missing',async()=>{
 const r=await fixture();await db.query("insert into fatture_cliente(company_id,num,data,cliente_id,ddt_id,righe) values($1,$2,'2026-01-01',$3,$4,'[]')",[companies.A,'LEGACY'+(++serial),customer,r.d.id]);await assert.rejects(call(r),/già fatturato/);
});
test('direct API cannot create, relink, edit quantities or delete linked invoices; payment UPSERT still works',async()=>{
 const r=await fixture();
 const insert=async tx=>tx.query("insert into fatture_cliente(company_id,num,data,cliente_id,ddt_id,righe) values($1,'BYPASS','2026-01-01',$2,$3,'[]')",[companies.A,customer,r.d.id]);
 await assert.rejects(asRole(db,'authenticated',users.admin,insert),/usare create_customer_invoice/);
 const out=await call(r),f=out.fattura;
 for(const sql of ["update fatture_cliente set righe='[]' where id=$1","update fatture_cliente set ddt_id=null where id=$1","delete from fatture_cliente where id=$1"]){await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query(sql,[f.id])));}
 await asRole(db,'authenticated',users.admin,tx=>tx.query(`insert into fatture_cliente(id,company_id,num,data,cliente_id,ddt_id,oc_id,dest_id,righe,paid,pagamenti) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'[]') on conflict(id) do update set paid=excluded.paid`,[f.id,f.company_id,f.num,f.data,f.cliente_id,f.ddt_id,f.oc_id,f.dest_id,JSON.stringify(f.righe)]));
 assert.equal((await db.query('select paid from fatture_cliente where id=$1',[f.id])).rows[0].paid,true);
});
test('failure at each write rolls invoice, counter, DDT, order and ledger back',async()=>{
 for(const [table,event] of [['fatture_cliente','insert'],['ddt','update'],['ordini_cliente','update'],['customer_invoice_operations','insert']]){
  const r=await fixture(),before=await state(r);
  await db.exec(`create function public.fail_invoice_test() returns trigger language plpgsql as $$ begin raise exception 'injected invoice failure'; end $$; create trigger fail_invoice_test before ${event} on public.${table} for each row execute function public.fail_invoice_test();`);
  try{await assert.rejects(call(r),/injected invoice failure/);assert.deepEqual(await state(r),before,table);}finally{await db.exec(`drop trigger fail_invoice_test on public.${table}; drop function public.fail_invoice_test();`);}
 }
});
