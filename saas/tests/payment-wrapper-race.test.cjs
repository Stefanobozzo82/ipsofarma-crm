const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('older explicit payment completion cannot discard a newer in-flight request',async()=>{
 const calls=[];let sequence=0;const window={crypto:{randomUUID:()=>`generated-${++sequence}`},supabase:{createClient:()=>({rpc:(name,args)=>new Promise(resolve=>calls.push({name,args,resolve}))})}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/app/store.js'),'utf8'),{window});
 const invoke=id=>window.SaasStore.mutateInvoicePayment('company','supplier',{id:'invoice'},'add',{data:'2026-09-19',importo:10},id);
 const first=invoke('first'),second=invoke('second');assert.equal(calls.length,2);
 calls[0].resolve({data:{id:'invoice',extra:{}}});await first;
 const joined=invoke();assert.equal(calls.length,2,'implicit retry must join newer pending operation');
 calls[1].resolve({data:{id:'invoice',extra:{}}});await Promise.all([second,joined]);
 const next=invoke();assert.equal(calls.length,3);assert.notEqual(calls[2].args.p_request_id,'second');
 calls[2].resolve({data:{id:'invoice',extra:{}}});await next;
});
