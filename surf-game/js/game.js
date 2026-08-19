/**
 * game.js — state machine di gioco (MENU / PLAYING / PAUSED / LEVEL_COMPLETE)
 * e orchestrazione dei moduli (wave, player, obstacles, audio, ui).
 *
 * Anche qui: nessun if/else annidato per il flusso principale, ogni stato è
 * un oggetto {enter, update, render} in Utils.StateMachine.
 */
class Game {
  constructor(ctx, input, audio) {
    this.ctx = ctx;
    this.input = input;
    this.audio = audio;

    this.levels = CONFIG.WAVE.LEVELS;
    this.selectedLevelIndex = 0;
    this.levelIndex = 0;

    this.score = 0;
    this.isNewHighScore = false;

    this.wave = null;
    this.player = null;
    this.obstacles = null;

    this.playerCtx = {
      onScore: (points) => {
        this.score += points;
      },
      onSound: (name) => this._playSound(name),
      onWipeout: () => this.audio.playWipeout(),
      onTrick: () => {},
    };

    this._buildStateMachine();
  }

  _playSound(name) {
    switch (name) {
      case "carveBoost":
        this.audio.playCarveBoost();
        break;
      case "jump":
        this.audio.playJump();
        break;
      case "trickLand":
        this.audio.playTrickLand(this.player.comboMultiplier);
        break;
      case "land":
        this.audio.playLand();
        break;
      default:
        break;
    }
  }

  _buildStateMachine() {
    const self = this;
    const states = {
      menu: {
        enter() {
          self.selectedLevelIndex = self.levelIndex;
        },
        update() {
          const input = self.input;
          // La conferma ha priorità: se INVIO/clic arriva nello stesso frame
          // di una pressione ↑/↓ (che condivide il tasto con l'acceleratore
          // di gioco), la selezione da confermare resta quella già visibile
          // a schermo invece di cambiare "a sorpresa" nello stesso istante.
          const confirmedByEnter = input.consumeConfirmPress();
          const clicked = input.consumeMenuClick(self.levels.length);

          if (!confirmedByEnter && clicked === null) {
            if (input.consumeUpPress()) {
              self.selectedLevelIndex = (self.selectedLevelIndex - 1 + self.levels.length) % self.levels.length;
              self.audio.playUiClick();
            }
            if (input.consumeDownPress()) {
              self.selectedLevelIndex = (self.selectedLevelIndex + 1) % self.levels.length;
              self.audio.playUiClick();
            }
          } else {
            input.consumeUpPress();
            input.consumeDownPress();
          }

          if (clicked !== null) self.selectedLevelIndex = clicked;

          if (confirmedByEnter || clicked !== null) {
            self.levelIndex = self.selectedLevelIndex;
            self.audio.playUiClick();
            self.fsm.setState("playing");
          }
        },
        render(ctx) {
          UI.drawMenu(ctx, self.levels, self.selectedLevelIndex);
        },
      },

      playing: {
        enter() {
          const level = self.levels[self.levelIndex];
          self.wave = new Wave(level);
          self.obstacles = new ObstacleManager(level);
          self.player = new Player();
          self.player.reset();
          self.player.fsm.setState("paddling");
          self.score = 0;
          self.isNewHighScore = false;
        },
        update(_owner, dt) {
          const input = self.input;
          if (input.consumePausePress()) {
            self.fsm.setState("paused");
            return;
          }

          const prevWorldOffset = self.wave.worldOffset;
          self.player.update(dt, input, self.wave, self.playerCtx);
          const dx = Math.max(0, self.player.velocity.vx * dt);
          self.wave.worldOffset += dx;

          self.score += (dx / 100) * CONFIG.SCORING.DISTANCE_POINTS_PER_100PX;

          self.obstacles.update(dt, self.wave.worldOffset);

          if (self.player.state === "riding") {
            const hit = self.obstacles.checkCollision(self.player, self.wave.worldOffset, self.wave);
            if (hit) {
              self.obstacles.obstacles = self.obstacles.obstacles.filter((o) => o !== hit);
              self.player.fsm.setState("wipeout", { ctx: self.playerCtx });
            }
          }

          const level = self.levels[self.levelIndex];
          if (self.wave.worldOffset >= level.targetDistance) {
            self.fsm.setState("levelComplete");
          }
        },
        render(ctx) {
          self._renderScene(ctx);
        },
      },

      paused: {
        update() {
          if (self.input.consumePausePress()) {
            self.fsm.setState("playing");
          }
          if (self.input.consumeEscapePress()) {
            self.fsm.setState("menu");
          }
        },
        render(ctx) {
          self._renderScene(ctx);
          UI.drawPause(ctx);
        },
      },

      levelComplete: {
        enter() {
          const level = self.levels[self.levelIndex];
          self.isNewHighScore = Utils.Storage.setHighScoreIfBetter(level.id, self.score);
          self.audio.playLevelComplete();
        },
        update() {
          if (self.input.consumeConfirmPress()) {
            self.levelIndex = (self.levelIndex + 1) % self.levels.length;
            self.fsm.setState("playing");
          }
          if (self.input.consumeEscapePress()) {
            self.fsm.setState("menu");
          }
        },
        render(ctx) {
          self._renderScene(ctx);
          // levelIndex punta ancora al livello appena completato: avanza
          // solo quando il giocatore conferma (vedi update() sopra).
          const level = self.levels[self.levelIndex];
          UI.drawLevelComplete(ctx, {
            score: self.score,
            highScore: Utils.Storage.getHighScore(level.id),
            isNewHighScore: self.isNewHighScore,
          });
        },
      },
    };

    this.fsm = new Utils.StateMachine(states, "menu", this);
  }

  _renderScene(ctx) {
    const level = this.levels[this.levelIndex];
    this.wave.render(ctx);
    this.obstacles.render(ctx, this.wave.worldOffset, this.wave);
    Sprites.drawPlayer(ctx, this.player);

    UI.drawHUD(ctx, {
      levelName: level.name,
      score: this.score,
      highScore: Utils.Storage.getHighScore(level.id),
      comboMultiplier: this.player.comboMultiplier,
      distance: this.wave.worldOffset,
      targetDistance: level.targetDistance,
      speed: this.player.velocity.vx,
      boosting: this.player.carveBoostTimer > 0,
      trickLabel: this.player.lastTrickTimer > 0 ? this.player.lastTrickLabel : null,
      state: this.player.state,
    });
  }

  update(dt) {
    this.fsm.update(dt);
  }

  render(ctx) {
    const def = this.fsm.states[this.fsm.current];
    if (def && def.render) def.render(ctx);
  }
}
