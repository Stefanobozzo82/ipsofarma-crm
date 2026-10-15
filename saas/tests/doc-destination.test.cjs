// Destinazione di consegna su un documento già salvato (app/doc-page.js,
// bindDestChange): si salva subito con la funzione dedicata, anche quando
// il resto del documento è bloccato; in caso di errore torna la precedente.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function page(){
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','web','app','doc-page.js'),'utf8'),{window,document:{addEventListener(){},querySelectorAll:()=>[]},console});
  return window.SaasDocPage;
}
function select(value){ const s={value,disabled:false,handlers:{},addEventListener(ev,fn){this.handlers[ev]=fn;}}; return s; }

test('changing the destination of a saved document saves it at once', async () => {
  const calls=[]; const msgs=[];
  const store={setDocDestination:async(...a)=>{calls.push(a);return a[3]||null;}};
  const doc={id:'f1',destId:null}; const s=select('');
  page().bindDestChange(s,store,()=>'c1','fattureCliente',()=>doc,(t,k)=>msgs.push(k));
  s.value='d2'; await s.handlers.change();
  assert.deepEqual(calls,[['c1','fattureCliente','f1','d2']]);
  assert.equal(doc.destId,'d2');
  assert.deepEqual(msgs,['ok']);
  assert.equal(s.disabled,false);
});

test('a refused change restores the previous destination; new documents are untouched', async () => {
  const store={setDocDestination:async()=>{throw new Error('no');}};
  const doc={id:'d1',destId:'a'}; const s=select('a'); const msgs=[];
  page().bindDestChange(s,store,()=>'c1','ddt',()=>doc,(t,k)=>msgs.push(k));
  s.value='b'; await s.handlers.change();
  assert.equal(s.value,'a'); assert.equal(doc.destId,'a'); assert.deepEqual(msgs,['error']);
  let called=false; const s2=select('');
  page().bindDestChange(s2,{setDocDestination:async()=>{called=true;}},()=>'c1','ddt',()=>null,()=>{});
  s2.value='x'; await s2.handlers.change();
  assert.equal(called,false);
});
