const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual page functions against a small DOM adapter. These tests
// exercise form logic, not browser layout, browser events or Supabase transport.
const html = fs.readFileSync(path.join(__dirname, '../web/ddt.html'), 'utf8');
function between(start, end) {
  const first = html.indexOf(start);
  const last = html.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw Error(`DDT source boundary not found: ${start}`);
  return html.slice(first, last);
}
const readRowsSource = between('  function readRighe(){', '  // Stessa aritmetica');
const saveSource = between("  $('f-save').addEventListener('click'", "  // Scarica l'elenco da Supabase");
const clone = value => JSON.parse(JSON.stringify(value));

function row(index, cod = 'A') {
  const values = { '.r-cod':cod, '.r-descr':'Product', '.r-lotto':'L1', '.r-scad':'2027-01-01',
    '.r-qty':'2', '.r-prezzo':'3.5', '.r-sconto':'10', '.r-iva':'22' };
  return { dataset:index === undefined ? {} : {sourceOrderIndex:String(index)},
    querySelector(selector) { return {value:values[selector]}; } };
}

function fixture({number = 'DDT/2026/0001', error = null, rows = [row(0)]} = {}) {
  const calls = [], messages = [];
  let click;
  const elements = Object.fromEntries(Object.entries({
    'f-cliente':'client', 'f-ordine':'order', 'f-dest':'destination',
    'f-data':'2026-09-19', 'f-num':number,
  }).map(([id,value])=>[id,{value}]));
  elements['f-save'] = {disabled:false,addEventListener(name,handler) { assert.equal(name,'click'); click=handler; }};
  elements['righe-body'] = {querySelectorAll(selector) { assert.equal(selector,'tr'); return rows; }};
  const originalOrder = {id:'order',righe:[{cod:'A',qty:3,qtyEv:1}]};
  const result = {ddt:{id:'saved-ddt',num:'DDT/2026/0010'},ordine:{id:'order',righe:[{cod:'A',qty:3,qtyEv:3}]}};
  const context = {
    $:id => elements[id], companyId:'company', editingId:null, editingDdt:null,
    numberPreview:'DDT/2026/0001', allOrdiniById:{order:originalOrder},
    store:{
      async checkDocLimit() { return {ok:true}; },
      async createCustomerDdt(...args) { calls.push(['rpc',clone(args)]); if(error) throw error; return result; },
      async saveDoc() { calls.push(['saveDoc']); throw Error('Unexpected direct write'); },
      async nextNumber() { calls.push(['nextNumber']); throw Error('Unexpected separate numbering'); },
      async bumpCounterPast() { calls.push(['bumpCounterPast']); throw Error('Unexpected separate counter'); },
    },
    setMsg(message,kind) { messages.push([message,kind]); },
    async renderList() { calls.push(['renderList']); },
    async openForm(saved) { calls.push(['openForm',saved]); },
    closeForm() { calls.push(['closeForm']); },
  };
  vm.createContext(context);
  vm.runInContext(readRowsSource + '\n' + saveSource, context);
  return {click,context,calls,messages,elements,result,originalOrder};
}

for(const number of ['DDT/2026/0001','']) {
  test(`new linked DDT ${number ? 'untouched preview' : 'empty number'} requests automatic numbering atomically`,async()=>{
    const f=fixture({number}); await f.click();
    const [company,order,doc]=f.calls[0][1];
    assert.equal(company,'company'); assert.deepEqual(order,f.originalOrder);
    assert.equal(doc.num,null); assert.equal(doc.destId,'destination');
    assert.equal(doc.righe[0].source_order_index,0);
    assert.deepEqual(f.calls.map(c=>c[0]),['rpc','renderList','openForm']);
    assert.equal(f.context.allOrdiniById.order,f.result.ordine);
    assert.equal(f.calls.at(-1)[1],f.result.ddt);
    assert.equal(f.elements['f-save'].disabled,false);
  });
}

test('changed manual number is passed unchanged to the atomic RPC',async()=>{
  const f=fixture({number:'  LEGACY-2026-42  '}); await f.click();
  assert.equal(f.calls[0][1][2].num,'LEGACY-2026-42');
  assert.deepEqual(f.calls.map(c=>c[0]),['rpc','renderList','openForm']);
});

test('RPC failure preserves order cache, displays error and never falls back to direct saves or counters',async()=>{
  const f=fixture({error:Error('Ordine modificato: ricarica prima di riprovare.')});
  await f.click();
  assert.deepEqual(f.calls.map(c=>c[0]),['rpc']);
  assert.equal(f.context.allOrdiniById.order,f.originalOrder);
  assert.deepEqual(f.messages.at(-1),['Ordine modificato: ricarica prima di riprovare.','error']);
  assert.equal(f.elements['f-save'].disabled,false);
});

test('actual readRighe preserves source indexes including zero and follows DOM reorder without inventing mappings',()=>{
  const f=fixture({rows:[row(4),row(0),row(undefined,'B')]});
  const saved=clone(vm.runInContext('readRighe()',f.context));
  assert.deepEqual(saved.map(r=>r.source_order_index),[4,0,undefined]);
  assert.equal(Object.hasOwn(saved[2],'source_order_index'),false);
  assert.equal(saved[0].qty,2); assert.equal(saved[0].prezzo,3.5);
  assert.equal(saved[0].lotto,'L1'); assert.equal(saved[0].sconto,'10');
});

test('missing cached linked order fails before any write',async()=>{
  const f=fixture(); f.context.allOrdiniById={}; await f.click();
  assert.equal(f.calls.length,0);
  assert.match(f.messages.at(-1)[0],/Ordine non disponibile/);
  assert.equal(f.elements['f-save'].disabled,false);
});

test('double click during delayed quota check submits only one request and restores the button',async()=>{
  const f=fixture(); let release, checks=0;
  const pending=new Promise(resolve=>{release=resolve;});
  f.context.store.checkDocLimit=async()=>{ checks++; return pending; };
  const first=f.click();
  assert.equal(f.elements['f-save'].disabled,true);
  await f.click();
  assert.equal(checks,1); assert.equal(f.calls.length,0);
  release({ok:true}); await first;
  assert.equal(f.calls.filter(c=>c[0]==='rpc').length,1);
  assert.equal(f.elements['f-save'].disabled,false);
});

test('quota failure or rejection cannot leave the form disabled or write a DDT',async()=>{
  for(const quota of [async()=>({ok:false,limite:1,piano:'trial'}),async()=>{throw Error('Quota unavailable');}]) {
    const f=fixture(); f.context.store.checkDocLimit=quota; await f.click();
    assert.equal(f.calls.length,0); assert.equal(f.elements['f-save'].disabled,false);
    assert.equal(f.messages.at(-1)[1],'error');
  }
});
