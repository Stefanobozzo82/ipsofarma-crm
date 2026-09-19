const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../web/ddt-fornitore.html'),'utf8');
function listener(id){const marker=`$('${id}').addEventListener('`,start=html.indexOf(marker),body=html.indexOf('=> {',start)+4;return html.slice(body,html.indexOf('\n  });',body));}
test('supplier page inline scripts compile',()=>{for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);});
test('actual row reader retains zero source index and leaves new rows unmapped',()=>{
  const rows=[{dataset:{sourceOrderIndex:'0'}},{dataset:{}}];rows.forEach(r=>r.querySelector=s=>({value:({'.r-cod':'X','.r-descr':'Item','.r-qty':'2','.r-lotto':'L','.r-scad':''})[s]}));
  const ctx={$:()=>({querySelectorAll:()=>rows})};vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('  function readRighe(){'),html.indexOf('  // Scroll sulla nuova riga')),ctx);
  const actual=ctx.readRighe();assert.equal(actual[0].source_order_index,0);assert.ok(!('source_order_index'in actual[1]));
});
test('order residual prefill keeps original index after excluding exhausted duplicate code',()=>{
  const added=[],table={querySelectorAll:()=>[],innerHTML:''};
  const ctx={$:id=>id==='righe-body'?table:{value:'of1'},readRighe:()=>[],allOrdiniFornitoreById:{of1:{}},window:{SaasCascade:{residuoRighe:()=>[{cod:'X',residuo:0},{cod:'X',residuo:3}]}},addRigaRow:r=>added.push(r)};
  vm.runInNewContext(listener('f-ordine'),ctx);assert.equal(added[0].source_order_index,1);assert.equal(added[0].qty,3);
});
function form(options={}){
  const calls=[],ids=[];let count=0;
  const controls=Object.fromEntries(Object.entries({'f-fornitore':'s1','f-ordine':'of1','f-fattura':'','f-num':'SUP/1','f-data':'2026-09-19','f-save':''}).map(([id,value])=>[id,{value}]));
  const order={id:'of1',righe:[{cod:'X',qty:5}]},doc={id:'d1',num:'SUP/1',ofId:'of1',fornitoreId:'s1',righe:[{cod:'X',qty:2,source_order_index:0}]};
  const ctx={JSON,Number,crypto:{randomUUID:()=>`request-${++count}`},companyId:'company',editingId:options.edit?'d1':null,editingDdtf:options.edit?doc:null,
    $:id=>controls[id],readRighe:()=>doc.righe,allOrdiniFornitoreById:{of1:order},allFattureFornitoreById:{},fattureFornitorePerFornitore:{},setMsg:()=>{},renderList:async()=>{},openForm:async()=>{},closeForm:()=>{},
    store:{checkDocLimit:async()=>({ok:true}),saveDoc:()=>assert.fail('linked receipt must not use sequential saveDoc'),
      createSupplierDdt:async(...args)=>{calls.push(args);ids.push(args[3]);if(options.failOnce&&calls.length===1)throw Error('lost connection');return {ddt:doc,ordine:order};},
      changeSupplierDdt:async(...args)=>{calls.push(args);return {ddt:doc,ordine:order};}},
  };
  vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('  let pendingReceipt = null;'),html.indexOf('  let editingDdtf =')),ctx);
  vm.runInContext('async function runSave(){'+listener('f-save')+'}',ctx);
  return {ctx,calls,ids};
}
test('linked save uses one transactional creation and stable request on retry',async()=>{
  const f=form({failOnce:true});await f.ctx.runSave();await f.ctx.runSave();assert.equal(f.calls.length,2);assert.equal(f.ids[0],f.ids[1]);assert.equal(f.calls[0][1].id,'of1');
});
test('existing receipt uses lifecycle RPC with shared wrapper argument order',async()=>{
  const f=form({edit:true});await f.ctx.runSave();assert.equal(f.calls.length,1);assert.equal(f.calls[0][1].id,'d1');assert.equal(f.calls[0][2].ofId,'of1');assert.equal(f.calls[0][3],'update');
});
test('standalone partial invoice-link failure opens saved DDT before warning, without creating another document',async()=>{
  const f=form(),events=[],writes=[];
  f.ctx.$('f-ordine').value='';f.ctx.$('f-fattura').value='invoice';
  f.ctx.allFattureFornitoreById.invoice={id:'invoice',num:'INV/1',fornitoreId:'s1'};
  f.ctx.store.saveDoc=async(collection,document)=>{
    writes.push(collection);
    if(collection==='fattureFornitore')throw Error('invoice link unavailable');
    return {...document,id:'saved-ddt'};
  };
  f.ctx.openForm=async document=>{events.push('opened:'+document.id);f.ctx.editingId=document.id;f.ctx.editingDdtf=document;};
  f.ctx.setMsg=(message)=>{if(message)events.push(message);};
  await f.ctx.runSave();
  assert.deepEqual(writes,['ddtFornitore','fattureFornitore']);
  assert.equal(events[0],'opened:saved-ddt');assert.match(events[1],/DDT salvato.*non è completo/);
  assert.equal(f.ctx.editingId,'saved-ddt');
});
