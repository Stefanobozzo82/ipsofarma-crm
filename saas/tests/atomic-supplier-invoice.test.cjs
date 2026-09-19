const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,migrate,seedTenants,asRole,uuid}=require('./helpers/database.cjs');
let db,users,companies,serial=7000; const supplier=uuid(70);
before(async()=>{db=await database(31);({users,companies}=await seedTenants(db));await db.query('insert into fornitori(id,company_id,nome) values($1,$2,$3)',[supplier,companies.A,'Test']);});
after(async()=>{if(db)await db.close();});
async function fixture(withOrder=true){
 let order=null;
 if(withOrder)order=(await db.query("insert into ordini_fornitore(company_id,num,data,fornitore_id,righe,extra) values($1,$2,'2025-01-01',$3,$4,$5) returning *",[companies.A,'OC'+(++serial),supplier,JSON.stringify([{cod:'A',qty:8,qtyEv:5}]),JSON.stringify({ftfId:'OLD',keep:1})])).rows[0];
 const d=(await db.query("insert into ddt_fornitore(company_id,num,data,fornitore_id,of_id,righe) values($1,$2,'2025-01-01',$3,$4,$5) returning *",[companies.A,'DDT'+(++serial),supplier,order?.id||null,JSON.stringify([{cod:'A',qty:2,prezzo:3},{cod:'A',qty:3,prezzo:4}])])).rows[0];
 return {d,order,company:companies.A,key:uuid(++serial),expected:{fornitore_id:supplier,of_id:order?.id||null,righe:d.righe,extra:{ftfId:null,annullato:false}},document:{fornitore_id:supplier,of_id:order?.id||null,data:'2026-09-19',righe:d.righe.map((r,i)=>({...r,source_ddt_index:i,prezzo:99}))}};
}
async function call(r,user=users.admin){return asRole(db,'authenticated',user,async tx=>(await tx.query('select create_supplier_invoice($1,$2,$3,$4,$5) result',[r.company,r.d.id,r.key,JSON.stringify(r.expected),JSON.stringify(r.document)])).rows[0].result);}
async function state(r){return {ddt_fornitore:(await db.query('select * from ddt_fornitore where id=$1',[r.d.id])).rows,ft:(await db.query('select * from fatture_fornitore where ddtf_id=$1',[r.d.id])).rows,counters:(await db.query('select * from document_counters order by company_id,doc_type,anno')).rows,ops:(await db.query('select count(*)::int n from supplier_invoice_operations')).rows,order:r.order?(await db.query('select righe,extra from ordini_fornitore where id=$1',[r.order.id])).rows:null};}
test('full duplicate-code DDT creates invoice and links atomically without changing delivery quantities',async()=>{
 const r=await fixture(),out=await call(r);assert.match(out.fattura.num,/^FTF\/2026\//);assert.equal(out.fattura.righe[0].prezzo,99);assert.equal(out.ddt.extra.ftfId,out.fattura.num);assert.deepEqual(out.ordine.righe,r.order.righe);assert.deepEqual(out.ordine.ftf_ids,['OLD',out.fattura.num]);assert.equal(out.ordine.extra.keep,1);assert.equal(out.fattura.paid,false);
 const saved=await state(r);assert.equal((await call(r)).replayed,true);assert.deepEqual(await state(r),saved);
 await assert.rejects(call({...r,key:uuid(++serial)}),/già fatturato/);
 await assert.rejects(call({...r,document:{...r.document,data:'2026-09-20'}}),/dati diversi/);
});
test('standalone DDT needs no order; split source rows may sum to full quantity',async()=>{
 const r=await fixture(false);r.document.righe=[{cod:'A',qty:1,source_ddt_index:0},{cod:'A',qty:1,source_ddt_index:0},{cod:'A',qty:3,source_ddt_index:1}];assert.equal((await call(r)).ordine,null);
});
test('viewer and other tenant cannot invoice',async()=>{const r=await fixture();for(const user of [users.viewer,users.otherAdmin])await assert.rejects(call(r,user),/non autorizzata/);assert.equal((await state(r)).ft.length,0);});
test('partial, excess, ambiguous, stale, mismatched and cancelled requests have no effects',async()=>{
 for(const kind of ['partial','excess','ambiguous','stale','supplier','cancelled']){
  const r=await fixture();
  if(kind==='partial')r.document.righe.pop();
  if(kind==='excess')r.document.righe[0].qty=3;
  if(kind==='ambiguous')delete r.document.righe[0].source_ddt_index;
  if(kind==='stale')r.expected.righe=[];
  if(kind==='supplier')r.document.fornitore_id=uuid(999);
  if(kind==='cancelled')await db.query('update ddt_fornitore set extra=$1 where id=$2',[JSON.stringify({annullato:true}),r.d.id]);
  const before=await state(r);await assert.rejects(call(r));assert.deepEqual(await state(r),before,kind);
 }
});
test('existing invoice blocks another even when historical DDT marker is missing',async()=>{
 const r=await fixture();await db.query("insert into fatture_fornitore(company_id,num,data,fornitore_id,ddtf_id,righe) values($1,$2,'2026-01-01',$3,$4,'[]')",[companies.A,'LEGACY'+(++serial),supplier,r.d.id]);await assert.rejects(call(r),/già fatturato/);
});
test('direct API cannot create, relink, edit quantities or delete linked invoices; payment UPSERT still works',async()=>{
 const r=await fixture();
 const insert=async tx=>tx.query("insert into fatture_fornitore(company_id,num,data,fornitore_id,ddtf_id,righe) values($1,'BYPASS','2026-01-01',$2,$3,'[]')",[companies.A,supplier,r.d.id]);
 await assert.rejects(asRole(db,'authenticated',users.admin,insert),/usare create_supplier_invoice/);
 const out=await call(r),f=out.fattura;
 for(const sql of ["update fatture_fornitore set righe='[]' where id=$1","update fatture_fornitore set ddtf_id=null where id=$1","delete from fatture_fornitore where id=$1"]){await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query(sql,[f.id])));}
 await asRole(db,'authenticated',users.admin,tx=>tx.query(`insert into fatture_fornitore(id,company_id,num,data,fornitore_id,ddtf_id,of_id,righe,paid,pagamenti) values($1,$2,$3,$4,$5,$6,$7,$8,true,'[]') on conflict(id) do update set paid=excluded.paid`,[f.id,f.company_id,f.num,f.data,f.fornitore_id,f.ddtf_id,f.of_id,JSON.stringify(f.righe)]));
 assert.equal((await db.query('select paid from fatture_fornitore where id=$1',[f.id])).rows[0].paid,true);
});
test('failure at each write rolls invoice, counter, DDT, order and ledger back',async()=>{
 for(const [table,event] of [['fatture_fornitore','insert'],['ddt_fornitore','update'],['ordini_fornitore','update'],['supplier_invoice_operations','insert']]){
  const r=await fixture(),before=await state(r);
  await db.exec(`create function public.fail_invoice_test() returns trigger language plpgsql as $$ begin raise exception 'injected invoice failure'; end $$; create trigger fail_invoice_test before ${event} on public.${table} for each row execute function public.fail_invoice_test();`);
  try{await assert.rejects(call(r),/injected invoice failure/);assert.deepEqual(await state(r),before,table);}finally{await db.exec(`drop trigger fail_invoice_test on public.${table}; drop function public.fail_invoice_test();`);}
 }
});
test('standalone receipt links an existing invoice atomically and replays once',async()=>{
 const invoice=(await db.query("insert into fatture_fornitore(company_id,num,data,fornitore_id) values($1,$2,'2026-09-19',$3) returning id",[companies.A,'EXIST'+(++serial),supplier])).rows[0].id;
 const doc={num:'RECEIPT'+(++serial),data:'2026-09-19',fornitore_id:supplier,fattura_id:invoice,righe:[{cod:'X',qty:2}]},request=uuid(++serial);
 const create=()=>asRole(db,'authenticated',users.admin,async tx=>(await tx.query('select create_standalone_supplier_ddt($1,$2,$3) result',[companies.A,request,JSON.stringify(doc)])).rows[0].result);
 const result=await create();assert.equal(result.fattura.ddtf_id,result.ddt.id);assert.equal(result.ddt.extra.ftfId,result.fattura.num);assert.equal(result.ddt.of_id,null);assert.equal((await create()).replayed,true);
 await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('select create_standalone_supplier_ddt($1,$2,$3)',[companies.A,uuid(++serial),JSON.stringify({...doc,num:'DUP'+serial})])),/fattura non disponibile/);
});
test('standalone invoice-link failure rolls back new receipt and ledger',async()=>{
 const invoice=(await db.query("insert into fatture_fornitore(company_id,num,data,fornitore_id) values($1,$2,'2026-09-19',$3) returning id",[companies.A,'ROLLBACK'+(++serial),supplier])).rows[0].id;
 const doc={num:'ROLLBACK-DDT'+(++serial),data:'2026-09-19',fornitore_id:supplier,fattura_id:invoice,righe:[{cod:'X',qty:2}]},request=uuid(++serial);
 await db.exec("create function fail_standalone_link() returns trigger language plpgsql as $$ begin raise exception 'injected link failure'; end $$; create trigger fail_standalone_link before update on fatture_fornitore for each row execute function fail_standalone_link();");
 try{await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('select create_standalone_supplier_ddt($1,$2,$3)',[companies.A,request,JSON.stringify(doc)])),/injected link failure/);}finally{await db.exec('drop trigger fail_standalone_link on fatture_fornitore;drop function fail_standalone_link();');}
 assert.equal((await db.query('select count(*)::int n from ddt_fornitore where num=$1',[doc.num])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from supplier_standalone_ddt_operations where request_id=$1',[request])).rows[0].n,0);
 assert.equal((await db.query('select ddtf_id from fatture_fornitore where id=$1',[invoice])).rows[0].ddtf_id,null);
});
