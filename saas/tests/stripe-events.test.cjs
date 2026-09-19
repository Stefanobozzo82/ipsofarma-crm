const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {database,migrate,seedTenants,asRole}=require('./helpers/database.cjs');let db,users,companies,n=0;
before(async()=>{db=await database(19);await migrate(db,24,24);({users,companies}=await seedTenants(db));await db.exec("update plans set stripe_price_id='price_base' where id='base'");await db.query("update companies set stripe_customer_id='cus_A' where id=$1",[companies.A]);});
after(async()=>{if(db)await db.close();});
const event=(type='customer.subscription.updated',time=100,extra={})=>({id:'evt_'+(++n),type,created:time,data:{object:{id:'sub_A',customer:'cus_A',status:'active',items:{data:[{price:{id:'price_base'},current_period_end:1900000000}]},...extra}}});
const call=e=>asRole(db,'service_role',null,async tx=>(await tx.query('select apply_stripe_event($1) result',[JSON.stringify(e)])).rows[0].result);
test('subscription before checkout resolves customer; duplicate and older state do not overwrite',async()=>{
 const e=event();await call(e);assert.equal((await call(e)).duplicate,true);
 await call(event('customer.subscription.updated',99,{status:'past_due'}));
 let c=(await db.query('select * from companies where id=$1',[companies.A])).rows[0];assert.equal(c.subscription_status,'active');assert.equal(c.piano,'base');
 await call(event('checkout.session.completed',101,{client_reference_id:companies.A,subscription:'sub_A'}));
 await call(event('customer.subscription.updated',102,{status:'past_due'}));c=(await db.query('select * from companies where id=$1',[companies.A])).rows[0];assert.equal(c.subscription_status,'past_due');assert.equal(c.piano,'base');
});
test('unknown company or plan rolls back ledger and can retry after repair',async()=>{
 const e=event('customer.subscription.updated',200,{customer:'unknown'});await assert.rejects(call(e),/missing/);assert.equal((await db.query('select * from stripe_events where id=$1',[e.id])).rows.length,0);
 const bad=event('customer.subscription.updated',201,{items:{data:[{price:{id:'missing'}}]}});await assert.rejects(call(bad),/unknown Stripe price/);assert.equal((await db.query('select * from stripe_events where id=$1',[bad.id])).rows.length,0);
});
test('deleted subscription tombstone prevents resurrection',async()=>{await call(event('customer.subscription.deleted',300));assert.equal((await call(event('customer.subscription.updated',301))).outcome,'stale');assert.equal((await db.query('select piano from companies where id=$1',[companies.A])).rows[0].piano,'trial');});
test('authenticated clients cannot invoke service-only processing',async()=>{await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('select apply_stripe_event($1)',[JSON.stringify(event())])),/permission denied/);});
test('failure on ledger insert rolls company and watermark back',async()=>{
 await db.query("update companies set stripe_customer_id='cus_B' where id=$1",[companies.B]);
 const e=event('customer.subscription.updated',400,{id:'sub_B',customer:'cus_B'});
 await db.exec("create function fail_stripe_test() returns trigger language plpgsql as $$begin raise exception 'ledger fail';end$$;create trigger fail_stripe_test before insert on stripe_events for each row execute function fail_stripe_test()");
 try{await assert.rejects(call(e),/ledger fail/);assert.equal((await db.query('select piano from companies where id=$1',[companies.B])).rows[0].piano,'trial');assert.equal((await db.query("select * from stripe_subscription_watermarks where subscription_id='sub_B'")).rows.length,0);}finally{await db.exec('drop trigger fail_stripe_test on stripe_events;drop function fail_stripe_test()');}
});
