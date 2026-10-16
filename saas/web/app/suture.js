// Convertitore suture: normalizzazione delle caratteristiche e punteggio di
// somiglianza tra codici di marche diverse (usato da suture.html, e dallo
// script tools/importa_listini.py per le stesse regole di normalizzazione).
(function (window) {
  'use strict';

  const MARCHE = [
    { id: 'ethicon', nome: 'Ethicon' },
    { id: 'bbraun', nome: 'B. Braun' },
    { id: 'assut', nome: 'Assut' },
    { id: 'ergon', nome: 'Ergon Sutramed' },
    { id: 'corza', nome: 'Corza Medical' },
  ];
  const CURVATURE = ['1/2', '3/8', '5/8', '1/4', 'Retto', 'J'];
  const PUNTE = ['Cilindrica', 'Tagliente inversa', 'Tagliente', 'Taper-cut', 'Spatolata', 'Smussa'];

  // Valori di partenza della tabella equivalenze (vuote le caselle da
  // compilare a mano o dai listini).
  const EQUIVALENZE_INIZIALI = [
    { famiglia: 'PGLA intrecciato', ethicon: 'Vicryl', bbraun: 'Novosyn', assut: 'AssuCryl Lactin' },
    { famiglia: 'PGA intrecciato', bbraun: 'Safil', assut: 'AssuCryl' },
    { famiglia: 'Rapido intrecciato', ethicon: 'Vicryl Rapide', bbraun: 'Safil Quick+ / Novosyn Quick', assut: 'AssuCryl Rapid' },
    { famiglia: 'Monofilamento medio (poliglecaprone)', ethicon: 'Monocryl', bbraun: 'Monosyn', assut: 'AssuCryl MonoRapid' },
    { famiglia: 'PDO', ethicon: 'PDS II / PDS Plus', bbraun: 'MonoPlus', assut: 'AssuCryl MonoSlow' },
    { famiglia: 'Polipropilene', ethicon: 'Prolene', bbraun: 'Premilene' },
    { famiglia: 'Nylon', ethicon: 'Ethilon', bbraun: 'Dafilon' },
    { famiglia: 'Seta', ethicon: 'Mersilk', bbraun: 'Silkam' },
    { famiglia: 'Poliestere', ethicon: 'Ethibond Excel / Mersilene', bbraun: 'Dagrofil / Premicron' },
    { famiglia: 'Barbato', ethicon: 'Stratafix', corza: 'Quill' },
  ].map((e, i) => Object.assign({ ethicon: null, bbraun: null, assut: null, ergon: null, corza: null, ordine: i + 1 }, e));

  // Pesi del punteggio (100 = identico).
  const PESI = { uspStep: 35, curvatura: 15, punta: 15, agoMm: 2, lungCm: 0.3, senzaAgo: 45 };

  function fold(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  // Codici confrontati senza spazi, punti, trattini e barre: "W 9114" = "W9114".
  function normCodice(s) { return fold(s).replace(/[\s.\-\/_]/g, ''); }

  // USP nel formato "2-0": accetta "2/0", "2.0", "USP 2-0", "00" (=2-0), "0".
  function normUsp(v) {
    let s = fold(v).replace(/usp|ep\s*[\d.,]+/g, '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{1,2})\s*[-\/.]\s*0$/);
    if (m) { const k = parseInt(m[1], 10); return k <= 1 ? '0' : k + '-0'; }
    if (/^0{2,}$/.test(s)) return s.length + '-0';
    m = s.match(/^(\d)\s*[&\/+-]\s*(\d)$/);
    if (m && m[1] !== '0' && m[2] !== '0') return m[1] + '-' + m[2];
    if (/^\d$/.test(s)) return s;
    return null;
  }
  // Posizione sulla scala USP: ... 3-0 → -2, 2-0 → -1, 0 → 0, 1 → 1, 2 → 2.
  function uspRank(usp) {
    if (usp == null) return null;
    let m = String(usp).match(/^(\d+)-0$/);
    if (m) return -(parseInt(m[1], 10) - 1);
    m = String(usp).match(/^(\d)-(\d)$/);
    if (m) return parseInt(m[1], 10);
    m = String(usp).match(/^\d$/);
    return m ? parseInt(usp, 10) : null;
  }

  function normCurvatura(v) {
    const s = fold(v).replace(/\s+/g, '');
    if (!s) return null;
    if (/^1\/2|^h$|^half|^semicirc/.test(s)) return '1/2';
    if (/^3\/8/.test(s)) return '3/8';
    if (/^5\/8/.test(s)) return '5/8';
    if (/^1\/4/.test(s)) return '1/4';
    if (/^(retto|retta|dritto|straight|st$|s$)/.test(s)) return 'Retto';
    if (/^(j|jshape|forma?j|ago?j)/.test(s)) return 'J';
    return null;
  }

  function normPunta(v) {
    const s = fold(v).replace(/[\s_]+/g, ' ').trim();
    if (!s) return null;
    if (/taper.?cut|tapercut|\btc\b|cilindrica tagliente/.test(s)) return 'Taper-cut';
    if (/inver|reverse|\brc\b|\bfs\b|\bps\b/.test(s)) return 'Tagliente inversa';
    if (/spatol|spatula|\bsp\b/.test(s)) return 'Spatolata';
    if (/smuss|blunt|\bbp\b|\bbt\b/.test(s)) return 'Smussa';
    if (/taglien|cutting|\bcc\b|\bkt\b/.test(s)) return 'Tagliente';
    if (/cilindr|taper|tondo|round|\brb\b|\bsh\b|\bct\b/.test(s)) return 'Cilindrica';
    return null;
  }

  function num(v) {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // Confronto di un codice (o di una ricerca per caratteristiche) con un
  // candidato. null se il tipo di filo è diverso (obbligatorio). diff:
  // le caratteristiche che non corrispondono, per evidenziarle.
  function confronta(a, b) {
    if (!a.tipo || !b.tipo || fold(a.tipo) !== fold(b.tipo)) return null;
    let punti = 100;
    const diff = {};
    // Con ago / senza ago (bobine, fili liberi): tra un codice e l'altro
    // conta come una differenza forte. Nella ricerca per caratteristiche
    // (a senza codice) solo se l'ago è stato indicato.
    const conAgo = x => x.agoMm != null || !!x.curvatura || !!x.punta;
    if ((a.codice || conAgo(a)) && conAgo(a) !== conAgo(b)) {
      punti -= PESI.senzaAgo;
      diff.curvatura = diff.punta = diff.agoMm = true;
    }
    const ra = uspRank(a.usp), rb = uspRank(b.usp);
    if (ra != null && rb != null && ra !== rb) { punti -= PESI.uspStep * Math.abs(ra - rb); diff.usp = true; }
    if (a.curvatura && b.curvatura && a.curvatura !== b.curvatura) { punti -= PESI.curvatura; diff.curvatura = true; }
    if (a.punta && b.punta && a.punta !== b.punta) { punti -= PESI.punta; diff.punta = true; }
    const ma = num(a.agoMm), mb = num(b.agoMm);
    if (ma != null && mb != null && ma !== mb) { punti -= PESI.agoMm * Math.abs(ma - mb); diff.agoMm = true; }
    const la = num(a.lungCm), lb = num(b.lungCm);
    if (la != null && lb != null && la !== lb) { punti -= PESI.lungCm * Math.abs(la - lb); diff.lungCm = true; }
    return { punti: Math.max(0, Math.round(punti)), diff };
  }

  // Per ogni marca (esclusa quella di partenza, se c'è) i migliori n codici.
  function migliori(src, codici, n) {
    const perMarca = {};
    MARCHE.forEach(m => { if (m.id !== src.marca) perMarca[m.id] = []; });
    codici.forEach(c => {
      if (!perMarca[c.marca] || (c.marca === src.marca && c.codice === src.codice)) return;
      const r = confronta(src, c);
      // Sotto il 20% non è un equivalente utile: non si mostra.
      if (r && r.punti >= 20) perMarca[c.marca].push(Object.assign({ codice: c }, r));
    });
    Object.keys(perMarca).forEach(k => {
      perMarca[k].sort((x, y) => y.punti - x.punti || String(x.codice.codice).localeCompare(String(y.codice.codice), 'it', { numeric: true }));
      perMarca[k] = perMarca[k].slice(0, n || 3);
    });
    return perMarca;
  }

  // Famiglie che corrispondono a un nome commerciale o a un materiale:
  // "vicryl" → PGLA intrecciato; "pdo" → PDO. Più parole devono esserci
  // tutte; ogni nome commerciale ("PDS II / PDS Plus") conta per intero.
  function famiglieDa(query, equivalenze) {
    const q = fold(query).trim();
    if (!q) return [];
    const words = q.split(/\s+/);
    const scored = [];
    equivalenze.forEach(e => {
      const nomi = [e.famiglia].concat(MARCHE.map(m => e[m.id]).filter(Boolean).join(' / ').split('/'))
        .map(s => fold(s).trim()).filter(Boolean);
      const testo = nomi.join(' | ');
      if (!words.every(w => testo.includes(w))) return;
      // Un nome commerciale identico ("vicryl") batte uno che lo contiene
      // ("vicryl rapide").
      const esatto = nomi.some(n => n === q);
      scored.push({ e, esatto });
    });
    const esatti = scored.filter(s => s.esatto);
    return (esatti.length ? esatti : scored).map(s => s.e);
  }

  // Un codice letto da un file (suture-codici.json, prodotto dallo script dei
  // listini, o esportato da qui): campi normalizzati e problemi trovati.
  // Accetta sia agoMm/lungCm/siglaAgo sia ago_mm/lung_cm/sigla_ago.
  function normalizzaCodice(raw) {
    const r = raw || {};
    const pick = (...k) => { for (const x of k) if (r[x] != null && r[x] !== '') return r[x]; return null; };
    // "B. Braun", "bbraun", "Braun", "Ergon" → id della marca.
    const k = fold(pick('marca')).replace(/[^a-z]/g, '');
    const lettere = m => fold(m.nome).replace(/[^a-z]/g, '');
    const marca = k ? ((MARCHE.find(m => m.id === k || lettere(m) === k) || (k.length >= 4 && MARCHE.find(m => lettere(m).includes(k))) || {}).id || null) : null;
    const problemi = [];
    const usp0 = pick('usp'), curv0 = pick('curvatura'), punta0 = pick('punta');
    const c = {
      marca, codice: pick('codice') == null ? null : String(pick('codice')).trim(),
      tipo: pick('tipo') == null ? null : String(pick('tipo')).trim(),
      usp: usp0 == null ? null : normUsp(usp0),
      curvatura: curv0 == null ? null : (CURVATURE.includes(curv0) ? curv0 : normCurvatura(curv0)),
      punta: punta0 == null ? null : (PUNTE.includes(punta0) ? punta0 : normPunta(punta0)),
      agoMm: num(pick('agoMm', 'ago_mm')), lungCm: num(pick('lungCm', 'lung_cm')),
      siglaAgo: pick('siglaAgo', 'sigla_ago'), descr: pick('descr', 'descrizione'), prezzo: num(pick('prezzo')),
    };
    if (!c.marca) problemi.push('marca non riconosciuta');
    if (!c.codice) problemi.push('codice mancante');
    if (!c.tipo) problemi.push('tipo di filo mancante');
    if (usp0 != null && !c.usp) problemi.push('USP "' + usp0 + '" non riconosciuto');
    if (curv0 != null && !c.curvatura) problemi.push('curvatura "' + curv0 + '" non riconosciuta');
    if (punta0 != null && !c.punta) problemi.push('punta "' + punta0 + '" non riconosciuta');
    return { codice: c, problemi };
  }
  function chiave(c) { return c.marca + '|' + normCodice(c.codice); }

  function testoOfferta(c) {
    return [c.codice, c.descr].filter(Boolean).join(' - ');
  }

  window.SaasSuture = {
    MARCHE, CURVATURE, PUNTE, EQUIVALENZE_INIZIALI, PESI,
    fold, normCodice, normUsp, uspRank, normCurvatura, normPunta, num,
    confronta, migliori, famiglieDa, testoOfferta, normalizzaCodice, chiave,
  };
})(window);
