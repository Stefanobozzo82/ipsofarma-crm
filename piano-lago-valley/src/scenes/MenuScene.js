// Schermata iniziale: Nuova Partita / Continua (se esiste un salvataggio).
// Navigazione con frecce/Enter oppure con il mouse.

import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { SaveManager } from '../core/SaveManager.js';
import { createNewGameState } from '../core/GameState.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.cameras.main.setBackgroundColor('#2e7d32');

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 90, 'Piano Lago Valley', {
      fontFamily: 'Georgia, serif',
      fontSize: '40px',
      color: '#fff8e1',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, 'Alessia torna a casa...', {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: '#c8e6c9',
    }).setOrigin(0.5);

    const hasSave = SaveManager.hasSave();

    this.options = [
      { label: 'Nuova Partita', action: () => this.startNewGame() },
      { label: hasSave ? 'Continua' : 'Continua (nessun salvataggio)', action: () => this.continueGame(), disabled: !hasSave },
    ];

    this.selectedIndex = 0;
    this.optionTexts = this.options.map((opt, i) => {
      const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10 + i * 40, opt.label, {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: opt.disabled ? '#7d8d7d' : '#ffffff',
      }).setOrigin(0.5).setInteractive({ useHandCursor: !opt.disabled });

      t.on('pointerover', () => this.setSelected(i));
      t.on('pointerdown', () => { if (!opt.disabled) opt.action(); });
      return t;
    });

    this.setSelected(0);

    this.input.keyboard.on('keydown-UP', () => this.moveSelection(-1));
    this.input.keyboard.on('keydown-DOWN', () => this.moveSelection(1));
    this.input.keyboard.on('keydown-ENTER', () => this.confirmSelection());
    this.input.keyboard.on('keydown-SPACE', () => this.confirmSelection());
  }

  moveSelection(delta) {
    let next = this.selectedIndex;
    do {
      next = (next + delta + this.options.length) % this.options.length;
    } while (this.options[next].disabled && next !== this.selectedIndex);
    this.setSelected(next);
  }

  setSelected(index) {
    this.selectedIndex = index;
    this.optionTexts.forEach((t, i) => {
      const opt = this.options[i];
      t.setColor(opt.disabled ? '#7d8d7d' : (i === index ? '#ffe082' : '#ffffff'));
      t.setText((i === index && !opt.disabled ? '> ' : '') + opt.label);
    });
  }

  confirmSelection() {
    const opt = this.options[this.selectedIndex];
    if (!opt.disabled) opt.action();
  }

  startNewGame() {
    const state = createNewGameState();
    this.scene.start('Farm', { state });
  }

  continueGame() {
    const saved = SaveManager.load();
    const state = saved || createNewGameState();
    this.scene.start('Farm', { state });
  }
}
