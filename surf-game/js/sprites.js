/**
 * sprites.js — pixel art disegnata via Canvas.
 *
 * Ogni sprite è una griglia 2D (array di stringhe): ogni carattere è un
 * "pixel" logico mappato a un colore tramite PALETTE. drawFrame() esegue
 * un fillRect per pixel, scalato di CONFIG.PIXEL_SCALE. Nessun asset
 * esterno: tutto è generato da questi dati + Canvas API.
 */
const Sprites = (() => {
  const PALETTE = {
    ".": null, // trasparente
    H: "#4a2c17", // capelli scuro
    h: "#6b4423", // capelli chiaro / ciocca
    S: "#f4c69a", // pelle
    k: "#dba173", // pelle in ombra
    K: "#241a12", // outline / occhi
    B: "#ff4d6d", // costume principale
    b: "#d1354f", // costume ombra
    L: "#f4c69a", // gambe (pelle)
    W: "#ffffff", // bianco (schiuma, dettagli)
    O: "#ffb347", // tavola
    o: "#e8933f", // tavola ombra
    F: "#fff6e0", // striscia tavola
    R: "#7a7a82", // roccia
    r: "#5b5b63", // roccia ombra
    Y: "#e0473f", // boa rosso
    y: "#c7362f", // boa ombra
  };

  function normalize(rows) {
    const width = Math.max(...rows.map((r) => r.length));
    return rows.map((r) => r.padEnd(width, "."));
  }

  function frame(rows) {
    const norm = normalize(rows);
    return { rows: norm, width: norm[0].length, height: norm.length };
  }

  // -------------------------------------------------------------------
  // Girl surfer — pose (14~16 px larghezza logica, poi scalate)
  // -------------------------------------------------------------------
  const GIRL = {
    idle: frame([
      "..............",
      "....HHHH......",
      "...HHHHHHH....",
      "...HSSSShh....",
      "...HSKSKh.....",
      "...HSSSSh.....",
      "....SSSS......",
      "....BBBB......",
      "...SBBBBS.....",
      "...S.BB.S.....",
      ".....BB.......",
      "....LL.LL.....",
      "....LL.LL.....",
      "....FF.FF.....",
      "..............",
      "OOOOOOOOOOOOOO",
    ]),
    paddleA: frame([
      "..........................",
      ".....HHHHH................",
      "....HSSSSHh...............",
      "....HSKS..h......S........",
      "....HSSSS........SS.......",
      ".....SSSS.......S.........",
      "....BBBBBBBBB..S..........",
      "...BBBBBBBBBBBBB..........",
      "..BBBBBBBBBBBBBBBLLLL.....",
      "OOOOOOOOOOOOOOOOOOOOOOOOOO",
      "OOOOOOOOOOOOOOOOOOOOOOOOOO",
    ]),
    paddleB: frame([
      "..........................",
      ".....HHHHH................",
      "....HSSSSHh...............",
      "....HSKS..h................",
      "....HSSSS...................",
      ".....SSSS...................",
      ".S..BBBBBBBBB..............",
      "SS.BBBBBBBBBBBBB............",
      "..BBBBBBBBBBBBBBBLLLL.....",
      "OOOOOOOOOOOOOOOOOOOOOOOOOO",
      "OOOOOOOOOOOOOOOOOOOOOOOOOO",
    ]),
    ride: frame([
      "..............",
      "....HHHH......",
      "...HHHHHHH....",
      "...HSSSShh....",
      "...HSKSKh.....",
      "...HSSSSh.....",
      "....SSSS......",
      "....BBBB......",
      "...BBBBBB.....",
      "..SBBBBBBS....",
      "..S..BB..S....",
      ".....LL.......",
      "....LL.LL.....",
      "....LL.LL.....",
      "....FF.FF.....",
      "OOOOOOOOOOOOOO",
    ]),
    air: frame([
      "..............",
      "....HHHH......",
      "...HHHHHHH....",
      "...HSSSShh....",
      "...HSKSKh.....",
      "...HSSSSh.....",
      "....SSSS......",
      "...BBBBBB.....",
      "..SBBBBBBS....",
      "..S.LLLL.S....",
      "....LL.LL.....",
      "....FF.FF.....",
      "...OOOOOOOO...",
      "..OOOOOOOOOO..",
    ]),
    wipeout: frame([
      "................",
      "..HH.........WW.",
      ".HHHH...K...WWWW",
      "..SSKS.......WW.",
      "...SSS..BB......",
      ".LL..SS.BBB..LL.",
      "LL.....BBBB...LL",
      "....OOOOOOOO....",
      "...OOOOOOOOOO...",
      "................",
    ]),
  };

  const ROCK = frame([
    "....RRRRRR......",
    "..RRRRRRRRRRR...",
    ".RRRrRRRRRRRRRr.",
    "RRRRRRrRRRRRRRRR",
    "RRrRRRRRRRrRRRRR",
    ".RRRRRRRRRRRRRR.",
    "..rRRRRRRRRRRr..",
  ]);

  const BUOY = frame([
    "......WW......",
    ".....WWWW.....",
    "....YYYYYY....",
    "...YYYYYYYY...",
    "...YYWWWWYY...",
    "...YYYYYYYY...",
    "....yyyyyy....",
    ".....yyyy.....",
    "......yy......",
  ]);

  /** Disegna una frame pixel-art centrata su (x,y), con scala e flip/rotazione opzionali. */
  function drawFrame(ctx, f, x, y, scale = CONFIG.PIXEL_SCALE, opts = {}) {
    const { flipX = false, rotation = 0, alpha = 1 } = opts;
    const w = f.width * scale;
    const h = f.height * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (flipX) ctx.scale(-1, 1);
    ctx.translate(-w / 2, -h / 2);
    for (let row = 0; row < f.height; row++) {
      const line = f.rows[row];
      let runStart = -1;
      let runColor = null;
      for (let col = 0; col <= f.width; col++) {
        const ch = col < f.width ? line[col] : ".";
        const color = PALETTE[ch] || null;
        if (color !== runColor) {
          if (runColor) {
            ctx.fillStyle = runColor;
            ctx.fillRect(runStart * scale, row * scale, (col - runStart) * scale, scale);
          }
          runStart = col;
          runColor = color;
        }
      }
    }
    ctx.restore();
    return { w, h };
  }

  /** Sceglie la frame e la rotazione giuste in base allo stato del player e la disegna. */
  function drawPlayer(ctx, player) {
    const p = player.position;
    let f = GIRL.idle;
    let rotation = 0;
    switch (player.state) {
      case "idle":
        f = GIRL.idle;
        rotation = Math.sin(player.animTimer * 3) * 0.03;
        break;
      case "paddling":
        f = Math.floor(player.animTimer * 6) % 2 === 0 ? GIRL.paddleA : GIRL.paddleB;
        break;
      case "riding":
        f = GIRL.ride;
        rotation = player.carveAngle * 0.5;
        break;
      case "aerial":
        f = GIRL.air;
        rotation = player.tumbleRotation;
        break;
      case "wipeout":
        f = GIRL.wipeout;
        rotation = player.tumbleRotation;
        break;
    }
    drawFrame(ctx, f, p.x, p.y, CONFIG.PIXEL_SCALE, { rotation });
  }

  return { PALETTE, GIRL, ROCK, BUOY, drawFrame, drawPlayer, frame };
})();
