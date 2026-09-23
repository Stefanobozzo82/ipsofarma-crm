const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {webcrypto}=require('node:crypto');
const {corsForRequest}=require('../supabase/functions/_shared/cors.ts');
const source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../supabase/functions/ai-proxy/index.ts'),'utf8').replace(/^import .*;\r?\n/gm,''));
const body={companyId:'11111111-1111-4111-8111-111111111111',request_id:'22222222-2222-4222-8222-222222222222',model:'gemini-2.5-flash',messages:[{role:'user',content:'private test prompt'}],max_tokens:900};
function setup(options={}){
  let handler;const calls=[],rpc=[];
  const env={SUPABASE_URL:'https://db.example',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',GEMINI_API_KEY:'fake-provider-key'};
  vm.runInNewContext(source,{
    Request,Response,TextEncoder,TextDecoder,Uint8Array,AbortController,crypto:webcrypto,
    setTimeout: options.timeout?(fn=>setTimeout(fn,0)):setTimeout,clearTimeout,
    corsForRequest:req=>corsForRequest(req,'https://app.example'),
    Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn;}},
    createClient:(url,key)=>key==='service'?{rpc:async(name,args)=>{
      rpc.push({name,args});
      if(name==='finish_ai_attempt')return {error:options.finishError?{message:'private db info'}:null};
      return {data:options.reservation||{allowed:true,reserved:true,status:'pending'},error:options.reserveError?{message:'private db info'}:null};
    }}:{auth:{getUser:async()=>({data:{user:options.noSession?null:{id:'33333333-3333-4333-8333-333333333333'}},error:null})},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:options.foreign?null:{company_id:body.companyId},error:null})})},
    fetch:async(url,init)=>{
      calls.push({url,payload:JSON.parse(init.body),signal:init.signal});
      if(options.timeout)return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('timeout'))));
      if(options.networkError)throw new Error('private network info');
      return new Response(options.largeResponse?'x'.repeat(2*1024*1024+1):JSON.stringify(options.providerError?{error:'private provider details'}:{choices:[{message:{content:'answer'}}]}),{status:options.providerError?429:200});
    },
  });
  return {calls,rpc,request:(value=body,headers={})=>handler(new Request('https://edge.example',{method:'POST',headers:{Authorization:'Bearer test',Origin:'https://app.example','Content-Type':'application/json',...headers},body:JSON.stringify(value)}))};
}
test('real handler reserves before provider, bounds forwarded parameters and records success without content',async()=>{
  const s=setup();const r=await s.request({...body,n:100,stream:true,tools:[{}]});assert.equal(r.status,200);
  assert.equal(s.rpc[0].name,'reserve_ai_attempt');assert.match(s.rpc[0].args.p_request_hash,/^[a-f0-9]{64}$/);
  assert.equal(s.calls.length,1);assert.equal(s.calls[0].payload.n,undefined);assert.equal(s.calls[0].payload.stream,undefined);assert.equal(s.calls[0].payload.companyId,undefined);
  assert.equal(s.rpc[1].args.p_status,'succeeded');assert.ok(!JSON.stringify(s.rpc).includes('private test prompt'));
});
for(const [name,options,value,status] of [
  ['missing request id',{}, {...body,request_id:undefined},400],
  ['invalid model',{}, {...body,model:'expensive-other'},400],
  ['excess output tokens',{}, {...body,max_tokens:100000},400],
  ['non integer tokens',{}, {...body,max_tokens:3.5},400],
  ['invalid temperature',{}, {...body,temperature:9},400],
  ['too many messages',{}, {...body,messages:Array(61).fill(body.messages[0])},400],
  ['oversized text',{}, {...body,messages:[{role:'user',content:'x'.repeat(200001)}]},413],
  ['remote image URL',{}, {...body,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'https://private.example'}}]}]},400],
  ['wrong tenant',{foreign:true},body,403],
  ['expired session',{noSession:true},body,401],
  ['quota exhausted',{reservation:{allowed:false,reason:'quota'}},body,429],
  ['quota database unavailable',{reserveError:true},body,503],
  ['pending duplicate',{reservation:{allowed:true,reserved:false,status:'pending'}},body,409],
  ['successful duplicate',{reservation:{allowed:true,reserved:false,status:'succeeded'}},body,409],
])test(`real handler rejects ${name} without provider call`,async()=>{const s=setup(options);assert.equal((await s.request(value)).status,status);assert.equal(s.calls.length,0);});
test('actual streamed payload bound works without Content-Length',async()=>{
  const s=setup();const r=await s.request({...body,padding:'x'.repeat(20*1024*1024)});assert.equal(r.status,413);assert.equal(s.calls.length,0);
});
test('provider error recorded failed, safe error shown and attempt not repeated',async()=>{
  const s=setup({providerError:true}),r=await s.request();assert.equal(r.status,502);assert.equal(s.rpc[1].args.p_status,'failed');assert.equal(s.rpc[1].args.p_provider_status,429);assert.ok(!(await r.text()).includes('private provider details'));
});
for(const option of ['networkError','timeout','largeResponse'])test(`${option} recorded unknown and charged`,async()=>{
  const s=setup({[option]:true}),r=await s.request();assert.equal(r.status,option==='timeout'?504:502);assert.equal(s.rpc[1].args.p_status,'unknown');assert.equal(s.calls.length,1);
});
test('finish failure never pretends successful bookkeeping',async()=>{const s=setup({finishError:true}),r=await s.request();assert.equal(r.status,503);assert.ok(!(await r.text()).includes('private db info'));});
test('PDF/image import shape accepted with 8000 tokens and no reasoning',async()=>{
  const s=setup();const r=await s.request({...body,max_tokens:8000,model:'gemini-3.5-flash',reasoning_effort:'none',messages:[{role:'user',content:[{type:'text',text:'Read'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,YWJj'}}]}]});assert.equal(r.status,200);assert.equal(s.calls[0].payload.reasoning_effort,'none');
});
