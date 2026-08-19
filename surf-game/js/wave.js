/**
 * wave.js — onda procedurale.
 *
 * La forma dell'onda NON è mai hardcodata: è la somma di alcune sinusoidi
 * i cui parametri (ampiezza, frequenza, fase) derivano da { height, speed,
 * curvature, seed } del livello corrente. Cambiando quei quattro numeri in
 * config.js si ottiene un'onda completamente diversa.
 */
class Wave {
  constructor(levelParams) {
    this.height = levelParams.height;
    this.speed = levelParams.speed;
    this.curvature = levelParams.curvature;
    this.seed = levelParams.seed || 1;

    const rng = Utils.makeRng(this.seed);
    // 3 armoniche sovrapposte: frequenza e fase derivate dal seed/curvatura,
    // così ogni livello ha un profilo d'onda unico ma deterministico.
    this.harmonics = [
      { freq: this.curvature * 0.010, amp: 1.0, phase: rng() * Math.PI * 2 },
      { freq: this.curvature * 0.023, amp: 0.45, phase: rng() * Math.PI * 2 },
      { freq: this.curvature * 0.051, amp: 0.22, phase: rng() * Math.PI * 2 },
    ];

    // Baseline verticale della superficie dell'acqua sullo schermo.
    this.baselineY = CONFIG.CANVAS_HEIGHT * 0.62;

    // Lo "scroll" del mondo: quanta distanza è stata percorsa finora.
    this.worldOffset = 0;
  }

  /** Avanza lo scroll dell'onda in base alla velocità di scorrimento e a un
   * eventuale boost dato dalla velocità del player (parallasse coerente). */
  update(dt, extraScrollSpeed = 0) {
    this.worldOffset += (this.speed + extraScrollSpeed) * dt;
  }

  /** Altezza (offset rispetto alla baseline, positivo = verso l'alto)
   * dell'onda in un punto del mondo `worldX`. */
  surfaceOffset(worldX) {
    let sum = 0;
    for (const h of this.harmonics) {
      sum += h.amp * Math.sin(worldX * h.freq + h.phase);
    }
    // normalizza approssimativamente in [-1,1] (somma ampiezze = 1.67)
    return (sum / 1.67) * this.height;
  }

  /** Coordinata Y schermo della superficie per una data X schermo, dato lo
   * scroll corrente del mondo. */
  surfaceScreenY(screenX) {
    const worldX = screenX + this.worldOffset;
    return this.baselineY - this.surfaceOffset(worldX);
  }

  /** Pendenza (radianti) della superficie in un punto del mondo, calcolata
   * per differenze finite. Angolo positivo = onda che sale verso dx. */
  slopeAt(worldX) {
    const d = 4;
    const y1 = this.surfaceOffset(worldX - d);
    const y2 = this.surfaceOffset(worldX + d);
    // offset positivo = più in alto, quindi dY schermo = -(y2-y1)
    return Math.atan2(-(y2 - y1), d * 2);
  }

  worldXFromScreenX(screenX) {
    return screenX + this.worldOffset;
  }

  /** Disegna cielo, acqua profonda, faccia dell'onda e schiuma sulla cresta.
   * La schiuma è deterministica in funzione di worldX (non Math.random per
   * frame) per evitare flickering. */
  render(ctx) {
    const C = CONFIG.COLORS;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;

    // cielo
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.baselineY);
    skyGrad.addColorStop(0, C.skyTop);
    skyGrad.addColorStop(1, C.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, this.baselineY);

    // acqua profonda (sotto tutto)
    ctx.fillStyle = C.deepWater;
    ctx.fillRect(0, this.baselineY - this.height - 40, w, h - (this.baselineY - this.height - 40));

    // faccia dell'onda: poligono che segue surfaceScreenY
    const step = CONFIG.WAVE.SAMPLE_STEP;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += step) {
      ctx.lineTo(x, this.surfaceScreenY(x));
    }
    ctx.lineTo(w, this.surfaceScreenY(w));
    ctx.lineTo(w, h);
    ctx.closePath();
    const waveGrad = ctx.createLinearGradient(0, this.baselineY - this.height, 0, h);
    waveGrad.addColorStop(0, C.waveFace);
    waveGrad.addColorStop(1, C.midWater);
    ctx.fillStyle = waveGrad;
    ctx.fill();

    // schiuma sulla cresta: puntini deterministici basati su worldX
    ctx.fillStyle = C.foam;
    for (let x = 0; x <= w; x += 6) {
      const worldX = x + this.worldOffset;
      const bucket = Math.floor(worldX / 6);
      const hash = Math.abs(Math.sin(bucket * 12.9898) * 43758.5453) % 1;
      const slope = Math.abs(this.slopeAt(worldX));
      // più schiuma dove la pendenza è ripida (cresta dell'onda)
      if (hash < 0.18 + slope * 0.12) {
        const y = this.surfaceScreenY(x) + (hash - 0.09) * 6;
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }
}
