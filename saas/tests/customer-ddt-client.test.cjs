const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const calls = [];
  let count = 0, error = null;
  const window = { crypto: { randomUUID: () => `request-${++count}` }, supabase: { createClient: () => ({
    async rpc(name, args) {
      calls.push([name, clone(args)]);
      return { error, data: { ddt: { id:'ddt-id', num:'DDT/2026/0001', cliente_id:'client', oc_id:'order', righe:args.p_document.righe, extra:{ retained:true } },
        ordine: { id:'order', cliente_id:'client', righe:args.p_expected_rows, extra:{ ddtIds:['DDT/2026/0001'] } } } };
    },
    from() { throw Error('Direct writes must not occur'); },
  }) } };
  for (const name of ['store','cascade']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../web/app/${name}.js`),'utf8'),{window});
  return { store:window.SaasStore, cascade:window.SaasCascade, calls, fail(value) { error=value; } };
}
const order = () => ({ id:'order', clienteId:'client', righe:[{cod:'A',qty:4,qtyEv:1}] });
const doc = () => ({ clienteId:'client', data:'2026-09-19', righe:[{cod:'A',qty:3,source_order_index:0}] });

test('wrapper sends tenant/order/snapshot and maps raw PostgreSQL results without discarding extra',async()=>{
  const f=fixture();
  const result=await f.store.createCustomerDdt('company',order(),doc(),'explicit-id');
  assert.deepEqual(f.calls,[['create_customer_ddt',{
    p_company_id:'company',p_order_id:'order',p_expected_rows:order().righe,p_request_id:'explicit-id',
    p_document:{data:'2026-09-19',num:null,cliente_id:'client',dest_id:null,righe:doc().righe},
  }]]);
  assert.equal(result.ddt.clienteId,'client'); assert.equal(result.ddt.ocId,'order'); assert.equal(result.ddt.retained,true);
  assert.deepEqual(clone(result.ordine.ddtIds),['DDT/2026/0001']);
});

test('network retry and repeated success keep request identity; changed payload or snapshot gets a new ID',async()=>{
  const f=fixture(); f.fail(Error('Lost response'));
  await assert.rejects(f.store.createCustomerDdt('company',order(),doc()),/Lost response/);
  f.fail(null);
  await f.store.createCustomerDdt('company',order(),doc());
  await f.store.createCustomerDdt('company',order(),doc());
  assert.deepEqual(f.calls.map(c=>c[1].p_request_id),['request-1','request-1','request-1']);
  await f.store.createCustomerDdt('company',order(),{...doc(),num:'MANUAL-9'});
  assert.equal(f.calls.at(-1)[1].p_document.num,'MANUAL-9');
  assert.equal(f.calls.at(-1)[1].p_request_id,'request-2');
  const changed=order(); changed.righe[0].qtyEv=2;
  await f.store.createCustomerDdt('company',changed,doc());
  assert.equal(f.calls.at(-1)[1].p_request_id,'request-3');
});

test('headless creation preserves original indexes through residual filtering and duplicate product rows',async()=>{
  const f=fixture();
  const oc={...order(),righe:[{cod:'A',qty:2,qtyEv:2},{cod:'A',qty:5,qtyEv:1},{cod:'A',qty:3}],destId:'destination'};
  const original=clone(oc);
  await f.cascade.creaDDTDaResiduo(f.store,'company',oc);
  const payload=f.calls[0][1];
  assert.deepEqual(payload.p_document.righe.map(r=>[r.source_order_index,r.qty]),[[1,4],[2,3]]);
  assert.equal(payload.p_document.dest_id,'destination'); assert.equal(payload.p_document.num,null);
  assert.deepEqual(oc,original);
  await f.cascade.creaDDTDaResiduo(f.store,'company',oc);
  assert.equal(f.calls[1][1].p_request_id,payload.p_request_id);
});

test('lot splits preserve the order source index on every resulting DDT row',async()=>{
  const f=fixture();
  const fake={...f.store,loadCollection:async name=>({
    ordiniFornitore:[{id:'of-id',num:'OF-1'}],
    ddtFornitore:[{ofId:'of-id',data:'2026-09-01',righe:[{cod:'A',qty:1,lotto:'L1'},{cod:'A',qty:2,lotto:'L2'}]}],fattureFornitore:[],
  })[name]};
  await f.cascade.creaDDTDaResiduo(fake,'company',{...order(),ofIds:['OF-1']});
  assert.deepEqual(f.calls[0][1].p_document.righe.map(r=>[r.source_order_index,r.qty,r.lotto]),[[0,1,'L1'],[0,2,'L2']]);
});

test('complete orders do nothing and RPC failure never falls back to separate writes',async()=>{
  const f=fixture();
  assert.equal(await f.cascade.creaDDTDaResiduo(f.store,'company',{...order(),righe:[{cod:'A',qty:1,qtyEv:1}]}),null);
  assert.equal(f.calls.length,0);
  f.fail(Error('RPC unavailable'));
  await assert.rejects(f.cascade.creaDDTDaResiduo(f.store,'company',order()),/RPC unavailable/);
  assert.equal(f.calls.length,1);
});
