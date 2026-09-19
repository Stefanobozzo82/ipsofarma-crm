const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {database,seedTenants,asRole,uuid}=require('./helpers/database.cjs');
let db,users,companies;const supplier=uuid(8080);
before(async()=>{db=await database(32);({users,companies}=await seedTenants(db));await db.query('insert into fornitori(id,company_id,nome) values($1,$2,$3)',[supplier,companies.A,'Supplier']);});
after(async()=>{if(db)await db.close();});
const rpc=(name,args)=>asRole(db,'authenticated',users.admin,async tx=>(await tx.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result);
test('schema32 allows atomic supplier invoice creation and payment while rejecting direct paid writes',async()=>{
 const d=(await db.query("insert into ddt_fornitore(company_id,num,data,fornitore_id,righe) values($1,'DDT-COMBINED','2026-09-19',$2,$3) returning *",[companies.A,supplier,JSON.stringify([{cod:'A',qty:2,prezzo:10}])])).rows[0];
 const result=await rpc('create_supplier_invoice',[companies.A,d.id,uuid(8081),JSON.stringify({fornitore_id:supplier,of_id:null,righe:d.righe,extra:{ftfId:null,annullato:false}}),JSON.stringify({fornitore_id:supplier,of_id:null,data:'2026-09-19',righe:[{cod:'A',qty:2,prezzo:10,iva:0,source_ddt_index:0}]})]);
 const paid=await rpc('mutate_invoice_payment',[companies.A,'supplier',result.fattura.id,uuid(8082),'settle',JSON.stringify({data:'2026-09-19'})]);
 assert.equal(paid.paid,true);assert.equal(paid.pagamenti.length,1);assert.equal(paid.pagamenti[0].importo,20);
 await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('update fatture_fornitore set paid=false where id=$1',[paid.id])));
 assert.equal((await db.query('select extra from ddt_fornitore where id=$1',[d.id])).rows[0].extra.ftfId,paid.num);
});
test('schema32 permits atomic standalone receipt attachment without losing existing invoice payments',async()=>{
 const f=(await db.query("insert into fatture_fornitore(company_id,num,data,fornitore_id,righe) values($1,'FT-COMBINED','2026-09-19',$2,$3) returning *",[companies.A,supplier,JSON.stringify([{cod:'A',qty:1,prezzo:30,iva:0}])])).rows[0];
 const paid=await rpc('mutate_invoice_payment',[companies.A,'supplier',f.id,uuid(8083),'settle',JSON.stringify({data:'2026-09-19'})]);
 const linked=await rpc('create_standalone_supplier_ddt',[companies.A,uuid(8084),JSON.stringify({num:'DDT-ATTACHED',data:'2026-09-19',fornitore_id:supplier,fattura_id:f.id,righe:f.righe})]);
 assert.equal(linked.fattura.ddtf_id,linked.ddt.id);assert.equal(linked.fattura.paid,true);assert.deepEqual(linked.fattura.pagamenti,paid.pagamenti);
});
