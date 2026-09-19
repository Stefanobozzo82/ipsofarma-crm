const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {database,seedTenants,asRole,uuid}=require('./helpers/database.cjs');let db,users,companies,n=12000;
const customer=uuid(121),supplier=uuid(122);const table=k=>k==='customer'?'fatture_cliente':'fatture_fornitore';
before(async()=>{db=await database(34);({users,companies}=await seedTenants(db));await db.query('insert into clienti(id,company_id,nome) values($1,$2,$3)',[customer,companies.A,'Synthetic']);await db.query('insert into fornitori(id,company_id,nome) values($1,$2,$3)',[supplier,companies.A,'Synthetic']);});
after(async()=>{if(db)await db.close();});
async function invoice(kind='customer',payments=[],paid=false){return (await db.query(`insert into ${table(kind)}(company_id,num,data,${kind==='customer'?'cliente_id':'fornitore_id'},righe,pagamenti,paid) values($1,$2,'2026-09-19',$3,'[{"cod":"A","qty":1,"prezzo":100,"iva":0}]',$4,$5) returning *`,[companies.A,'PAY-'+(++n),kind==='customer'?customer:supplier,JSON.stringify(payments),paid])).rows[0];}
async function call(f,action,payload,key=uuid(++n),kind='customer',user=users.admin){return asRole(db,'authenticated',user,async tx=>(await tx.query('select mutate_invoice_payment($1,$2,$3,$4,$5,$6) r',[companies.A,kind,f.id,key,action,JSON.stringify(payload)])).rows[0].r);}
const snapshot=f=>({expected_payments:f.pagamenti,expected_paid:f.paid,expected_paid_date:f.paid_date});
test('distinct additions merge server-side and same request replays without duplicating money',async()=>{
 const f=await invoice(),key=uuid(++n),payload={data:'2026-09-19',importo:30};
 const a=await call(f,'add',payload,key);assert.equal(a.pagamenti.length,1);assert.equal(a.paid,false);
 const b=await call(f,'add',{data:'2026-09-20',importo:40});assert.deepEqual(b.pagamenti.map(p=>p.importo),[30,40]);
 const replay=await call(f,'add',payload,key);assert.equal(replay.pagamenti.length,1);
 assert.equal((await db.query('select pagamenti from fatture_cliente where id=$1',[f.id])).rows[0].pagamenti.length,2);
 await assert.rejects(call(f,'add',{...payload,importo:31},key),/dati diversi/);
});
test('settlement adds only server residual including credit notes and preserves earlier payments',async()=>{
 const f=await invoice();await call(f,'add',{data:'2026-09-19',importo:30});
 await db.query("insert into note_credito(company_id,num,data,cliente_id,fattura_id,righe) values($1,$2,'2026-09-19',$3,$4,'[{\"cod\":\"A\",\"qty\":1,\"prezzo\":20,\"iva\":0}]')",[companies.A,'NC'+(++n),customer,f.id]);
 const r=await call(f,'settle',{data:'2026-09-20'});assert.deepEqual(r.pagamenti.map(p=>p.importo),[30,50]);assert.equal(r.paid,true);assert.equal(r.paid_date,'2026-09-20');
 const again=await call(f,'settle',{data:'2026-09-20'});assert.equal(again.pagamenti.length,2);
});
test('new payment removal uses identity while legacy removal requires unchanged array',async()=>{
 const f=await invoice('customer',[{data:'2026-09-18',importo:10}]);const r=await call(f,'add',{data:'2026-09-19',importo:20});
 await assert.rejects(call(f,'remove',{index:0,expected_payments:f.pagamenti}),/modificati/);
 const removed=await call(f,'remove',{payment_id:r.pagamenti[1].payment_id});assert.deepEqual(removed.pagamenti,f.pagamenti);
 const final=await call(f,'remove',{index:0,expected_payments:removed.pagamenti});assert.deepEqual(final.pagamenti,[]);
});
test('clear refuses stale state and supplier uses the same atomic operations',async()=>{
 const f=await invoice('supplier');const a=await call(f,'add',{data:'2026-09-19',importo:100},uuid(++n),'supplier');assert.equal(a.paid,true);
 await assert.rejects(call(f,'clear',snapshot(f),uuid(++n),'supplier'),/modificati/);
 const r=await call(f,'clear',snapshot(a),uuid(++n),'supplier');assert.equal(r.paid,false);assert.deepEqual(r.pagamenti,[]);
});
test('legacy paid flag without cash ledger is preserved without inventing a payment',async()=>{
 const f=await invoice('customer',[],true);const r=await call(f,'settle',{data:'2026-09-19'});assert.equal(r.paid,true);assert.deepEqual(r.pagamenti,[]);
 await assert.rejects(call(f,'add',{data:'2026-09-19',importo:10}),/storico saldato/);
 const reopened=await call(f,'clear',snapshot(r));assert.equal(reopened.paid,false);
});
test('viewer, other tenant, malformed amounts and private ledger reads are denied',async()=>{
 const f=await invoice();for(const user of [users.viewer,users.otherAdmin])await assert.rejects(call(f,'add',{data:'2026-09-19',importo:1},uuid(++n),'customer',user),/non autorizzata/);
 for(const amount of [0,-1,1.234,'2'])await assert.rejects(call(f,'add',{data:'2026-09-19',importo:amount}));
 await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('select * from invoice_payment_operations')),/permission denied/);
});
test('direct payment writes fail but unchanged editor upsert remains compatible',async()=>{
 const f=await invoice();const a=await call(f,'add',{data:'2026-09-19',importo:10});
 await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query("update fatture_cliente set pagamenti='[]' where id=$1",[f.id])),/dedicata/);
 await asRole(db,'authenticated',users.admin,tx=>tx.query(`insert into fatture_cliente(id,company_id,num,data,cliente_id,righe,pagamenti,paid,paid_date) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do update set extra='{"note":"kept"}'`,[a.id,a.company_id,a.num,a.data,a.cliente_id,JSON.stringify(a.righe),JSON.stringify(a.pagamenti),a.paid,a.paid_date]));
});
test('ledger insertion failure rolls back invoice payment mutation',async()=>{
 const f=await invoice();await db.exec("create function fail_payment_test() returns trigger language plpgsql as $$begin raise exception 'payment audit fail';end$$;create trigger fail_payment_test before insert on invoice_payment_operations for each row execute function fail_payment_test()");
 try{await assert.rejects(call(f,'add',{data:'2026-09-19',importo:10}),/payment audit fail/);assert.deepEqual((await db.query('select pagamenti from fatture_cliente where id=$1',[f.id])).rows[0].pagamenti,[]);}finally{await db.exec('drop trigger fail_payment_test on invoice_payment_operations;drop function fail_payment_test()');}
});
test('paid standalone invoices cannot be deleted through client API',async()=>{
 const f=await invoice();await call(f,'add',{data:'2026-09-19',importo:1});
 await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('delete from fatture_cliente where id=$1',[f.id])),/cancellazione non consentita/);
});
test('single-number legacy credit counts, UUID link wins, multi-invoice legacy credit fails closed',async()=>{
 const f=await invoice();
 await db.query("insert into note_credito(company_id,num,data,cliente_id,righe,extra) values($1,$2,'2026-09-19',$3,'[{\"qty\":1,\"prezzo\":20,\"iva\":0}]',$4)",[companies.A,'NC'+(++n),customer,JSON.stringify({ftId:f.num})]);
 const settled=await call(f,'settle',{data:'2026-09-19'});assert.equal(settled.pagamenti[0].importo,80);
 const a=await invoice(),b=await invoice();
 await db.query("insert into note_credito(company_id,num,data,cliente_id,righe,extra) values($1,$2,'2026-09-19',$3,'[{\"qty\":1,\"prezzo\":20,\"iva\":0}]',$4)",[companies.A,'NC'+(++n),customer,JSON.stringify({ftIds:[a.num,b.num]})]);
 await assert.rejects(call(a,'settle',{data:'2026-09-19'}),/definire allocazione/);
 const c=await invoice(),d=await invoice();
 await db.query("insert into note_credito(company_id,num,data,cliente_id,fattura_id,righe,extra) values($1,$2,'2026-09-19',$3,$4,'[{\"qty\":1,\"prezzo\":20,\"iva\":0}]',$5)",[companies.A,'NC'+(++n),customer,c.id,JSON.stringify({ftId:d.num})]);
 assert.equal((await call(d,'settle',{data:'2026-09-19'})).pagamenti[0].importo,100);
});
test('credit insert/update/delete refresh explicit payment status and audit without changing cash',async()=>{
 const f=await invoice();await call(f,'add',{data:'2026-09-19',importo:80});
 const nc=(await db.query("insert into note_credito(company_id,num,data,cliente_id,fattura_id,righe) values($1,$2,'2026-09-19',$3,$4,'[{\"qty\":1,\"prezzo\":20,\"iva\":0}]') returning id",[companies.A,'NC'+(++n),customer,f.id])).rows[0];
 assert.equal((await db.query('select paid from fatture_cliente where id=$1',[f.id])).rows[0].paid,true);
 await db.query("update note_credito set righe='[{\"qty\":1,\"prezzo\":10,\"iva\":0}]' where id=$1",[nc.id]);
 assert.equal((await db.query('select paid from fatture_cliente where id=$1',[f.id])).rows[0].paid,false);
 await db.query('delete from note_credito where id=$1',[nc.id]);
 assert.equal((await db.query('select pagamenti from fatture_cliente where id=$1',[f.id])).rows[0].pagamenti[0].importo,80);
 assert.equal((await db.query("select count(*)::int n from invoice_payment_operations where invoice_id=$1 and action='credit_refresh'",[f.id])).rows[0].n,2);
});
