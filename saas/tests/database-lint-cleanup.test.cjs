const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,seedTenants,asRole,uuid}=require('./helpers/database.cjs');
let db,users,companies;const customer=uuid(80001),supplier=uuid(80002),otherCustomer=uuid(80003);let seq=81000;
before(async()=>{
  db=await database(30);({users,companies}=await seedTenants(db));
  await db.query('insert into clienti(id,company_id,nome) values($1,$2,$3),($4,$5,$6)',[customer,companies.A,'Client',otherCustomer,companies.B,'Other']);
  await db.query('insert into fornitori(id,company_id,nome) values($1,$2,$3)',[supplier,companies.A,'Supplier']);
});
after(async()=>{if(db)await db.close();});
test('static bootstrap counts all nine document tables in the UTC month once, excluding other months/tenants',async()=>{
  const month=(await db.query("select to_char(date_trunc('month',now() at time zone 'UTC'),'YYYY-MM-DD') as month")).rows[0].month;
  const tables=['preventivi','ordini_cliente','ordini_fornitore','ddt','fatture_cliente','fatture_fornitore','note_credito','note_credito_fornitore','ddt_fornitore'];
  for(const table of tables){
    const isSupplier=table.includes('fornitore'),column=isSupplier?'fornitore_id':'cliente_id';
    await db.query(`insert into public.${table}(company_id,num,data,${column},created_at) values($1,$2,$3,$4,$5::timestamp at time zone 'UTC')`,[companies.A,'BOOT'+(++seq),month,isSupplier?supplier:customer,month]);
  }
  await db.query("insert into preventivi(company_id,num,data,cliente_id,created_at) values($1,'OLD','2000-01-01',$2,'2000-01-01'),($1,'FUTURE','2099-01-01',$2,'2099-01-01'),($3,'OTHER',$4,$5,now())",[companies.A,customer,companies.B,month,otherCustomer]);
  for(let i=0;i<2;i++)assert.equal(Number((await db.query('select initialize_document_usage($1,$2::date) as n',[companies.A,month])).rows[0].n),9);
});
test('replaced functions keep EXECUTE ACLs and do not expose private helpers',async()=>{
  for(const signature of ['customer_ddt_quantities(jsonb,jsonb)','supplier_ddt_quantities(jsonb,jsonb)','initialize_document_usage(uuid,date)']){
    const r=await db.query('select has_function_privilege($1,$2,$3) as allowed',['authenticated',signature,'EXECUTE']);assert.equal(r.rows[0].allowed,false);
  }
  for(const signature of ['update_customer_order(uuid,uuid,jsonb,jsonb)','create_customer_invoice(uuid,uuid,uuid,jsonb,jsonb)']){
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',['authenticated',signature,'EXECUTE'])).rows[0].allowed,true);
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',['anon',signature,'EXECUTE'])).rows[0].allowed,false);
  }
});
test('typed customer and supplier quantity helpers still aggregate split duplicate-code rows by index',async()=>{
  const rows=[{cod:'X',qty:1,source_order_index:0},{cod:'X',qty:2,source_order_index:0},{cod:'X',qty:4,source_order_index:1}],orders=[{cod:'X',qty:5},{cod:'X',qty:8}];
  for(const fn of ['customer_ddt_quantities','supplier_ddt_quantities'])assert.deepEqual((await db.query(`select public.${fn}($1,$2) as totals`,[JSON.stringify(rows),JSON.stringify(orders)])).rows[0].totals,{'0':3,'1':4});
});
test('all thirty migrations support optimistic order save then atomic DDT and full invoice with duplicate codes',async()=>{
  let order=(await db.query("insert into ordini_cliente(company_id,num,data,cliente_id,righe) values($1,$2,'2026-09-19',$3,$4) returning to_jsonb(ordini_cliente) as row",[companies.A,'OC'+(++seq),customer,JSON.stringify([{cod:'X',qty:2},{cod:'X',qty:3}])])).rows[0].row;
  const expected=Object.fromEntries(['num','data','cliente_id','dest_id','righe','extra'].map(k=>[k,order[k]]));
  const doc={...expected,righe:order.righe.map((r,i)=>({...r,source_order_index:i,descr:'Edited'}))};
  order=(await asRole(db,'authenticated',users.admin,tx=>tx.query('select update_customer_order($1,$2,$3,$4) as row',[companies.A,order.id,JSON.stringify(expected),JSON.stringify(doc)]))).rows[0].row;
  const creation=(await asRole(db,'authenticated',users.admin,tx=>tx.query('select create_customer_ddt($1,$2,$3,$4,$5) as result',[companies.A,order.id,uuid(++seq),JSON.stringify(order.righe),JSON.stringify({data:'2026-09-19',cliente_id:customer,righe:order.righe.map((r,i)=>({...r,source_order_index:i}))})]))).rows[0].result;
  const d=creation.ddt,invoiceExpected={cliente_id:customer,oc_id:order.id,righe:d.righe,extra:{ftId:null,annullato:false}};
  const invoiceDoc={cliente_id:customer,oc_id:order.id,data:'2026-09-19',righe:d.righe.map((r,i)=>({...r,source_ddt_index:i,prezzo:10}))};
  const result=(await asRole(db,'authenticated',users.admin,tx=>tx.query('select create_customer_invoice($1,$2,$3,$4,$5) as result',[companies.A,d.id,uuid(++seq),JSON.stringify(invoiceExpected),JSON.stringify(invoiceDoc)]))).rows[0].result;
  assert.equal(result.fattura.righe.length,2);assert.equal(result.ddt.extra.ftId,result.fattura.num);
  assert.deepEqual(result.ordine.righe.map(r=>r.qtyEv),[2,3]);
});
