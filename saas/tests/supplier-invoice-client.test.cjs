const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../web/fatture-fornitore.html'),'utf8');
function listener(id){const marker=`$('${id}').addEventListener('`,start=html.indexOf(marker),body=html.indexOf('=> {',start)+4;return html.slice(body,html.indexOf('\n  });',body));}
test('supplier invoice inline scripts compile',()=>{for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);});
test('DDT prefill preserves duplicate-row index and corresponding order price',()=>{
 const added=[],table={querySelectorAll:()=>[],innerHTML:''};const ddt={ofId:'o1',righe:[{cod:'X',qty:1,source_order_index:0},{cod:'X',qty:2,source_order_index:1}]};
 const ctx={$:id=>id==='righe-body'?table:{value:id==='f-fornitore'?'s1':id==='f-ddtf'?'d1':''},readRighe:()=>[],allDdtfById:{d1:ddt},ordiniPerFornitore:{s1:[{id:'o1',righe:[{cod:'X',prezzo:10},{cod:'X',prezzo:20}]}]},addRigaRow:r=>added.push(r),refreshCmpOrdine:()=>{}};
 vm.runInNewContext('(function(){'+listener('f-ddtf')+'})()',ctx);assert.deepEqual(added.map(r=>r.source_ddt_index),[0,1]);assert.deepEqual(added.map(r=>r.prezzo),[10,20]);
});
test('linked invoice save performs one RPC and reuses request ID after uncertain failure',async()=>{
 let seq=0;const calls=[],controls=Object.fromEntries(Object.entries({'f-fornitore':'s1','f-ordine':'o1','f-ddtf':'d1','f-num':'INV/1','f-data':'2026-09-19','f-save':''}).map(([id,value])=>[id,{value}]));
 const ddt={id:'d1',ofId:'o1',fornitoreId:'s1',righe:[{cod:'X',qty:2}]};
 const ctx={JSON,crypto:{randomUUID:()=>`id-${++seq}`},companyId:'c1',editingId:null,editingFattura:null,$:id=>controls[id],readRighe:()=>[{cod:'X',qty:2,source_ddt_index:0}],allDdtfById:{d1:ddt},ordiniPerFornitore:{s1:[{id:'o1'}]},setMsg:()=>{},closeForm:()=>{},renderList:async()=>{},store:{checkDocLimit:async()=>({ok:true}),saveDoc:()=>assert.fail('linked invoice must not use direct save'),createSupplierInvoice:async(...args)=>{calls.push(args);if(calls.length===1)throw Error('network');return {fattura:{id:'f1'},ddt,ordine:{id:'o1'}};}}};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('  let pendingInvoice = null;'),html.indexOf('  let editingFattura =')),ctx);vm.runInContext('async function runSave(){'+listener('f-save')+'}',ctx);
 await ctx.runSave();await ctx.runSave();assert.equal(calls.length,2);assert.equal(calls[0][3],calls[1][3]);
});
test('supplier payment buttons use payment RPC and clear includes optimistic payment snapshot',async()=>{
 const calls=[],invoice={id:'f1',paid:true,paidDate:'2026-09-18',pagamenti:[{importo:10,data:'2026-09-18'}]};
 const ctx={companyId:'c1',today:()=> '2026-09-19',store:{mutateInvoicePayment:async(...args)=>calls.push(args)},renderList:async()=>{},PICK:new Set(['f1'])};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('  async function setSupplierPaid'),html.indexOf('  function deselectAll')),ctx);
 await ctx.togglePaid(invoice);assert.equal(calls[0][1],'supplier');assert.equal(calls[0][3],'clear');assert.equal(calls[0][4].expected_payments,invoice.pagamenti);
 await ctx.bulkMarkPaid(true,{f1:invoice});assert.equal(calls[1][3],'settle');assert.equal(calls[1][4].data,'2026-09-19');
});
test('standalone supplier receipt wrapper maps linked invoice and keeps explicit request identity',async()=>{
 const calls=[];const window={crypto:{randomUUID:()=> 'generated'},supabase:{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{ddt:{id:'d1',fornitore_id:'s1',extra:{ftfId:'INV'}},ordine:null,fattura:{id:'f1',fornitore_id:'s1',ddtf_id:'d1',extra:{}}},error:null};}})}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/app/store.js'),'utf8'),{window});
 const result=await window.SaasStore.createStandaloneSupplierDdt('c1',{num:'D1',data:'2026-09-19',fornitoreId:'s1',fatturaId:'f1',righe:[{cod:'X',qty:1}]},'explicit-request');
 assert.equal(calls[0].name,'create_standalone_supplier_ddt');assert.equal(calls[0].args.p_request_id,'explicit-request');assert.equal(calls[0].args.p_document.fattura_id,'f1');assert.equal(result.ddt.ftfId,'INV');assert.equal(result.fattura.ddtfId,'d1');assert.equal(result.ordine,null);
});
