const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[3] || (__dirname + '/../assets/levels/');
(async () => {
  const b = await chromium.launch({ args: ['--ignore-certificate-errors','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 640, height: 400 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await pg.addInitScript(() => { localStorage.setItem('super-tino-gfx-v2', 'alta'); localStorage.setItem('isola-stellata-save-v1', JSON.stringify({stars:{}, seen:{intro:true, castle:true}})); });
  await pg.goto('file://' + require('path').resolve(process.argv[2] || 'export.html')); await pg.waitForTimeout(2500);
  await pg.click('#bPlay', { timeout: 120000 }); await pg.waitForTimeout(1500);
  await pg.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js' });
  await pg.evaluate(() => {
    const E = new THREE.GLTFExporter();
    const glb = sc => new Promise(r => E.parse(sc, ab => { let s = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); r(btoa(s)); }, { binary: true, onlyVisible: false, embedImages: true, maxTextureSize: 1024 }));
    const v = o => [+o.x.toFixed(3), +o.y.toFixed(3), +o.z.toFixed(3)];
    const place = (src, dst, mat) => { mat.decompose(dst.position, dst.quaternion, dst.scale); };
    window.__exportLevel = async () => {
      const X = __X, T = __T, L = T.L, cam = T.camera;
      X.root.updateMatrixWorld(true);
      const dyn = new Set();
      const addD = o => { if (o) dyn.add(o); };
      T.stars.forEach(s => addD(s.g)); T.enemies.forEach(e => addD(e.g)); X.hearts.forEach(h => addD(h.g)); X.itemBoxes.forEach(i => addD(i.m));
      X.lifeItems.forEach(i => addD(i.g)); X.portals.forEach(p => addD(p.g)); X.cannons.forEach(c => addD(c.g)); X.keyItems.forEach(k => addD(k.g || k.m));
      if (T.boss) addD(T.boss.g);
      const mov = new Map(); X.movers.forEach((m, i) => mov.set(m.s.mesh, i));
      const sink = new Set(X.sinkers.map(k => k.s.mesh));
      const isDyn = o => { for (let p = o; p; p = p.parent) { if (dyn.has(p) || mov.has(p) || sink.has(p)) return true; } return false; };
      const okMesh = m => m.isMesh && !m.isInstancedMesh && !m.userData.outline && m.material && !(Array.isArray(m.material) ? m.material[0] : m.material).side !== undefined && (Array.isArray(m.material) ? m.material[0] : m.material).side !== THREE.BackSide && m.geometry && m.geometry.attributes.position;
      const visScene = new THREE.Scene(); let n = 0;
      const vis = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      const bm = new Set((__B ? __B.batches : []).map(x => x.mesh).filter(Boolean));
      X.root.traverse(m => {
        if (!okMesh(m) || isDyn(m) || !vis(m) || bm.has(m)) return;
        const e = m.matrixWorld.elements; if (e.some(x => !isFinite(x))) return;
        const c = new THREE.Mesh(m.geometry, m.material); c.name = 'm' + (n++); place(m, c, m.matrixWorld); visScene.add(c);
      });
      // movers: whole subtree, placed at base
      X.movers.forEach((mv, i) => {
        const g = new THREE.Group(); g.name = 'mover_' + i; g.position.copy(mv.base); g.quaternion.copy(mv.s.mesh.quaternion); g.scale.copy(mv.s.mesh.scale);
        mv.s.mesh.traverse(m => { if (!okMesh(m) || m === mv.s.mesh && false) return; if (m === mv.s.mesh) { const c = new THREE.Mesh(m.geometry, m.material); g.add(c); } });
        visScene.add(g);
      });
      const colScene = new THREE.Scene(); const basic = new THREE.MeshBasicMaterial();
      T.solids.forEach((s, i) => {
        if (!s.mesh || !s.mesh.geometry || !s.mesh.geometry.attributes.position) return;
        const mi = mov.has(s.mesh) ? mov.get(s.mesh) : -1;
        const c = new THREE.Mesh(s.mesh.geometry, basic);
        if (mi >= 0) { c.name = 'mover_' + mi; c.position.copy(X.movers[mi].base); c.quaternion.copy(s.mesh.quaternion); c.scale.copy(s.mesh.scale); }
        else { const e = s.mesh.matrixWorld.elements; if (e.some(x => !isFinite(x))) return; c.name = (s.pole ? 'pole_' : 'c') + i; place(s.mesh, c, s.mesh.matrixWorld); }
        colScene.add(c);
      });
      const data = {
        id: L.id, name: X.CATALOG[L.id] ? X.CATALOG[L.id].name : 'Il Faro', sky: L.sky, fogNear: L.fogNear, fogFar: L.fogFar, hemi: L.hemi, sun: L.sun,
        deathY: L.deathY, hazardY: L.hazardY ?? null, hazard: L.hazard || null, waterY: L.waterY ?? null, seaY: L.seaY ?? null, redTotal: L.redTotal,
        spawn: { pos: v(L.spawn.pos), yaw: L.spawn.yaw }, entries: Object.fromEntries(Object.entries(L.entries || {}).map(([k, e]) => [k, { pos: v(e.pos), yaw: e.yaw || 0 }])),
        coins: T.coins.filter(c => !c.hidden && !c.taken).map(c => ({ p: v(c.m.position), red: !!c.red })),
        stars: T.stars.map(s => ({ id: s.id, name: s.name, p: v(s.g.position), hidden: !!s.hidden })),
        doors: (L.doors || []).map(d => ({ x0: d.x0, x1: d.x1, z0: d.z0, z1: d.z1, to: d.to, entry: d.entry, need: d.need })),
        portals: X.portals.map(p => ({ p: [p.x, p.y, p.z], to: p.to, entry: p.entry, need: p.need })),
        movers: X.movers.map(m => ({ base: v(m.base), axis: v(m.axis), amp: m.amp, period: m.period, phase: m.phase })),
        hearts: X.hearts.map(h => v(h.g.position)),
        enemies: T.enemies.map(e => ({ p: v(e.pos), homeR: e.homeR })),
      };
      if (L.id === 'castle') data.maps = X.PAINTS.map(pd => { const T2 = X.pAt(pd, pd.off || 2.2, pd.fy + (pd.h || 1.0)); return { id: pd.id, name: X.CATALOG[pd.id].name, need: X.NEED[pd.id], top: v(T2), wall: pd.wall, secret: !!pd.secret }; });
      return { vis: await glb(visScene), col: await glb(colScene), data, counts: { vis: n, col: colScene.children.length } };
    };
    window.__exportFio = async () => {
      const sc = new THREE.Scene(), X = __X; const g = new THREE.Group(); g.name = 'Fio'; sc.add(g);
      const bodyC = new THREE.Group(); bodyC.name = 'body'; bodyC.position.y = 0.8; g.add(bodyC);
      const named = new Map([[X.head, 'head'], [X.torso, 'torso'], [X.feet[0], 'footL'], [X.feet[1], 'footR'], [X.hands[0], 'handL'], [X.hands[1], 'handR'], [X.tail, 'tail'], [X.kite, 'kite']]);
      const copy = (src, dst) => { for (const ch of src.children) { if (ch.isMesh && (ch.userData.outline || ch.material === X.outlineMat)) continue; let c;
        if (ch.isMesh) c = new THREE.Mesh(ch.geometry, ch.material); else c = new THREE.Group();
        c.position.copy(ch.position); c.quaternion.copy(ch.quaternion); c.scale.copy(ch.scale); c.name = named.get(ch) || ''; c.visible = true; dst.add(c); copy(ch, c); } };
      copy(X.body, bodyC);
      return await glb(sc);
    };
  });
  await pg.evaluate(() => { window.__exportProps = async () => {
    const X = __X, sc = new THREE.Scene(); const strip = o => { o.traverse(c => { if (c.isMesh && (c.userData.outline || c.material === X.outlineMat)) c.visible = false; }); return o; };
    const s = new THREE.Mesh(X.starGeo, X.starMat); s.name = 'scintilla'; s.position.x = 0; sc.add(s);
    const c = new THREE.Mesh(X.coinGeo, X.coinMat); c.name = 'coin'; c.position.x = 3; sc.add(c);
    const gm = new THREE.Mesh(X.gemGeo, X.redMat); gm.name = 'gem'; gm.position.x = 6; sc.add(gm);
    const n = X.makeGrumo(false); n.g.name = 'nebbiolo'; n.g.position.x = 9; n.ft.forEach((f, i) => f.name = 'foot' + i); sc.add(strip(n.g));
    const ex = new THREE.GLTFExporter();
    return await new Promise(r => ex.parse(sc, ab => { let s2 = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 0x8000) s2 += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); r(btoa(s2)); }, { binary: true, onlyVisible: true, embedImages: true }));
  }; });
  const save = (name, b64) => fs.writeFileSync(OUT + name, Buffer.from(b64, 'base64'));
  save('fio.glb', await pg.evaluate(() => __exportFio()));
  save('props.glb', await pg.evaluate(() => __exportProps()));
  for (const id of ['island', 'castle', 'volcano']) {
    await pg.evaluate(id => __T.loadLevel(id), id); await pg.waitForTimeout(6000);
    const r = await pg.evaluate(() => __exportLevel());
    save(id + '.glb', r.vis); save(id + '_col.glb', r.col); fs.writeFileSync(OUT + id + '.json', JSON.stringify(r.data));
    console.log(id, JSON.stringify(r.counts), 'coins', r.data.coins.length, 'stars', r.data.stars.length);
  }
  console.log('errs', JSON.stringify(errs.slice(0, 5))); await b.close();
})();
