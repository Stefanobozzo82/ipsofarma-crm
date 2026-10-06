// Il modello di stampa/PDF (app/print.js) finisce in innerHTML e in una
// finestra dello stesso sito: ogni dato di anagrafica o documento deve
// arrivare come testo, mai come HTML (indirizzi, P.IVA, PEC, IBAN, colli...).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const read=f=>fs.readFileSync(path.join(__dirname,'..','web',f),'utf8');
function print(){const window={};vm.runInNewContext(read('app/print.js'),{window,document:{getElementById:()=>({}),createElement:()=>({}),head:{appendChild(){}}}});return window.SaasPrint;}
const X='<img src=x onerror=alert(1)>';

test('print template escapes party, company and document fields', () => {
  const party={nome:'Cliente',via:X,cap:X,citta:X,prov:X,piva:X,cf:X+'cf',sdi:X,pec:X,pag:X,term:X,dest:[{id:'d1',nome:'Dest',via:X,cap:X,citta:X,prov:X}]};
  const company={nome:'Az',piva:X,cf:X+'c',pec:X,indirizzo:{via:X,cap:X,citta:X,prov:X},settings:{tel:X,email:X,web:X,iban:X}};
  const righe=[{cod:'A',descr:'d',qty:X,prezzo:1,iva:22}];
  for(const [coll,doc] of [['fattureCliente',{num:'FT/1',data:'2026-01-01',righe}],['ddt',{num:'D/1',data:'2026-01-01',righe,colli:X,destId:'d1'}]]){
    const html=print().buildPrintHTML(coll,doc,party,company);
    assert.ok(!html.includes('<img'),`${coll}: HTML non neutralizzato`);
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'),`${coll}: il testo deve restare leggibile`);
  }
});

test('addresses keep their two-line layout', () => {
  const html=print().buildPrintHTML('fattureCliente',{num:'FT/1',data:'2026-01-01',righe:[]},{nome:'C',via:'Via Roma 1',cap:'87100',citta:'Cosenza',prov:'CS'},{});
  assert.ok(html.includes('Via Roma 1<br>87100 Cosenza (CS)'));
});
