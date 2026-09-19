const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../web/app/store.js'),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(options={}){
  const calls=[],fetches=[],pages=[];let sequence=0,error=null,response=options.response;
  const client={auth:{async getSession(){return {data:{session:{access_token:'test-token'}}};}},
    async rpc(name,args){calls.push([name,clone(args)]);return {data:typeof response==='function'?response(name,args):response,error};},
    from(table){
      if(!options.tables)throw Error('Unexpected direct database access');
      const q={table,filters:[],cursor:null,size:null};
      const query={select(value){assert.equal(value,'*');return this;},eq(column,value){q.filters.push([column,value]);return this;},
        order(column,value){assert.equal(column,'id');assert.equal(value.ascending,true);return this;},
        limit(size){q.size=size;return this;},gt(column,value){assert.equal(column,'id');q.cursor=value;return this;},
        range(){throw Error('Offset pagination is forbidden');},
        then(resolve,reject){
          try{
            pages.push(clone(q));
            if(options.pageError&&options.pageError(q,pages.length))return Promise.resolve({data:null,error:Error('page unavailable')}).then(resolve,reject);
            const data=(options.tables[table]||[]).filter(r=>q.filters.every(([c,v])=>r[c]===v)&&(options.ignoreCursor||!q.cursor||r.id>q.cursor))
              .sort((a,b)=>a.id.localeCompare(b.id)).slice(0,Math.min(q.size,options.serverCap||q.size));
            return Promise.resolve({data,error:null}).then(resolve,reject);
          }catch(e){return Promise.reject(e).then(resolve,reject);}
        }};return query;
    }};
  const window={crypto:{randomUUID:()=>`uuid-${++sequence}`},supabase:{createClient:()=>client},SUPABASE_URL:'https://unit.test'};
  vm.runInNewContext(code,{window,fetch:async(url,init)=>{fetches.push([url,clone({...init,body:JSON.parse(init.body)})]);return {ok:true,json:async()=>({choices:[{message:{content:'answer'}}]})};}});
  return {store:window.SaasStore,calls,fetches,pages,fail:e=>{error=e;},respond:r=>{response=r;}};
}
const rows=[{cod:'P',qty:2,source_order_index:0}];
const order={id:'order',num:'OC-1',data:'2026-09-19',clienteId:'customer',destId:null,righe:rows,ddtIds:['OLD'],note:'keep'};
const ddt={id:'ddt',num:'DDT-1',data:'2026-09-19',clienteId:'customer',ocId:'order',destId:null,righe:rows,custom:'preserve'};
const supplierDdt={id:'ddtf',num:'DDTF-1',data:'2026-09-19',fornitoreId:'supplier',ofId:'of',righe:rows,custom:'preserve'};
const raw={id:'saved',num:'SAVED',cliente_id:'customer',oc_id:'order',fornitore_id:'supplier',of_id:'of',righe:rows,extra:{custom:'retained'}};
const result={ddt:raw,ordine:raw,fattura:{...raw,ddtf_id:'ddtf',ddt_id:'ddt'}};

test('customer order wrapper sends exact canonical snapshot and preserves extra with no direct write',async()=>{
  const f=fixture({response:raw});const saved=await f.store.saveCustomerOrder('company',order,{...order,num:'OC-2'});
  assert.deepEqual(f.calls,[['update_customer_order',{p_company_id:'company',p_order_id:'order',
    p_expected:{num:'OC-1',data:'2026-09-19',cliente_id:'customer',dest_id:null,righe:rows,extra:{ddtIds:['OLD'],note:'keep'}},
    p_document:{num:'OC-2',data:'2026-09-19',cliente_id:'customer',dest_id:null,righe:rows,extra:{ddtIds:['OLD'],note:'keep'}}}]]);
  assert.equal(saved.clienteId,'customer');assert.equal(saved.custom,'retained');
});

test('supplier order canonical CAS includes separate invoice links and never falls back on rejection',async()=>{
  const f=fixture({response:raw});
  const expected={id:'of',num:'OF-1',data:'2026-09-19',fornitoreId:'supplier',righe:rows,ftfIds:['legacy'],ocId:'OC-1',note:'keep'};
  const saved=await f.store.saveSupplierOrder('company',expected,{...expected,num:'OF-2'});
  const snapshot={num:'OF-1',data:'2026-09-19',fornitore_id:'supplier',righe:rows,ftf_ids:['legacy'],extra:{ocId:'OC-1',note:'keep'}};
  assert.deepEqual(f.calls,[['update_supplier_order',{p_company_id:'company',p_order_id:'of',p_expected:snapshot,p_document:{...snapshot,num:'OF-2'}}]]);
  assert.equal(saved.fornitoreId,'supplier');assert.equal(saved.custom,'retained');
  f.fail(Error('ordine modificato'));await assert.rejects(f.store.saveSupplierOrder('company',expected,expected),/ordine modificato/);
});

test('customer lifecycle retry retains ID, changed reason gets new ID, cancellation has empty document and nullable order',async()=>{
  const f=fixture({response:{...result,ordine:null}});f.fail(Error('lost response'));
  await assert.rejects(f.store.changeCustomerDdt('company',ddt,ddt,'update','Correction'),/lost response/);
  f.fail(null);const saved=await f.store.changeCustomerDdt('company',ddt,ddt,'update','Correction');
  assert.equal(f.calls[0][1].p_request_id,f.calls[1][1].p_request_id);assert.equal(saved.ordine,null);
  assert.deepEqual(f.calls[1][1].p_expected,{num:'DDT-1',data:'2026-09-19',cliente_id:'customer',oc_id:'order',dest_id:null,righe:rows,extra:{custom:'preserve'}});
  await f.store.changeCustomerDdt('company',ddt,null,'cancel','Wrong delivery');
  assert.deepEqual(f.calls[2][1].p_document,{});assert.notEqual(f.calls[2][1].p_request_id,f.calls[1][1].p_request_id);
});

test('customer invoice contract sends normalized invoice guard snapshot and maps all result documents',async()=>{
  const f=fixture({response:result});const saved=await f.store.createCustomerInvoice('company',ddt,{...ddt,num:''},'explicit');
  assert.deepEqual(f.calls[0],['create_customer_invoice',{p_company_id:'company',p_ddt_id:'ddt',p_request_id:'explicit',
    p_expected_ddt:{cliente_id:'customer',oc_id:'order',righe:rows,extra:{ftId:null,annullato:false}},
    p_document:{num:null,data:'2026-09-19',cliente_id:'customer',oc_id:'order',dest_id:null,righe:rows}}]);
  assert.equal(saved.fattura.ddtId,'ddt');assert.equal(saved.ddt.ocId,'order');assert.equal(saved.ordine.custom,'retained');
});

test('supplier creation preserves expected rows and optional invoice link, result maps supplier entities',async()=>{
  const f=fixture({response:result});const saved=await f.store.createSupplierDdt('company',{id:'of',righe:rows},{...supplierDdt,fatturaId:'invoice'},'explicit');
  assert.deepEqual(f.calls[0],['create_supplier_ddt',{p_company_id:'company',p_order_id:'of',p_expected_rows:rows,p_request_id:'explicit',
    p_document:{num:'DDTF-1',data:'2026-09-19',fornitore_id:'supplier',righe:rows,fattura_id:'invoice'}}]);
  assert.equal(saved.ddt.fornitoreId,'supplier');assert.equal(saved.ordine.fornitoreId,'supplier');assert.equal(saved.fattura.ddtfId,'ddtf');
});

test('supplier correction uses canonical metadata; replay stable and explicit request IDs preserved',async()=>{
  const f=fixture({response:{...result,ordine:null,fattura:null}});
  await f.store.changeSupplierDdt('company',supplierDdt,supplierDdt,'update','Fix');
  await f.store.changeSupplierDdt('company',supplierDdt,supplierDdt,'update','Fix');
  assert.equal(f.calls[0][1].p_request_id,f.calls[1][1].p_request_id);
  assert.deepEqual(f.calls[0][1].p_expected,{num:'DDTF-1',data:'2026-09-19',fornitore_id:'supplier',of_id:'of',righe:rows,extra:{custom:'preserve'}});
  const canceled=await f.store.changeSupplierDdt('company',supplierDdt,null,'cancel','Wrong receipt','cancel-id');
  assert.equal(f.calls[2][1].p_request_id,'cancel-id');assert.deepEqual(f.calls[2][1].p_document,{});
  assert.equal(canceled.fattura,null);assert.equal(canceled.ordine,null);
});

test('every transactional wrapper propagates RPC failure without falling back to CRUD',async()=>{
  const f=fixture();f.fail(Error('RPC unavailable'));
  const operations=[()=>f.store.saveCustomerOrder('c',order,order),()=>f.store.changeCustomerDdt('c',ddt,ddt,'update',''),
    ()=>f.store.createCustomerInvoice('c',ddt,ddt),()=>f.store.createSupplierDdt('c',{id:'of',righe:rows},supplierDdt),
    ()=>f.store.changeSupplierDdt('c',supplierDdt,supplierDdt,'update','')];
  for(const call of operations)await assert.rejects(call(),/RPC unavailable/);
  assert.equal(f.calls.length,operations.length);
});

test('membership mutation wrappers call only the authorized RPC contracts and propagate errors',async()=>{
  const f=fixture();await f.store.updateMemberRole('company','user','viewer');await f.store.removeMember('company','user');await f.store.revokeInvite('invite');
  assert.deepEqual(f.calls,[['update_member_role',{p_company_id:'company',p_user_id:'user',p_role:'viewer'}],
    ['remove_member',{p_company_id:'company',p_user_id:'user'}],['revoke_invite',{p_invite_id:'invite'}]]);
  f.fail(Error('last admin'));await assert.rejects(f.store.removeMember('company','user'),/last admin/);
});

test('AI requests forward explicit retry identity and allocate fresh identities for independent calls',async()=>{
  const f=fixture(),messages=[{role:'user',content:'Synthetic prompt'}];
  for(let i=0;i<2;i++)assert.equal(await f.store.aiComplete(messages,{companyId:'company',requestId:'same-intent',reasoningEffort:'none'}),'answer');
  await f.store.aiComplete(messages,{companyId:'company'});await f.store.aiComplete(messages,{companyId:'company'});
  assert.equal(f.fetches[0][1].body.request_id,'same-intent');assert.equal(f.fetches[1][1].body.request_id,'same-intent');
  assert.notEqual(f.fetches[2][1].body.request_id,f.fetches[3][1].body.request_id);
  assert.equal(f.fetches[0][1].body.companyId,'company');assert.equal(f.fetches[0][1].body.reasoning_effort,'none');
  assert.equal(f.fetches[0][1].headers.Authorization,'Bearer test-token');
});

function many(n,company='company'){return Array.from({length:n},(_,i)=>({id:String(i+1).padStart(8,'0'),company_id:company,num:'D-'+i,extra:{kept:i}}));}

test('supplier invoice wrapper sends guarded snapshot and maps invoice result',async()=>{
  const f=fixture({response:result});const saved=await f.store.createSupplierInvoice('company',supplierDdt,supplierDdt,'invoice-id');
  assert.equal(f.calls[0][0],'create_supplier_invoice');
  assert.deepEqual(f.calls[0][1].p_expected_ddt,{fornitore_id:'supplier',of_id:'of',righe:rows,extra:{ftfId:null,annullato:false}});
  assert.equal(f.calls[0][1].p_request_id,'invoice-id');assert.equal(saved.fattura.ddtfId,'ddtf');
});

test('manual completion sends exact rows and preserves retry identity without CRUD fallback',async()=>{
  const f=fixture({response:raw});f.fail(Error('response lost'));
  await assert.rejects(f.store.completeOrderManually('company','customer',order,'Manual fixture'),/response lost/);
  f.fail(null);const saved=await f.store.completeOrderManually('company','customer',order,'Manual fixture');
  assert.equal(f.calls[1][0],'complete_order_manually');assert.deepEqual(f.calls[1][1].p_expected_rows,rows);
  assert.equal(f.calls[1][1].p_reason,'Manual fixture');assert.equal(f.calls[0][1].p_request_id,f.calls[1][1].p_request_id);
  assert.equal(saved.clienteId,'customer');
});

test('payment retries preserve identity; completed equal payments are separate operations',async()=>{
  const f=fixture({response:raw});f.fail(Error('response lost'));
  await assert.rejects(f.store.mutateInvoicePayment('c','customer',raw,'add',{data:'2026-09-19',importo:10}),/response lost/);
  f.fail(null);
  const saved=await f.store.mutateInvoicePayment('c','customer',raw,'add',{data:'2026-09-19',importo:10});
  assert.equal(saved.clienteId,'customer');assert.equal(f.calls[0][1].p_request_id,f.calls[1][1].p_request_id);
  await f.store.mutateInvoicePayment('c','customer',raw,'add',{data:'2026-09-19',importo:10});
  assert.notEqual(f.calls[1][1].p_request_id,f.calls[2][1].p_request_id);
});

test('simultaneous identical payment calls share one RPC and invalid kind fails closed',async()=>{
  const f=fixture({response:raw});
  const calls=Array.from({length:3},()=>f.store.mutateInvoicePayment('c','supplier',raw,'settle',{data:'2026-09-19'}));
  await Promise.all(calls);assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'mutate_invoice_payment');
  await assert.rejects(f.store.mutateInvoicePayment('c','bad',raw,'clear',{}),/Tipo fattura/);
  assert.equal(f.calls.length,1);
});
test('collection keyset pagination loads over 1000 rows once each and isolates the tenant',async()=>{
  const f=fixture({tables:{ddt:[...many(2401),...many(17,'foreign')]}});const docs=await f.store.loadCollection('ddt','company');
  assert.equal(docs.length,2401);assert.equal(new Set(docs.map(d=>d.id)).size,2401);assert.equal(docs.at(-1).kept,2400);
  assert.deepEqual(f.pages.map(p=>p.cursor),[null,'00001000','00002000','00002401']);
  assert.ok(f.pages.every(p=>p.size===1000&&p.filters[0][0]==='company_id'&&p.filters[0][1]==='company'));
});

test('loadCompany paginates every mapped collection and preserves complete aggregate results',async()=>{
  const f=fixture({tables:{}});
  const collectionTables=Object.values(f.store.COLLECTIONS).map(c=>c.table);
  const fake=Object.fromEntries(collectionTables.map(t=>[t,many(1001)]));
  const g=fixture({tables:fake});const company=await g.store.loadCompany('company');
  assert.equal(Object.keys(company).length,collectionTables.length);
  assert.ok(Object.values(company).every(rows=>rows.length===1001));
  assert.equal(g.pages.length,collectionTables.length*3);
});

test('pagination failure rejects partial collections instead of returning truncated data',async()=>{
  const f=fixture({tables:{ddt:many(2001)},pageError:(_q,n)=>n===2});
  await assert.rejects(f.store.loadCollection('ddt','company'),/page unavailable/);assert.equal(f.pages.length,2);
});

test('a lower server cap of 100 does not truncate a collection or skip any rows',async()=>{
  const f=fixture({tables:{ddt:many(1151)},serverCap:100});
  const rows=await f.store.loadCollection('ddt','company');
  assert.equal(rows.length,1151);assert.equal(new Set(rows.map(r=>r.id)).size,1151);
  assert.equal(f.pages.length,13);assert.equal(f.pages.at(-1).cursor,'00001151');
});

test('a backend that ignores the keyset cursor fails instead of looping forever',async()=>{
  const f=fixture({tables:{ddt:many(101)},serverCap:100,ignoreCursor:true});
  await assert.rejects(f.store.loadCollection('ddt','company'),/cursore.*non avanza/);
  assert.equal(f.pages.length,2);
});
