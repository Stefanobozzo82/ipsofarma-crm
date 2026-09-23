const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'../web',p),'utf8');
const invoice={id:'invoice',num:'FT-1',data:'2026-09-19',righe:[{cod:'ZERO',descr:'Zero VAT',qty:2,prezzo:50,iva:0}]};
function printFixture(){let sheet;const window={XLSX:{utils:{aoa_to_sheet(data){sheet=data;return{};},book_new(){return{};},book_append_sheet(){}},writeFile(){}}};vm.runInNewContext(read('app/print.js'),{window,document:{getElementById:()=>({})}});return {print:window.SaasPrint,sheet:()=>sheet};}
test('printed zero VAT line total remains net instead of adding 22 percent',()=>{
  const {print}=printFixture();const html=print.buildPrintHTML('fattureCliente',invoice,{},{});
  assert.match(html,/0%/);assert.doesNotMatch(html,/122,00/);assert.match(html,/100,00/);
});
test('Excel export zero VAT line agrees with the document total',async()=>{
  const f=printFixture();await f.print.downloadExcel('fattureCliente',invoice,{},{});
  const row=f.sheet().find(r=>r[0]==='ZERO');assert.equal(row.at(-2),0);assert.equal(row.at(-1),100);
  assert.equal(f.sheet().find(r=>r[0]==='Totale documento')[1],100);
});
test('invoice DDT selection prefill preserves zero VAT and source index',()=>{
  const html=read('fatture.html'),a=html.indexOf("  $('f-ddt').addEventListener('change'"),b=html.indexOf('  async function openForm',a);let handler;const rows=[];
  const elements={'f-ddt':{value:'ddt',addEventListener(n,fn){handler=fn;}},'f-dest':{},'f-ordine':{},'righe-body':{}};
  vm.runInNewContext(html.slice(a,b),{$:id=>elements[id],readRighe:()=>[],allDdtById:{ddt:{righe:invoice.righe}},addRigaRow:r=>rows.push(r)});handler();
  assert.equal(rows[0].iva,0);assert.equal(rows[0].source_ddt_index,0);
});
test('supplier order cascade uses catalog zero VAT then row zero VAT before default',async()=>{
  const window={};vm.runInNewContext(read('app/cascade.js'),{window});
  for(const [catalogVat,rowVat,expected] of [[0,22,0],[null,0,0],[undefined,undefined,22]]){
    const writes=[];const store={async loadCollection(){return[];},async searchProdotti(){return[{cod:'ZERO',fornitoreId:'supplier',iva:catalogVat}];},async nextNumber(){return'OF-1';},async saveDoc(coll,doc){writes.push([coll,doc]);return doc;}};
    await window.SaasCascade.generaOrdiniFornitore(store,'company',{id:'order',num:'OC-1',righe:[{cod:'ZERO',qty:2,iva:rowVat}]});
    assert.equal(writes.find(([coll])=>coll==='ordiniFornitore')[1].righe[0].iva,expected);
  }
});
test('FatturaPA parsed zero VAT is preserved, missing VAT uses default',()=>{
  const html=read('app/fatturapa-xml.js');const a=html.indexOf('  function parseRiga('),b=html.indexOf('\n  // Ragione sociale',a);
  const c={altriDatoIncludes:()=>null,firstText:(row,key)=>row[key]??'',codFromLinea:()=>'',scontoFromLinea:()=>''};vm.createContext(c);vm.runInContext(html.slice(a,b),c);
  assert.equal(c.parseRiga({AliquotaIVA:'0.00'}).iva,0);assert.equal(c.parseRiga({}).iva,22);assert.equal(c.parseRiga({AliquotaIVA:'10'}).iva,10);
});
