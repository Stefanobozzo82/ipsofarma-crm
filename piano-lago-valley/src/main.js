// Entry point: configurazione Phaser e registrazione delle scene.
// Phaser è caricato come script globale in index.html (CDN); qui viene importato
// solo per i suoi tipi/uso, dato che questo file è un modulo ES nativo.

import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { FarmScene } from './scenes/FarmScene.js';
import { UIScene } from './scenes/UIScene.js';

const config = {
  type: Phaser.AUTO,
  width: VIEWPORT_WIDTH,
  height: VIEWPORT_HEIGHT,
  parent: 'game-container',
  pixelArt: true,
  backgroundColor: '#000000',
  scale: {
    // FIT: il viewport 360x640 (verticale, formato telefono) viene scalato per
    // riempire qualsiasi schermo mantenendo le proporzioni (letterbox su desktop).
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    // Serve più di un puntatore attivo per muoversi con il D-pad virtuale e
    // premere il pulsante di interazione nello stesso momento (multi-touch).
    activePointers: 3,
  },
  disableContextMenu: true,
  scene: [BootScene, MenuScene, FarmScene, UIScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
