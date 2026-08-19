/**
 * player.js — la surfista.
 *
 * Espone: position {x,y}, velocity {vx,vy}, state (idle/paddling/riding/
 * aerial/wipeout) gestito da una state machine esplicita (Utils.StateMachine),
 * comboCount, comboMultiplier. Nessun if/else annidato per i flussi di stato:
 * ogni stato è un oggetto {enter, update, exit} registrato per nome.
 */
class Player {
  constructor() {
    const P = CONFIG.PLAYER;
    this.position = { x: CONFIG.PLAYER_SCREEN_X, y: 0 };
    this.velocity = { vx: 0, vy: 0 };

    this.comboCount = 0;
    this.comboMultiplier = 1;

    // Accelerazione (hold/release, curva non lineare)
    this.holdTime = 0;
    this.currentSpeed = 0;

    // Carving
    this.carveAngle = 0;
    this.carveDir = 0;
    this.carveHoldTime = 0;
    this.carveBoostTimer = 0;
    this.lateralOffset = 0;

    // Aerial / trick
    this.airTime = 0;
    this.trickInput = []; // sequenza di input registrata in aria
    this.trickWindowTimer = 0;
    this.lastTrickLabel = null;
    this.lastTrickTimer = 0;

    // Wipeout
    this.freezeTimer = 0;
    this.tumbleTimer = 0;
    this.tumbleRotation = 0;

    this.animTimer = 0;
    this.bob = 0;

    this._buildStateMachine();
  }

  _buildStateMachine() {
    const P = CONFIG.PLAYER;
    const self = this;

    const states = {
      idle: {
        enter() {
          self.currentSpeed = 0;
          self.holdTime = 0;
        },
        update(_owner, dt, input, wave) {
          self.bob = Math.sin(self.animTimer * 3) * 3;
          self.position.y = wave.baselineY + 40 + self.bob;
          if (input.accelerate) {
            self.fsm.setState("paddling");
          }
        },
      },

      paddling: {
        enter() {
          self.holdTime = 0;
          self.currentSpeed = Math.max(self.currentSpeed, 40);
        },
        update(_owner, dt, input, wave) {
          if (input.accelerate) {
            self.holdTime = Math.min(self.holdTime + dt, P.PADDLE_ACCEL_TIME);
          } else {
            self.holdTime = Math.max(self.holdTime - dt * 1.5, 0);
          }
          const t = self.holdTime / P.PADDLE_ACCEL_TIME;
          const factor = Utils.easeInPow(t, 1.6);
          self.currentSpeed = Utils.lerp(20, P.PADDLE_MAX_SPEED, factor);
          self.velocity.vx = self.currentSpeed;

          self.bob = Math.sin(self.animTimer * 6) * 2;
          self.position.y = wave.baselineY + 30 + self.bob;

          if (self.currentSpeed >= P.CATCH_WAVE_SPEED) {
            self.fsm.setState("riding", { fromCatch: true });
          }
        },
      },

      riding: {
        enter(_owner, payload) {
          self.currentSpeed = Math.max(self.currentSpeed, P.RIDE_BASE_SPEED);
          self.holdTime = 0;
          if (payload && payload.recovered) {
            self.currentSpeed = P.WIPEOUT_RECOVERY_SPEED;
          }
        },
        update(_owner, dt, input, wave, ctx) {
          // --- Accelerazione hold/release, curva non lineare ---
          if (input.accelerate) {
            self.holdTime = Math.min(self.holdTime + dt, P.RIDE_ACCEL_TIME);
          } else {
            self.holdTime = Math.max(self.holdTime - dt * 1.8, 0);
          }
          const t = self.holdTime / P.RIDE_ACCEL_TIME;
          const factor = Utils.easeInPow(t, P.RIDE_ACCEL_CURVE_POWER);
          const target = Utils.lerp(P.RIDE_BASE_SPEED, P.RIDE_MAX_SPEED, factor);

          if (input.accelerate) {
            self.currentSpeed = Utils.lerp(self.currentSpeed, target, Math.min(1, dt * 3));
          } else {
            self.currentSpeed = Math.max(P.RIDE_MIN_SPEED, self.currentSpeed - P.RIDE_DECEL_PER_SEC * dt);
          }

          // --- Carving sx/dx + boost su curve strette ---
          self._updateCarve(dt, input, ctx);

          if (self.carveBoostTimer > 0) {
            self.carveBoostTimer = Math.max(0, self.carveBoostTimer - dt);
          }
          const boostBonus = self.carveBoostTimer > 0 ? P.CARVE_BOOST_SPEED : 0;
          self.velocity.vx = self.currentSpeed + boostBonus;

          self.lateralOffset = Math.sin(self.carveAngle) * P.CARVE_LATERAL_RANGE;
          self.position.x = CONFIG.PLAYER_SCREEN_X + self.lateralOffset;

          // Segue la superficie dell'onda.
          const worldX = wave.worldXFromScreenX(CONFIG.PLAYER_SCREEN_X);
          self.position.y = wave.surfaceScreenY(CONFIG.PLAYER_SCREEN_X) - 6;

          // --- Salto ---
          if (input.consumeJumpPress() && self.velocity.vx >= P.JUMP_MIN_SPEED) {
            self.fsm.setState("aerial", { worldX, ctx });
          }
        },
      },

      aerial: {
        enter(_owner, payload) {
          self.velocity.vy = -P.JUMP_VELOCITY;
          self.airTime = 0;
          self.trickInput = [];
          self.trickWindowTimer = CONFIG.TRICK_WINDOW_MS / 1000;
          self.takeoffWorldX = payload.worldX;
          self.takeoffY = self.position.y;
          if (payload.ctx) payload.ctx.onSound("jump");
        },
        update(_owner, dt, input, wave, ctx) {
          self.airTime += dt;
          self.velocity.vy += CONFIG.GRAVITY * dt;
          self.position.y += self.velocity.vy * dt;

          // Piccola deriva orizzontale controllabile in aria (stile trick).
          const drift = (input.left ? -1 : input.right ? 1 : 0) * P.AIR_HORIZONTAL_DRIFT;
          self.lateralOffset = Utils.clamp(self.lateralOffset + drift * dt, -70, 70);
          self.position.x = CONFIG.PLAYER_SCREEN_X + self.lateralOffset;

          // Rotazione visiva in base al trick buffer (puramente estetica).
          self.tumbleRotation += dt * 6 * (self.trickInput.length > 0 ? 1 : 0.4);

          // Registra input per il trick system entro la finestra temporale.
          if (self.trickWindowTimer > 0) {
            self.trickWindowTimer -= dt;
            let key;
            while ((key = input.consumeDirectionalPress())) {
              self.trickInput.push(key);
            }
          } else {
            input.drainDirectionalQueue();
          }

          const worldX = wave.worldXFromScreenX(self.position.x);
          const surfaceY = wave.surfaceScreenY(self.position.x) - 6;

          if (self.velocity.vy >= 0 && self.position.y >= surfaceY) {
            self._land(surfaceY, worldX, wave, ctx);
          }
        },
      },

      wipeout: {
        enter(_owner, payload) {
          self.comboCount = 0;
          self.comboMultiplier = 1;
          self.freezeTimer = P.WIPEOUT_FREEZE_MS / 1000;
          self.tumbleTimer = P.WIPEOUT_TUMBLE_MS / 1000;
          self.tumbleRotation = 0;
          self.velocity.vx = 0;
          if (payload && payload.ctx) payload.ctx.onWipeout();
        },
        update(_owner, dt, input, wave, ctx) {
          if (self.freezeTimer > 0) {
            self.freezeTimer -= dt;
            return; // freeze frame: nessun movimento
          }
          self.tumbleTimer -= dt;
          self.tumbleRotation += dt * 14;
          self.position.y += 60 * dt;
          const surfaceY = wave.surfaceScreenY(self.position.x) - 6;
          if (self.position.y > surfaceY) self.position.y = surfaceY;

          if (self.tumbleTimer <= 0) {
            self.lateralOffset = 0;
            self.fsm.setState("riding", { recovered: true });
          }
        },
      },
    };

    this.fsm = new Utils.StateMachine(states, "idle", this);
  }

  _updateCarve(dt, input, ctx) {
    const P = CONFIG.PLAYER;
    const inputDir = input.left ? -1 : input.right ? 1 : 0;

    if (inputDir !== 0) {
      if (inputDir === this.carveDir) {
        this.carveHoldTime += dt;
      } else {
        if (this.carveDir !== 0) {
          const priorAngleDeg = Math.abs(Utils.angleDeg(this.carveAngle));
          if (priorAngleDeg >= P.CARVE_TIGHT_ANGLE_DEG && this.carveHoldTime <= P.CARVE_REVERSAL_WINDOW) {
            this._triggerCarveBoost(ctx);
          }
        }
        this.carveDir = inputDir;
        this.carveHoldTime = 0;
      }
      const target = inputDir * P.CARVE_MAX_ANGLE;
      this.carveAngle = moveToward(this.carveAngle, target, P.CARVE_TURN_RATE * dt);
    } else {
      this.carveAngle = moveToward(this.carveAngle, 0, P.CARVE_RETURN_RATE * dt);
      if (Math.abs(this.carveAngle) < 0.02) this.carveDir = 0;
    }
  }

  _triggerCarveBoost(ctx) {
    const P = CONFIG.PLAYER;
    this.carveBoostTimer = P.CARVE_BOOST_DURATION;
    this._addCombo();
    if (ctx) {
      ctx.onScore(CONFIG.SCORING.CARVE_BOOST_BONUS * this.comboMultiplier, "carve");
      ctx.onSound("carveBoost");
    }
  }

  _addCombo() {
    const P = CONFIG.PLAYER;
    this.comboCount += 1;
    this.comboMultiplier = Utils.clamp(1 + this.comboCount * P.COMBO_MULTIPLIER_STEP, 1, P.COMBO_MULTIPLIER_MAX);
  }

  _land(surfaceY, worldX, wave, ctx) {
    const P = CONFIG.PLAYER;
    const waveSlope = wave.slopeAt(worldX);
    const impactSpeed = Math.abs(this.velocity.vy);
    const airTimeMs = this.airTime * 1000;

    // Valuta il trick eventualmente completato dal buffer di input.
    const trick = TrickSystem.resolve(this.trickInput, airTimeMs);

    const outOfSync = impactSpeed > P.LANDING_SAFE_VY || Math.abs(waveSlope) > P.LANDING_SAFE_SLOPE_DIFF + 10;
    // outOfSync considera anche un disallineamento innaturale (semplificato:
    // atterraggi con velocità verticale eccessiva sono "fuori sync").
    const failed = impactSpeed > P.LANDING_SAFE_VY;

    if (failed) {
      this.fsm.setState("wipeout", { ctx });
      return;
    }

    this.position.y = surfaceY;
    this.velocity.vy = 0;
    this.tumbleRotation = 0;

    if (trick) {
      this._addCombo();
      const points = Math.round(trick.points * this.comboMultiplier);
      if (ctx) {
        ctx.onScore(points, "trick");
        ctx.onTrick(trick, this.comboMultiplier);
        ctx.onSound("trickLand");
      }
      this.lastTrickLabel = `${trick.name} +${points}`;
      this.lastTrickTimer = 1.6;
    } else if (this.airTime * 1000 >= CONFIG.TRICK_MIN_AIR_TIME_MS) {
      if (ctx) {
        ctx.onScore(CONFIG.SCORING.CLEAN_LANDING_BONUS, "landing");
        ctx.onSound("land");
      }
    }

    this.fsm.setState("riding");
  }

  update(dt, input, wave, ctx) {
    this.animTimer += dt;
    if (this.lastTrickTimer > 0) this.lastTrickTimer -= dt;
    this.fsm.update(dt, input, wave, ctx);
  }

  get state() {
    return this.fsm.current;
  }

  reset() {
    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.currentSpeed = 0;
    this.carveAngle = 0;
    this.carveDir = 0;
    this.lateralOffset = 0;
    this.position.x = CONFIG.PLAYER_SCREEN_X;
    this.fsm.setState("idle");
  }
}

/** Muove `current` verso `target` di al massimo `maxStep`. */
function moveToward(current, target, maxStep) {
  const diff = target - current;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}
