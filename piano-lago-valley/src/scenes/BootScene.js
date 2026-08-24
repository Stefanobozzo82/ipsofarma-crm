// Genera tutte le texture placeholder (rettangoli/forme colorate) via Canvas/Graphics,
// così possiamo iterare sulle meccaniche prima di avere sprite pixel art definitivi.

import { TILE_SIZE } from '../config.js';

const T = TILE_SIZE;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    this.makeGrassTile();
    this.makePathTile();
    this.makeWaterTile();
    this.makeTreeTile();
    this.makeRockTile();
    this.makeHouseWallTile();
    this.makeHouseDoorTile();
    this.makeShippingBinTile();
    this.makeFenceTile();
    this.makeTilledTile('tile_tilled_dry', 0x8b5a2b, 0x6d4520);
    this.makeTilledTile('tile_tilled_wet', 0x5b3a1a, 0x432a13);
    this.makePlayerTextures();

    this.scene.start('Menu');
  }

  g() {
    return this.make.graphics({ x: 0, y: 0, add: false });
  }

  finish(key, g) {
    g.generateTexture(key, T, T);
    g.destroy();
  }

  makeGrassTile() {
    const g = this.g();
    g.fillStyle(0x7cb342, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(0x689f38, 1);
    g.fillCircle(8, 10, 2);
    g.fillCircle(22, 20, 2.5);
    g.fillCircle(15, 25, 1.8);
    this.finish('tile_grass', g);
  }

  makePathTile() {
    const g = this.g();
    g.fillStyle(0xc9a876, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(0xb9946a, 1);
    g.fillCircle(10, 8, 2);
    g.fillCircle(20, 22, 2.2);
    this.finish('tile_path', g);
  }

  makeWaterTile() {
    const g = this.g();
    g.fillStyle(0x4fa8d8, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(0x7cc3ea, 1);
    g.fillRect(4, 14, 24, 2);
    g.fillRect(2, 22, 20, 2);
    this.finish('tile_water', g);
  }

  makeTreeTile() {
    const g = this.g();
    g.fillStyle(0x7cb342, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(0x6d4c31, 1);
    g.fillRect(T / 2 - 3, 20, 6, 10);
    g.fillStyle(0x2e7d32, 1);
    g.fillCircle(T / 2, 14, 13);
    g.fillStyle(0x388e3c, 1);
    g.fillCircle(T / 2 - 5, 10, 6);
    this.finish('tile_tree', g);
  }

  makeRockTile() {
    const g = this.g();
    g.fillStyle(0x7cb342, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(0x8a8a8a, 1);
    g.fillEllipse(T / 2, T / 2 + 4, 22, 16);
    g.fillStyle(0x9e9e9e, 1);
    g.fillEllipse(T / 2 - 4, T / 2, 8, 6);
    this.finish('tile_rock', g);
  }

  makeHouseWallTile() {
    const g = this.g();
    g.fillStyle(0xa0522d, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(0x7b241c, 1);
    g.fillRect(0, 0, T, 6);
    g.lineStyle(1, 0x6d3a1f, 1);
    g.strokeRect(0.5, 0.5, T - 1, T - 1);
    this.finish('tile_house_wall', g);
  }

  makeHouseDoorTile() {
    const g = this.g();
    g.fillStyle(0x6d4520, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(0xffd54f, 1);
    g.fillRect(6, 4, T - 12, T - 8);
    g.fillStyle(0x6d4520, 1);
    g.fillCircle(T - 12, T / 2, 1.5);
    this.finish('tile_house_door', g);
  }

  makeShippingBinTile() {
    const g = this.g();
    g.fillStyle(0x7cb342, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(0x455a64, 1);
    g.fillRoundedRect(3, 8, T - 6, T - 12, 4);
    g.fillStyle(0xffa000, 1);
    g.fillRect(3, 8, T - 6, 5);
    this.finish('tile_shipping_bin', g);
  }

  makeFenceTile() {
    const g = this.g();
    g.fillStyle(0x7cb342, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(0x8d6e63, 1);
    g.fillRect(2, 6, 4, T - 6);
    g.fillRect(T - 6, 6, 4, T - 6);
    g.fillRect(0, 12, T, 4);
    this.finish('tile_fence', g);
  }

  makeTilledTile(key, baseColor, furrowColor) {
    const g = this.g();
    g.fillStyle(baseColor, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(furrowColor, 1);
    for (let y = 4; y < T; y += 8) {
      g.fillRect(2, y, T - 4, 3);
    }
    this.finish(key, g);
  }

  makePlayerTextures() {
    const tunic = 0x3949ab;
    const skin = 0xffcc80;
    const hair = 0x5d4037;

    // DOWN: viso visibile
    let g = this.g();
    g.fillStyle(tunic, 1); g.fillRoundedRect(8, 16, 16, 14, 3);
    g.fillStyle(skin, 1); g.fillCircle(16, 12, 8);
    g.fillStyle(hair, 1); g.fillRect(8, 4, 16, 8);
    g.fillStyle(0x000000, 1); g.fillCircle(13, 12, 1.3); g.fillCircle(19, 12, 1.3);
    this.finish('player_down', g);

    // UP: solo nuca/capelli
    g = this.g();
    g.fillStyle(tunic, 1); g.fillRoundedRect(8, 16, 16, 14, 3);
    g.fillStyle(skin, 1); g.fillCircle(16, 12, 8);
    g.fillStyle(hair, 1); g.fillRect(7, 4, 18, 11);
    this.finish('player_up', g);

    // LEFT: profilo verso sinistra
    g = this.g();
    g.fillStyle(tunic, 1); g.fillRoundedRect(8, 16, 16, 14, 3);
    g.fillStyle(skin, 1); g.fillCircle(15, 12, 8);
    g.fillStyle(hair, 1); g.fillRect(7, 4, 16, 9);
    g.fillStyle(0x000000, 1); g.fillCircle(10, 12, 1.3);
    g.fillStyle(tunic, 1); g.fillTriangle(4, 26, 10, 22, 10, 30);
    this.finish('player_left', g);

    // RIGHT: profilo verso destra (specchiato)
    g = this.g();
    g.fillStyle(tunic, 1); g.fillRoundedRect(8, 16, 16, 14, 3);
    g.fillStyle(skin, 1); g.fillCircle(17, 12, 8);
    g.fillStyle(hair, 1); g.fillRect(9, 4, 16, 9);
    g.fillStyle(0x000000, 1); g.fillCircle(22, 12, 1.3);
    g.fillStyle(tunic, 1); g.fillTriangle(28, 26, 22, 22, 22, 30);
    this.finish('player_right', g);
  }
}
