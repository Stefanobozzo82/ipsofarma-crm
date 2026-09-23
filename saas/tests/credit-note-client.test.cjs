const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('invoice credit calculation excludes cancelled notes',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../web/fatture.html'),'utf8');
 const start=html.indexOf('  function creditoNotaCredito('),end=html.indexOf('\n  }',start)+4;
 const ctx={noteCreditoArr:[{fatturaId:'f',righe:[10]},{fatturaId:'f',righe:[20],annullato:true}],docTotale:r=>r[0]};
 vm.runInNewContext(html.slice(start,end),ctx);assert.equal(ctx.creditoNotaCredito({id:'f'}),10);
});
for(const [file,kind,party] of [['note-credito.html','customer','cliente'],['note-credito-fornitore.html','supplier','fornitore']]){
const html=fs.readFileSync(path.join(__dirname,'../web',file),'utf8');
test(kind+' credit inline scripts compile',()=>{for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);});
test(kind+' save uses atomic RPC with original snapshot and guards cancelled notes',async()=>{
const nodes={},calls=[];const original={id:'n1',num:'NC1',keep:'metadata',annullato:false};
const ctx={pendingCredit:null,crypto:{randomUUID:()=> 'request'},companyId:'c1',editingNc:original,$:id=>nodes[id]??={value:({'f-cliente':'c','f-fornitore':'s','f-fattura':'f','f-data':'2026-09-19','f-num':'N1'})[id]||'',disabled:false},readRighe:()=>[{cod:'X',qty:1,iva:0}],setMsg:()=>{},closeForm:()=>{},renderList:async()=>{},store:{saveCreditNote:async(...a)=>calls.push(a)}};
const start=html.indexOf("  $('f-save').addEventListener"),body=html.indexOf('async () => {',start)+13,end=html.indexOf('\n  });',body);
vm.createContext(ctx);vm.runInContext('async function save(){'+html.slice(body,end)+'}',ctx);await ctx.save();assert.equal(calls.length,1);assert.equal(calls[0][1],kind);assert.equal(calls[0][2],original);assert.equal(calls[0][3].keep,'metadata');assert.equal(calls[0][3].righe[0].iva,0);
ctx.editingNc={...original,annullato:true};await ctx.save();assert.equal(calls.length,1);
});
test(kind+' read rows preserves metadata and zero VAT',()=>{
 const vals={'.r-cod':'X','.r-descr':'x','.r-lotto':'lot','.r-scad':'','.r-qty':'2','.r-prezzo':'3','.r-sconto':'','.r-iva':'0'};
 const tr={_original:{metadata:'keep',iva:22},querySelector:q=>({value:vals[q]})};const ctx={$:()=>({querySelectorAll:()=>[tr]})};
 vm.runInNewContext(html.slice(html.indexOf('  function readRighe(){'),html.indexOf('  // Stessa aritmetica')),ctx);
 const r=ctx.readRighe()[0];assert.equal(r.iva,0);assert.equal(r.metadata,'keep');
});
test(kind+' cancel sends reason and expected note, without deleting it',async()=>{
 const note={id:'n1',num:'N1'},calls=[],btn={dataset:{del:'n1'}};
 const ctx={btn,elenco:[note],companyId:'c1',prompt:()=> 'Errore di emissione',alert:()=>{},renderList:async()=>{},store:{cancelCreditNote:async(...a)=>calls.push(a)}};
 const start=html.indexOf("      const n = elenco.find(x => x.id === btn.dataset.del);"),end=html.indexOf('\n    }));',start);
 vm.createContext(ctx);vm.runInContext('async function cancel(){'+html.slice(start,end)+'}',ctx);await ctx.cancel();
 assert.equal(calls[0][1],kind);assert.equal(calls[0][2],note);assert.equal(calls[0][3],'Errore di emissione');
 note.annullato=true;await ctx.cancel();assert.equal(calls.length,1);
});
}
test('credit wrappers map snapshots, preserve metadata and reuse automatic request identity on retry',async()=>{
const calls=[];let count=0;const window={crypto:{randomUUID:()=> 'request-'+(++count)},supabase:{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});if(calls.length===1)return {error:Error('network')};return {data:{id:'n',num:'NC',cliente_id:'c',righe:[],extra:{annullato:true}}};}})}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/app/store.js'),'utf8'),{window});const doc={clienteId:'c',fatturaId:null,num:null,data:'2026-09-19',righe:[{iva:0}],custom:'keep'};
await assert.rejects(window.SaasStore.saveCreditNote('company','customer',null,doc));await window.SaasStore.saveCreditNote('company','customer',null,doc);
assert.equal(calls[0].args.p_request_id,calls[1].args.p_request_id);assert.equal(calls[1].args.p_document.extra.custom,'keep');assert.equal(calls[1].args.p_document.cliente_id,'c');assert.equal(calls[1].args.p_expected,null);
const result=await window.SaasStore.cancelCreditNote('company','customer',{...doc,id:'n'},'Errore','cancel-id');assert.equal(result.annullato,true);assert.equal(calls[2].args.p_expected.id,'n');assert.equal(calls[2].args.p_reason,'Errore');
});
