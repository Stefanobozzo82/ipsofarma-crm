// Convertitore suture (web/app/suture.js): normalizzazione delle
// caratteristiche e punteggio di somiglianza tra marche.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
// Oggetti creati in un altro contesto vm: confronto per valore via JSON.
const J=v=>JSON.parse(JSON.stringify(v));
const S=(()=>{const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','web','app','suture.js'),'utf8'),{window});return window.SaasSuture;})();

test('USP, curvature and point are normalised to one spelling', () => {
  assert.equal(S.normUsp('2/0'),'2-0');
  assert.equal(S.normUsp('USP 3-0'),'3-0');
  assert.equal(S.normUsp('00'),'2-0');
  assert.equal(S.normUsp('0'),'0');
  assert.equal(S.normUsp('1'),'1');
  assert.equal(S.normUsp('abc'),null);
  assert.ok(S.uspRank('3-0')<S.uspRank('2-0') && S.uspRank('2-0')<S.uspRank('0') && S.uspRank('0')<S.uspRank('1'));
  assert.equal(S.normCurvatura('3/8 circle'),'3/8');
  assert.equal(S.normCurvatura('Straight'),'Retto');
  assert.equal(S.normPunta('Reverse cutting'),'Tagliente inversa');
  assert.equal(S.normPunta('taper cut'),'Taper-cut');
  assert.equal(S.normPunta('Round bodied'),'Cilindrica');
  assert.equal(S.normCodice('W 9114-'),'w9114');
});

const src={marca:'ethicon',codice:'V1',tipo:'PGLA intrecciato',usp:'2-0',curvatura:'1/2',punta:'Cilindrica',agoMm:26,lungCm:70};
const cand=(marca,codice,o)=>Object.assign({marca,codice,tipo:'PGLA intrecciato',usp:'2-0',curvatura:'1/2',punta:'Cilindrica',agoMm:26,lungCm:70},o);

test('the thread type is mandatory, the USP weighs most and differences are marked', () => {
  assert.equal(S.confronta(src,cand('bbraun','X',{tipo:'PDO'})),null);
  assert.deepEqual(J(S.confronta(src,cand('bbraun','X'))),{punti:100,diff:{}});
  const usp=S.confronta(src,cand('bbraun','X',{usp:'3-0'}));
  const curv=S.confronta(src,cand('bbraun','X',{curvatura:'3/8'}));
  const ago=S.confronta(src,cand('bbraun','X',{agoMm:27}));
  assert.ok(usp.punti<curv.punti && curv.punti<ago.punti);
  assert.deepEqual(J(usp.diff),{usp:true});
  assert.deepEqual(J(S.confronta(src,cand('bbraun','X',{lungCm:75})).diff),{lungCm:true});
});

test('each other brand gets its 3 closest codes, best first', () => {
  const codici=[src,cand('bbraun','A',{agoMm:30}),cand('bbraun','B'),cand('bbraun','C',{usp:'0'}),cand('bbraun','D',{lungCm:90}),
    cand('assut','Z',{punta:'Tagliente'}),cand('bbraun','P',{tipo:'PDO'}),cand('ethicon','V2')];
  const best=S.migliori(src,codici,3);
  assert.deepEqual(Object.keys(best).sort(),['assut','bbraun','corza','ergon']);
  assert.deepEqual(J(best.bbraun.map(r=>r.codice.codice)),['B','D','A']);
  assert.deepEqual(J(best.assut.map(r=>r.codice.codice)),['Z']);
  assert.equal(best.corza.length,0);
});

test('a trade name or material finds its family', () => {
  const eq=S.EQUIVALENZE_INIZIALI;
  assert.deepEqual(J(S.famiglieDa('Vicryl',eq).map(e=>e.famiglia)),['PGLA intrecciato']);
  assert.deepEqual(J(S.famiglieDa('vicryl rapide',eq).map(e=>e.famiglia)),['Rapido intrecciato']);
  assert.deepEqual(J(S.famiglieDa('PDS plus',eq).map(e=>e.famiglia)),['PDO']);
  assert.deepEqual(J(S.famiglieDa('dafilon',eq).map(e=>e.famiglia)),['Nylon']);
  assert.deepEqual(J(S.famiglieDa('quill',eq).map(e=>e.famiglia)),['Barbato']);
  assert.equal(S.famiglieDa('xyz',eq).length,0);
  assert.equal(S.testoOfferta({codice:'C0068',descr:'Novosyn 2-0'}),'C0068 - Novosyn 2-0');
});
