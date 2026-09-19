const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../web/ordini.html'),'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function between(start,end) {
  const a=html.indexOf(start), b=html.indexOf(end,a+start.length);
  if(a<0||b<0) throw Error(`Source boundary missing: ${start}`);
  return html.slice(a,b);
}
const rowsCode=between('  function readRighe(){','  // Stessa aritmetica');
const saveCode=between("  $('f-save').addEventListener('click'",'  // ---- elenco');
const addCode=between('  function addRigaRow(r){','  // Riordino righe per trascinamento');
function domRow(index,overrides={}) {
  const values={cod:'A',descr:'Product',qty:10,prezzo:5,sconto:'',iva:22,...overrides};
  return {dataset:index===undefined?{}:{sourceOrderIndex:String(index)},
    querySelector(selector){return {value:String(values[selector.slice(3)])};}};
}
function fixture({rows=[domRow(0),domRow(1)],error=null,isNew=false}={}) {
  const previous={id:'order',num:'OC/2026/0001',clienteId:'client',destId:null,data:'2026-09-19',
    righe:[{cod:'A',descr:'First',qty:10,qtyEv:0,custom:'first'},
      {cod:'A',descr:'Second',qty:10,qtyEv:5,custom:'second'}],ddtIds:['DDT-old'],note:'Preserve'};
  const elements=Object.fromEntries(Object.entries({'f-cliente':'client','f-dest':'','f-data':'2026-09-19','f-num':'OC/2026/0002'}).map(([id,value])=>[id,{value}]));
  let click; const calls=[],messages=[];
  elements['f-save']={disabled:false,addEventListener(name,fn){assert.equal(name,'click');click=fn;}};
  elements['righe-body']={querySelectorAll(){return rows;}};
  const context={$:id=>elements[id],companyId:'company',editingId:isNew?null:'order',editingOrder:isNew?null:previous,
    store:{async checkDocLimit(){return {ok:true};},
      async saveCustomerOrder(...args){calls.push(['rpc',args]);if(error)throw error;return args[2];},
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
  assert.equal(doc.num,'OC/2026/0002');assert.deepEqual(clone(doc.ddtIds),['DDT-old']);
  assert.deepEqual(f.previous,original);
});

test('reordering duplicate rows follows original identity and a newly added duplicate inherits no delivery',async()=>{
  const f=fixture({rows:[domRow(1),domRow(undefined),domRow(0)]});await f.click();
  const rows=f.calls[0][1][2].righe;
  assert.deepEqual(clone(rows.map(r=>r.qtyEv)),[5,null,0]);
  assert.equal(Object.hasOwn(rows[1],'qtyEv'),false);
  assert.equal(rows[0].custom,'second');assert.equal(rows[2].custom,'first');
});

for(const [name,rows,message] of [
  ['remove delivered',[domRow(0)],/eliminare una riga già consegnata/],
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

test('stale snapshot rejection leaves the form open and never falls back to saveDoc or bumps numbering',async()=>{
  const f=fixture({error:Error('Ordine modificato: riapri prima di salvare.')});await f.click();
  assert.deepEqual(f.calls.map(c=>c[0]),['rpc']);
  assert.match(f.messages.at(-1)[0],/Ordine modificato/);assert.equal(f.elements['f-save'].disabled,false);
});

test('addRigaRow stores zero-based identity on the DOM node without assigning identity to a new row',()=>{
  const nodes=[];
  const body={insertAdjacentHTML(){nodes.push({dataset:{}});},get lastElementChild(){return nodes.at(-1);}};
  const bound=[];const context={$:()=>body,rigaRowHtml:()=>'<tr></tr>',bindRigaRow:tr=>bound.push(tr),updateTotale(){}};
  vm.createContext(context);vm.runInContext(addCode,context);
  context.addRigaRow({_editorSourceIndex:0});context.addRigaRow(null);
  assert.equal(nodes[0].dataset.sourceOrderIndex,'0');assert.equal(Object.hasOwn(nodes[1].dataset,'sourceOrderIndex'),false);
  assert.equal(bound[0],nodes[0]);assert.equal(bound[1],nodes[1]);
});

test('double submit during quota wait creates one new order and restores the button',async()=>{
  const f=fixture({isNew:true,rows:[domRow(undefined)]});let release,checks=0;
  const pending=new Promise(resolve=>{release=resolve;});
  f.context.store.checkDocLimit=async()=>{checks++;return pending;};
  const first=f.click();await f.click();assert.equal(checks,1);release({ok:true});await first;
  assert.deepEqual(f.calls.map(c=>c[0]),['bump','saveDoc','close','render']);
  assert.equal(Object.hasOwn(f.calls[1][1][1].righe[0],'source_order_index'),false);
  assert.equal(f.elements['f-save'].disabled,false);
});
