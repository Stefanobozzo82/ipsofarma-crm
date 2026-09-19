const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/app/cascade.js'),'utf8'),{window});
test('invoice cascade routes eligible DDT through RPC with stable row positions and no direct writes',async()=>{
 const calls=[];const order={id:'O'};const store={createCustomerInvoice:async(c,d,doc)=>{calls.push({c,d,doc});return {fattura:{num:'F'},ordine:{id:'O',ftId:'F'}};},saveDoc:()=>assert.fail('direct write'),nextNumber:()=>assert.fail('separate counter')};
 const result=await window.SaasCascade.creaFattureDaOrdine(store,'C',order,[{id:'D',ocId:'O',clienteId:'CL',righe:[{cod:'A',qty:1},{cod:'A',qty:2}]},{id:'cancelled',ocId:'O',annullato:true},{id:'invoiced',ocId:'O',ftId:'F0'},{id:'other',ocId:'X'}]);
 assert.equal(calls.length,1);assert.deepEqual(Array.from(calls[0].doc.righe,r=>r.source_ddt_index),[0,1]);assert.equal(result.fatture[0].num,'F');assert.equal(result.ordine.ftId,'F');
});
test('invoice RPC failure propagates without fallback',async()=>{await assert.rejects(window.SaasCascade.creaFattureDaOrdine({createCustomerInvoice:async()=>{throw Error('missing migration');}},'C',{id:'O'},[{ocId:'O',righe:[]}]),/missing migration/);});
