const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function source(file,start,end){const s=fs.readFileSync(path.join(__dirname,'../web',file),'utf8');const a=s.indexOf(start),b=s.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return s.slice(a,b);}
for(const [file,party,cache] of [['note-credito.html','cliente','fatturePerCliente'],['note-credito-fornitore.html','fornitore','fatturePerFornitore']]){
  test(`${file} invoice prefill preserves zero VAT and defaults only missing VAT`,()=>{
    let handler;const rows=[];
    const elements={'f-fattura':{value:'invoice',addEventListener(n,fn){handler=fn;}},['f-'+party]:{value:'party'},'righe-body':{}};
    const c={$:id=>elements[id],readRighe:()=>[],addRigaRow:r=>rows.push(r),[cache]:{party:[{id:'invoice',righe:[{iva:0},{iva:10},{}]}]}};
    vm.runInNewContext(source(file,"  $('f-fattura').addEventListener('change'",file==='note-credito.html'?'  async function openForm':'  function openForm'),c);handler();
    assert.deepEqual(rows.map(r=>r.iva),[0,10,22]);
  });
}
test('supplier credit edit preserves original extra fields through actual save handler',async()=>{
  let handler,saved;const original={id:'nc',legacyTag:'keep',ftfId:'old-number',custom:{a:1}};
  const elements=Object.fromEntries(Object.entries({'f-fornitore':'supplier','f-fattura':'invoice','f-num':'NC-1','f-data':'2026-09-19'}).map(([k,value])=>[k,{value}]));
  elements['f-save']={addEventListener(n,fn){handler=fn;}};
  const c={pendingCredit:null,crypto:{randomUUID:()=> 'credit-request'},$:id=>elements[id],editingId:'nc',editingNc:original,companyId:'company',readRighe:()=>[{qty:1,iva:0}],setMsg(){},closeForm(){},async renderList(){},store:{async saveCreditNote(company,kind,expected,doc,request){assert.equal(company,'company');assert.equal(kind,'supplier');assert.equal(expected,original);assert.equal(request,'credit-request');saved=doc;}}};
  vm.runInNewContext(source('note-credito-fornitore.html',"  $('f-save').addEventListener('click'",'  // Scarica'),c);await handler();
  assert.equal(saved.legacyTag,'keep');assert.deepEqual(saved.custom,{a:1});assert.equal(saved.ftfId,'old-number');assert.equal(saved.fatturaId,'invoice');assert.equal(original.fatturaId,undefined);
});
