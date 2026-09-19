const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../web/fatture.html'),'utf8');
const start=html.indexOf('  async function addPagamento('),end=html.indexOf('  function closeForm()',start);
function fixture(failure=false){
 const calls=[],alerts=[];const ctx={companyId:'company',editingFattura:{id:'invoice',pagamenti:[{payment_id:'p1',data:'2026-09-19',importo:10}]},
  today:()=> '2026-09-19',alert:m=>alerts.push(m),renderPagamenti:()=>{},renderList:async()=>{},
  store:{saveDoc:()=>assert.fail('stale whole-invoice write'),mutateInvoicePayment:async(...args)=>{calls.push(JSON.parse(JSON.stringify(args)));if(failure)throw Error('denied');return {id:'invoice',pagamenti:[{payment_id:'server',importo:15}]};}}};
 vm.runInNewContext(html.slice(start,end),ctx);return {ctx,calls,alerts};
}
test('payment form sends add and settle commands without computing replacement arrays',async()=>{
 const f=fixture();await f.ctx.addPagamento('5.555','2026-09-19');
 assert.equal(f.calls[0][3],'add');assert.deepEqual(f.calls[0][4],{data:'2026-09-19',importo:5.56});
 assert.equal(f.ctx.editingFattura.pagamenti[0].payment_id,'server');
 await f.ctx.addPagamento(20,'2026-09-19',true);assert.equal(f.calls[1][3],'settle');assert.deepEqual(f.calls[1][4],{data:'2026-09-19'});
});
test('payment removal uses durable entry ID and legacy exact snapshot',async()=>{
 const f=fixture();await f.ctx.delPagamento(0);assert.deepEqual(f.calls[0][4],{payment_id:'p1'});
 f.ctx.editingFattura={id:'legacy',pagamenti:[{data:'2026-09-19',importo:10}]};
 await f.ctx.delPagamento(0);assert.deepEqual(f.calls[1][4],{index:0,expected_payments:[{data:'2026-09-19',importo:10}]});
});
test('payment error preserves displayed invoice and reports failure',async()=>{
 const f=fixture(true);await f.ctx.addPagamento(5,'2026-09-19');
 assert.equal(f.ctx.editingFattura.pagamenti[0].payment_id,'p1');assert.match(f.alerts[0],/denied/);
});
