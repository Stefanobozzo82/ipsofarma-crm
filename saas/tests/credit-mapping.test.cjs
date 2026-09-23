const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const invoices=[{id:'uuid-1',num:'FT/1',data:'2026-01-01',righe:[{amount:100}]},{id:'uuid-2',num:'FT/2',data:'2026-02-01',righe:[{amount:100}]}];
function contextFor(file){
  const html=fs.readFileSync(path.join(__dirname,'../web',file),'utf8');
  const start=html.indexOf('  function ncCreditoFor(');
  const end=html.indexOf('\n  function ',html.indexOf('  function supplierCreditFor(',start)+10);
  assert.ok(start>=0&&end>start);
  const c={tot:rows=>rows.reduce((s,r)=>s+r.amount,0),fattureCache:invoices,fattureCliente:invoices,DB:{fattureCliente:invoices}};
  vm.createContext(c);vm.runInContext(html.slice(start,end),c);
  c.payTot=()=>0;
  c.noteCredito=[{fatturaId:'uuid-1',righe:[{amount:40}]}];
  c.noteCreditoFornitore=[{fatturaId:'uuid-1',righe:[{amount:25}]}];
  const fn=file==='assistente-ai.html'?'residuo':'payState';
  const source=html.match(new RegExp('^  function '+fn+'\\([^]*?^  }','m'));
  assert.ok(source);vm.runInContext(source[0],c);
  return c;
}
for(const file of ['scadenziario.html','riconciliazione.html','dashboard.html','assistente-ai.html']){
  test(`${file}: actual balance caller passes invoice identity to credit resolver`,()=>{
    const c=contextFor(file),invoice=invoices[0];
    if(file==='assistente-ai.html') assert.equal(c.residuo(invoice,c.noteCredito,invoices),60);
    else if(file==='scadenziario.html') assert.equal(c.payState(invoice,c.noteCredito).residuo,60);
    else if(file==='riconciliazione.html'){
      assert.equal(c.payState(invoice,false).residuo,60);
      assert.equal(c.payState(invoice,true).residuo,75);
    }else{
      assert.equal(c.payState(invoice,c.noteCredito,c.noteCreditoFornitore,false).residuo,60);
      assert.equal(c.payState(invoice,c.noteCredito,c.noteCreditoFornitore,true).residuo,75);
    }
  });
  test(`${file}: current UUID credit wins over conflicting legacy links`,()=>{
    const c=contextFor(file),nc={fatturaId:'uuid-1',ftId:'FT/2',righe:[{amount:40}]};
    assert.equal(c.ncCreditoFor(nc,invoices[0],invoices),40);
    assert.equal(c.ncCreditoFor(nc,invoices[1],invoices),0);
    assert.equal(c.ncCreditoFor({...nc,annullato:true},invoices[0],invoices),0);
  });
  test(`${file}: legacy multi-invoice allocation remains chronological without duplicate allocation`,()=>{
    const c=contextFor(file),nc={ftIds:['FT/2','FT/1','FT/1'],righe:[{amount:150}]};
    assert.equal(c.ncCreditoFor(nc,invoices[0],invoices),100);
    assert.equal(c.ncCreditoFor(nc,invoices[1],invoices),50);
    assert.equal(c.ncCreditoFor({ftId:'FT/1',righe:[{amount:20}]},invoices[0],invoices),20);
  });
  test(`${file}: supplier UUID and legacy links both work, authoritative UUID never falls back`,()=>{
    const c=contextFor(file),nc={fatturaId:'uuid-1',ftfId:'FT/2',righe:[{amount:25}]};
    assert.equal(c.supplierCreditFor(nc,invoices[0]),25);
    assert.equal(c.supplierCreditFor(nc,invoices[1]),0);
    assert.equal(c.supplierCreditFor({ftfId:'FT/1',righe:nc.righe},invoices[0]),25);
    assert.equal(c.supplierCreditFor({...nc,annullato:true},invoices[0]),0);
  });
}
