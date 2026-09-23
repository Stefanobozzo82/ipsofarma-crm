const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../web/ordini-fornitore.html'),'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function between(start,end) {
  const a=html.indexOf(start), b=html.indexOf(end,a+start.length);
  if(a<0||b<0) throw Error(`Source boundary missing: ${start}`);
  return html.slice(a,b);
}
const rowsCode=between('  function readRighe(){','  // Stessa aritmetica');
const saveCode=between("  $('f-save').addEventListener('click'",'  let fornitoriById');

test('rendered row carries original zero index and readRighe recovers it',()=>{
  const c={esc:value=>String(value??''),evasioneCellsHtml:()=>''};vm.createContext(c);
  vm.runInContext(between('  function rigaRowHtml(r){','  function addRigaRow(r){'),c);
  assert.match(c.rigaRowHtml({_editorSourceIndex:0}),/data-source-order-index="0"/);
  assert.doesNotMatch(c.rigaRowHtml({}),/data-source-order-index/);
  const f=fixture();assert.equal(f.context.readRighe()[0].source_order_index,0);
});

function domRow(index,overrides={}) {
  const values={cod:'A',descr:'Product',qty:10,prezzo:5,sconto:'',iva:22,...overrides};
  return {dataset:index===undefined?{}:{sourceOrderIndex:String(index)},
    querySelector(selector){return {value:String(values[selector.slice(3)])};}};
}
function fixture({rows=[domRow(0),domRow(1)],error=null,isNew=false}={}) {
  const previous={id:'order',num:'OC/2026/0001',clienteId:'client',destId:null,data:'2026-09-19',
    righe:[{cod:'A',descr:'First',qty:10,qtyEv:0,custom:'first'},
      {cod:'A',descr:'Second',qty:10,qtyEv:5,custom:'second'}],ddtIds:['DDT-old'],note:'Preserve'};
  const elements=Object.fromEntries(Object.entries({'f-fornitore':'client','f-data':'2026-09-19','f-num':'OC/2026/0001'}).map(([id,value])=>[id,{value}]));
  let click; const calls=[],messages=[];
  elements['f-save']={disabled:false,addEventListener(name,fn){assert.equal(name,'click');click=fn;}};
  elements['righe-body']={querySelectorAll(){return rows;}};
  const context={$:id=>elements[id],companyId:'company',editingId:isNew?null:'order',editingOrder:isNew?null:previous,
    store:{async checkDocLimit(){return {ok:true};},
      async saveSupplierOrder(...args){calls.push(['rpc',args]);if(error)throw error;return args[2];},
      async saveDoc(...args){calls.push(['saveDoc',args]);},
      async bumpCounterPast(...args){calls.push(['bump',args]);},
      async nextNumber(){calls.push(['next']);return 'OC/2026/0003';}},
    setMsg(...args){messages.push(args);},closeForm(){calls.push(['close']);},async renderList(){calls.push(['render']);},
  };
  vm.createContext(context); vm.runInContext(rowsCode+'\n'+saveCode,context);
  return {context,click,calls,messages,elements,previous};
}

test('duplicate product rows preserve zero and delivered quantities with original metadata, not truthy queues',async()=>{
  const f=fixture();const original=clone(f.previous);await f.click();
  assert.deepEqual(f.calls.map(c=>c[0]),['rpc','close','render']);
  const [company,expected,doc]=f.calls[0][1];
  assert.equal(company,'company');assert.equal(expected,f.previous);
  assert.deepEqual(clone(doc.righe.map(r=>[r.qtyEv,r.custom,r.source_order_index])),[[0,'first',0],[5,'second',1]]);
  assert.equal(doc.num,'OC/2026/0001');assert.deepEqual(clone(doc.ddtIds),['DDT-old']);
  assert.deepEqual(f.previous,original);
});

test('reordering duplicate rows follows original identity and a newly added duplicate inherits no delivery',async()=>{
  const f=fixture({rows:[domRow(1),domRow(undefined),domRow(0)]});await f.click();
  const rows=f.calls[0][1][2].righe;
  assert.deepEqual(clone(rows.map(r=>r.qtyEv)),[5,null,0]);
  assert.equal(Object.hasOwn(rows[1],'qtyEv'),false);
  assert.equal(rows[0].custom,'second');assert.equal(rows[2].custom,'first');
});

test('stale supplier order edit stays open with no fallback or number change',async()=>{
  const f=fixture({error:Error('Ordine modificato: ricarica')});await f.click();
  assert.deepEqual(f.calls.map(c=>c[0]),['rpc']);assert.match(f.messages.at(-1)[0],/Ordine modificato/);
  assert.equal(f.elements['f-save'].disabled,false);
});

test('email tracking uses expected snapshot and reports sent email separately from rejected CAS',async()=>{
  const original={id:'of',righe:[{cod:'A',qty:3,qtyEv:1}]};let args;
  const c={emailingItem:original,companyId:'company',store:{async saveSupplierOrder(...values){args=values;throw Error('ordine modificato');}}};
  vm.createContext(c);
  const block=between('      let saved;','      emailingItem = saved;');
  await assert.rejects(vm.runInContext('(async()=>{'+block+'})()',c),/Email inviata, ma stato non aggiornato.*non reinviare/);
  assert.equal(args[1],original);assert.equal(args[2].righe[0].source_order_index,0);assert.equal(args[2].righe[0].qtyEv,1);
});

for(const [name,rows,message] of [
  ['remove delivered',[domRow(0)],/eliminare una riga già ricevuta/],
  ['change delivered code',[domRow(0),domRow(1,{cod:'B'})],/cambiare il codice/],
  ['reduce delivered quantity',[domRow(0),domRow(1,{qty:4})],/inferiore/],
  ['duplicate identity',[domRow(1),domRow(1)],/Identità/],
  ['out of bounds identity',[domRow(5)],/Identità/],
]) {
  test(`invalid edit ${name} fails before any persistence`,async()=>{
    const f=fixture({rows});await f.click();assert.equal(f.calls.length,0);
    assert.match(f.messages.at(-1)[0],message);assert.equal(f.elements['f-save'].disabled,false);
  });
}

