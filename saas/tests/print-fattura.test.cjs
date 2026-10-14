// Fattura e nota di credito clienti nel layout della fattura di Maestro
// (app/print.js, buildInvoiceHTML): totali arrotondati riga per riga come
// Maestro, DDT in testa alle righe, pagine A4 con i totali solo in fondo
// all'ultima, nessun dato interpretato come HTML.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const read=f=>fs.readFileSync(path.join(__dirname,'..','web',f),'utf8');
function print(){const window={};vm.runInNewContext(read('app/print.js'),{window,document:{getElementById:()=>({}),createElement:()=>({}),head:{appendChild(){}}}});return window.SaasPrint;}
const X='<img src=x onerror=alert(1)>';
const company={nome:'IPSOFARMA SRL',piva:'02944510789',cf:'02944510789',indirizzo:{via:'Piazza Pasquale Scura, 1',citta:'Cosenza'},settings:{iban:'IT08L0306916206100000005930',banca:'Intesa Sanpaolo',rea:'200449'}};
const party={nome:'SERVI MED CALABRIA SRL',via:'VIA PLATONE 8',cap:'89013',citta:'GIOIA TAURO',prov:'RC',piva:'03238560803',cf:'03238560803'};
const riga=(cod,qty,prezzo)=>({cod,descr:'Articolo '+cod,qty,prezzo,sconto:'40',iva:22,source_ddt_index:0});
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

test('totals are rounded line by line like Maestro, with the DDT reference above the lines', () => {
  // Righe della fattura 332 di Maestro: 23.151,47 + 5.093,32 = 28.244,79.
  const righe=[riga('GA334',2,8000),riga('GB436R',2,750),riga('GB686R',2,94.97),riga('GB487R',2,127.2),riga('GB488R',2,127.2),riga('GB495R',2,326.3),
    riga('GA676',6,1300),riga('GA675',2,535.6),riga('GA678',2,40),riga('GA320',1,4000),riga('GC761R',50,90),riga('GB600',1,585.84),riga('JJ700',1,297.3),
    riga('JK342',2,236.4),riga('JK389',2,297.76),riga('JF113R',2,165.9)];
  const html=print().buildInvoiceHTML('fattureCliente',{num:'FT/2026/0332',data:'2026-10-09',note:'ORDINE 8 DEL 02/10/2026',righe},party,company,
    {ddt:{num:'DDT/2026/0332',data:'2026-10-09'},um:{GB600:'SCT'}});
  const t=text(html);
  assert.match(t,/FATTURA/);
  assert.match(t,/Numero 332 /);
  assert.match(t,/\*\*\* DDT N° 332 del 09\/10\/2026/);
  assert.match(t,/23\.151,47/);
  assert.match(t,/5\.093,32/);
  assert.match(t,/28\.244,79/);
  assert.match(t,/GB600 Articolo GB600 SCT/);
  assert.match(t,/Rimessa Diretta/);
  assert.match(t,/REA 200449/);
  assert.equal((html.match(/class="fx-page"/g)||[]).length,1);
});

test('a long invoice spreads over A4 pages, totals only on the last one', () => {
  const righe=Array.from({length:60},(_,i)=>riga('C'+i,1,10));
  const html=print().buildInvoiceHTML('fattureCliente',{num:'FT/2026/0001',data:'2026-10-09',righe},party,company,{});
  const pages=html.split('class="fx-page"').slice(1);
  assert.equal(pages.length,3);
  assert.equal((html.match(/class="fx-bottom"/g)||[]).length,1);
  assert.equal((html.match(/class="fx-segue"/g)||[]).length,2);
  // L'ultima pagina, quella con i totali, porta sempre almeno una riga.
  assert.ok(/<tr><td>C\d+<\/td>/.test(pages[2]));
  assert.equal((html.match(/<tr><td>C\d+<\/td>/g)||[]).length,60);
});

test('split payment: the amount due is the taxable amount', () => {
  const html=print().buildInvoiceHTML('fattureCliente',{num:'FT/2026/0025',data:'2026-02-03',split:true,righe:[{cod:'A',descr:'a',qty:1,prezzo:100,iva:22}]},party,company,{});
  const t=text(html);
  assert.match(t,/17-ter/);
  assert.match(t,/03\/02\/2026 100,00/);
  assert.match(t,/122,00/);
});

test('invoice layout escapes every party, company and document field', () => {
  const p={nome:X,via:X,cap:X,citta:X,prov:X,piva:X,cf:X,pag:X};
  const az={nome:X,piva:X,cf:X,indirizzo:{via:X,citta:X},settings:{iban:X,banca:X,rea:X,web:X,email:X,tel:X}};
  for(const coll of ['fattureCliente','noteCredito']){
    const html=print().buildInvoiceHTML(coll,{num:X,data:'2026-01-01',note:X,righe:[{cod:X,descr:X,qty:1,prezzo:1,sconto:X,iva:22,um:X}]},p,az,{ddt:{num:X,data:'2026-01-01'}});
    assert.ok(!html.includes('<img'),`${coll}: HTML non neutralizzato`);
  }
});

test('the quality certification appears in the header when the company has one', () => {
  const az={...company,settings:{...company.settings,certificazione:{norma:'UNI EN ISO 9001:2015',numero:'IQ-0526-02'}}};
  const t=text(print().buildInvoiceHTML('fattureCliente',{num:'FT/2026/0001',data:'2026-10-09',righe:[riga('A',1,10)]},party,az,{}));
  assert.match(t,/UNI EN ISO 9001:2015 Cert\. n\. IQ-0526-02/);
  assert.doesNotMatch(text(print().buildInvoiceHTML('fattureCliente',{num:'FT/2026/0001',data:'2026-10-09',righe:[riga('A',1,10)]},party,company,{})),/Cert\. n\./);
});
