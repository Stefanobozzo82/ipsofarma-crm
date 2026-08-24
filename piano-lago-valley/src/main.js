// Entry point: configurazione Phaser e registrazione delle scene.
// Phaser è caricato come script globale in index.html (CDN); qui viene importato
// solo per i suoi tipi/uso, dato che questo file è un modulo ES nativo.

import { GAME_WIDTH, GAME_HEIGHT } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { FarmScene } from './scenes/FarmScene.js';
import { UIScene } from './scenes/UIScene.js';

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  pixelArt: true,
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, FarmScene, UIScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
