/**
 * utils.js — helper generici: RNG seedato, math, collisioni, storage.
 */
const Utils = (() => {
  /** RNG deterministico (mulberry32) — usato per generare l'onda e gli
   * ostacoli in modo procedurale ma riproducibile per un dato seed/livello. */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Ease-in: curva di accelerazione NON lineare (usata per hold-to-accelerate). */
  function easeInPow(t, power) {
    return Math.pow(clamp(t, 0, 1), power);
  }

  function angleDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  function degToRad(deg) {
    return (deg * Math.PI) / 180;
  }

  /** Collisione rettangolo (AABB) vs cerchio. Ritorna true se sovrapposti. */
  function circleIntersectsAABB(cx, cy, r, rectCx, rectCy, halfW, halfH) {
    const dx = Math.abs(cx - rectCx);
    const dy = Math.abs(cy - rectCy);
    if (dx > halfW + r) return false;
    if (dy > halfH + r) return false;
    if (dx <= halfW) return true;
    if (dy <= halfH) return true;
    const cornerDistSq = (dx - halfW) ** 2 + (dy - halfH) ** 2;
    return cornerDistSq <= r * r;
  }

  /** Collisione cerchio-cerchio (distanza). */
  function circleIntersectsCircle(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const rr = ar + br;
    return dx * dx + dy * dy <= rr * rr;
  }

  /** Wrapper localStorage con fallback in-memory se non disponibile
   * (modalità privata, storage pieno, ambienti sandboxati, ecc.). */
  const memoryFallback = new Map();
  let storageAvailable = null;
  function isStorageAvailable() {
    if (storageAvailable !== null) return storageAvailable;
    try {
      const testKey = "__pixelSurfGirl_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      storageAvailable = true;
    } catch (e) {
      storageAvailable = false;
    }
    return storageAvailable;
  }

  const Storage = {
    get(key, fallback) {
      try {
        if (isStorageAvailable()) {
          const raw = window.localStorage.getItem(key);
          return raw === null ? fallback : JSON.parse(raw);
        }
      } catch (e) {
        /* ignore, fall through to memory */
      }
      return memoryFallback.has(key) ? memoryFallback.get(key) : fallback;
    },
    set(key, value) {
      try {
        if (isStorageAvailable()) {
          window.localStorage.setItem(key, JSON.stringify(value));
          return;
        }
      } catch (e) {
        /* ignore, fall through to memory */
      }
      memoryFallback.set(key, value);
    },
    getHighScore(levelId) {
      return Storage.get(CONFIG.STORAGE_PREFIX + levelId, 0);
    },
    setHighScoreIfBetter(levelId, score) {
      const current = Storage.getHighScore(levelId);
      if (score > current) {
        Storage.set(CONFIG.STORAGE_PREFIX + levelId, score);
        return true;
      }
      return false;
    },
  };

  /** Semplice state machine riutilizzabile (nessun if/else annidato per i flussi). */
  class StateMachine {
    constructor(states, initialState, owner) {
      this.states = states;
      this.owner = owner;
      this.current = null;
      this.timeInState = 0;
      this.setState(initialState);
    }
    setState(name, payload) {
      const prevDef = this.current ? this.states[this.current] : null;
      if (prevDef && prevDef.exit) prevDef.exit(this.owner, payload);
      this.current = name;
      this.timeInState = 0;
      const def = this.states[name];
      if (!def) throw new Error(`Stato sconosciuto: ${name}`);
      if (def.enter) def.enter(this.owner, payload);
    }
    update(dt, ...args) {
      this.timeInState += dt;
      const def = this.states[this.current];
      if (def && def.update) def.update(this.owner, dt, ...args);
    }
    is(name) {
      return this.current === name;
    }
  }

  return {
    makeRng,
    clamp,
    lerp,
    easeInPow,
    angleDeg,
    degToRad,
    circleIntersectsAABB,
    circleIntersectsCircle,
    Storage,
    StateMachine,
  };
})();
