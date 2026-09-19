const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const [page,prefix,kind] of [['ordini','oc','customer'],['ordini-fornitore','of','supplier']]){
 const source=fs.readFileSync(path.join(__dirname,'../web/'+page+'.html'),'utf8');
 const start=source.indexOf(`  $('${prefix}-btn-chiudi').addEventListener`),end=source.indexOf('\n  });',start)+6;
 function fixture(reason='Motivo di prova',fail=false){
  const calls=[],alerts=[],btn={disabled:false,addEventListener:(e,fn)=>ctx.run=fn};
  const order={id:'order',righe:[{cod:'A',qty:10,qtyEv:3}]};
  const ctx={editingOrder:order,companyId:'company',$:()=>btn,confirm:()=>true,prompt:()=>reason,alert:m=>alerts.push(m),
   openForm:async d=>calls.push(['open',d]),store:{completeOrderManually:async(...args)=>{calls.push(args);if(fail)throw Error('stale');return {...order,righe:[{cod:'A',qty:10,qtyEv:10}]};},saveDoc:()=>assert.fail('direct write')}};
  vm.runInNewContext(source.slice(start,end),ctx);return {ctx,calls,alerts,btn,order};
 }
 test(page+' manual completion records reason and uses the server result',async()=>{
  const f=fixture();await f.ctx.run();assert.equal(f.calls[0][1],kind);assert.equal(f.calls[0][3],'Motivo di prova');assert.equal(f.calls[1][1].righe[0].qtyEv,10);assert.equal(f.order.righe[0].qtyEv,3);assert.equal(f.btn.disabled,false);
 });
 test(page+' cancellation or short reason never writes',async()=>{
  for(const reason of [null,'  ']){const f=fixture(reason);await f.ctx.run();assert.equal(f.calls.length,0);}
 });
 test(page+' stale completion preserves original document and unlocks button',async()=>{
  const f=fixture('Motivo',true);await f.ctx.run();assert.equal(f.calls.length,1);assert.match(f.alerts[0],/stale/);assert.equal(f.btn.disabled,false);
 });
}
