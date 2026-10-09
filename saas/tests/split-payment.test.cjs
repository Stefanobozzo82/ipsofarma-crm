const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {database,seedTenants,asRole,uuid}=require('./helpers/database.cjs');let db,users,companies,n=47000;
const customer=uuid(471);
before(async()=>{db=await database(47);({users,companies}=await seedTenants(db));await db.query('insert into clienti(id,company_id,nome) values($1,$2,$3)',[customer,companies.A,'Ente pubblico']);});
after(async()=>{if(db)await db.close();});
// 1000 di imponibile al 22%: lordo 1220, in split payment si incassa 1000.
async function invoice(extra){return (await db.query(`insert into fatture_cliente(company_id,num,data,cliente_id,righe,pagamenti,paid,extra) values($1,$2,'2026-02-03',$3,'[{"cod":"A","qty":2,"prezzo":500,"iva":22}]','[]',false,$4) returning *`,[companies.A,'SPLIT-'+(++n),customer,JSON.stringify(extra)])).rows[0];}
async function call(f,action,payload){return asRole(db,'authenticated',users.admin,async tx=>(await tx.query('select mutate_invoice_payment($1,$2,$3,$4,$5,$6) r',[companies.A,'customer',f.id,uuid(++n),action,JSON.stringify(payload)])).rows[0].r);}
test('due total is the taxable amount for split payment invoices and the gross amount otherwise',async()=>{
 const {rows:[r]}=await db.query(`select invoice_due_total('{"righe":[{"qty":2,"prezzo":100,"sconto":"10","iva":22},{"qty":1,"prezzo":50,"iva":4}]}') normale,
  invoice_due_total('{"extra":{"split":true},"righe":[{"qty":2,"prezzo":100,"sconto":"10","iva":22},{"qty":1,"prezzo":50,"iva":4}]}') split`);
 assert.equal(Number(r.normale),271.6);assert.equal(Number(r.split),230);
});
test('settling a split payment invoice collects only the taxable amount',async()=>{
 const r=await call(await invoice({split:true}),'settle',{data:'2026-03-01'});
 assert.deepEqual(r.pagamenti.map(p=>Number(p.importo)),[1000]);assert.equal(r.paid,true);
});
test('a split payment invoice is paid once the taxable amount is collected, a normal one is not',async()=>{
 const split=await call(await invoice({split:true}),'add',{data:'2026-03-01',importo:1000});assert.equal(split.paid,true);
 const normale=await call(await invoice({}),'add',{data:'2026-03-01',importo:1000});assert.equal(normale.paid,false);
 const saldo=await call(await invoice({}),'settle',{data:'2026-03-01'});assert.deepEqual(saldo.pagamenti.map(p=>Number(p.importo)),[1220]);
});
test('Maestro imports invoices of split payment customers as split payment',async()=>{
 const {rows:[d]}=await db.query("select pg_get_functiondef(p.oid) d from pg_proc p where p.proname='maestro_crea_documento'");
 assert.match(d.d,/c\.split = 'si'/);assert.match(d.d,/jsonb_build_object\('split', true\)/);
});
