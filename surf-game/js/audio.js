/**
 * audio.js — suoni procedurali via Web Audio API (nessun asset esterno).
 */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;
    this.ambientNodes = null;
  }

  /** L'AudioContext va creato/ripreso dopo un gesto utente (policy browser). */
  ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      this.enabled = false;
      return;
    }
    try {
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.35;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      this.enabled = false;
    }
  }

  setMuted(muted) {
    if (!this.masterGain) return;
    this.masterGain.gain.value = muted ? 0 : 0.35;
  }

  _tone(freq, duration, { type = "sine", gain = 0.5, sweepTo = null, delay = 0 } = {}) {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + duration);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noise(duration, { filterFreq = 1200, gain = 0.4, type = "lowpass", delay = 0 } = {}) {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(filterFreq, t0);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  playPaddleStroke() {
    this._noise(0.12, { filterFreq: 700, gain: 0.25 });
  }

  playCarveBoost() {
    this._tone(320, 0.22, { type: "sawtooth", gain: 0.25, sweepTo: 720 });
  }

  playJump() {
    this._tone(220, 0.18, { type: "square", gain: 0.2, sweepTo: 560 });
    this._noise(0.15, { filterFreq: 2200, gain: 0.15 });
  }

  playTrickLand(comboMultiplier = 1) {
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((f, i) => {
      this._tone(f * (1 + (comboMultiplier - 1) * 0.05), 0.16, {
        type: "square",
        gain: 0.18,
        delay: i * 0.07,
      });
    });
  }

  playLand() {
    this._tone(200, 0.1, { type: "triangle", gain: 0.2, sweepTo: 140 });
  }

  playWipeout() {
    this._noise(0.5, { filterFreq: 1800, gain: 0.35, type: "lowpass" });
    this._tone(140, 0.4, { type: "sawtooth", gain: 0.2, sweepTo: 40 });
  }

  playUiClick() {
    this._tone(440, 0.06, { type: "square", gain: 0.15 });
  }

  playLevelComplete() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._tone(f, 0.22, { type: "triangle", gain: 0.22, delay: i * 0.1 });
    });
  }
}
