// Scena principale: mappa della fattoria, movimento del player, interazioni di
// coltivazione, ciclo giorno/notte, cassa di spedizione, sonno/nuovo giorno.

import {
  TILE_SIZE, FARM_COLS, FARM_ROWS, GAME_WIDTH, GAME_HEIGHT, DIRECTIONS,
} from '../config.js';
import { buildFarmMapLayout, TILE_PROPERTIES } from '../data/tiles.js';
import { getCropById } from '../data/crops.js';
import { farmTileKey } from '../core/GameState.js';
import { SaveManager } from '../core/SaveManager.js';
import { TimeSystem } from '../systems/TimeSystem.js';
import { FarmingSystem } from '../systems/FarmingSystem.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { Player } from '../entities/Player.js';

function hexToNum(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export class FarmScene extends Phaser.Scene {
  constructor() {
    super('Farm');
  }

  init(data) {
    this.state = data.state;
  }

  create() {
    this.mapLayout = buildFarmMapLayout();
    this.tileVisuals = new Map(); // "x,y" -> { soil, crop }
    this.dayTransitioning = false;

    this.buildStaticLayer();
    this.redrawAllFarmTiles();

    this.player = new Player(this, this.state.player, (tx, ty) => this.canMoveTo(tx, ty));

    this.nightOverlay = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a1a3a, 0)
      .setOrigin(0, 0)
      .setDepth(50);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.input.keyboard.on('keydown-E', () => this.interact());
    this.input.keyboard.on('keydown-SPACE', () => this.interact());
    this.input.keyboard.on('keydown-I', () => this.uiScene.toggleInventory());
    this.input.keyboard.on('keydown', (event) => {
      const num = parseInt(event.key, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= 9) {
        InventorySystem.selectSlot(this.state, num - 1);
        this.uiScene.refreshAll();
      }
    });

    this.scene.launch('UI', { state: this.state });
    this.uiScene = this.scene.get('UI');

    // Autosave periodico "di sicurezza", oltre a quello a fine giornata.
    this.time.addEvent({ delay: 120000, loop: true, callback: () => SaveManager.save(this.state) });

    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  buildStaticLayer() {
    const rt = this.add.renderTexture(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0, 0).setDepth(0);
    const stamp = this.add.image(0, 0, 'tile_grass').setOrigin(0, 0).setVisible(false);
    for (let y = 0; y < FARM_ROWS; y++) {
      for (let x = 0; x < FARM_COLS; x++) {
        const tileType = this.mapLayout[y][x];
        stamp.setTexture(TILE_PROPERTIES[tileType].textureKey);
        rt.draw(stamp, x * TILE_SIZE, y * TILE_SIZE);
      }
    }
    stamp.destroy();
  }

  canMoveTo(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= FARM_COLS || ty >= FARM_ROWS) return false;
    const tileType = this.mapLayout[ty][tx];
    return TILE_PROPERTIES[tileType].walkable;
  }

  update(time, delta) {
    if (this.dayTransitioning) return;

    const forcedEnd = TimeSystem.update(this.state, delta);
    this.applyNightTint();

    if (forcedEnd) {
      this.goToSleep(true);
      return;
    }

    if (!this.uiScene.isInventoryOpen) {
      this.player.handleInput(this.cursors, this.wasd);
    }
  }

  applyNightTint() {
    const factor = TimeSystem.nightFactor(this.state.time.minutes);
    this.nightOverlay.setAlpha(factor * 0.55);
  }

  interact() {
    if (this.dayTransitioning || this.uiScene.isInventoryOpen) return;

    const { x: tx, y: ty } = this.player.getTargetTile();
    if (tx < 0 || ty < 0 || tx >= FARM_COLS || ty >= FARM_ROWS) return;

    const mapTile = this.mapLayout[ty][tx];
    const props = TILE_PROPERTIES[mapTile];

    if (props.isBed) {
      this.goToSleep(false);
      return;
    }

    if (props.isShippingBin) {
      const res = FarmingSystem.sellSelectedStack(this.state);
      this.toast(res.message);
      if (res.ok) this.uiScene.refreshAll();
      return;
    }

    const farmTile = this.state.farmTiles[farmTileKey(tx, ty)];
    if (farmTile && farmTile.crop && farmTile.crop.mature) {
      const res = FarmingSystem.harvest(this.state, tx, ty);
      this.toast(res.message);
      if (res.ok) {
        this.refreshFarmTileVisual(tx, ty);
        this.uiScene.refreshAll();
      }
      return;
    }

    const selected = InventorySystem.getSelectedItem(this.state);
    if (!selected) {
      this.toast('Nessun oggetto selezionato.');
      return;
    }

    if (selected.def.kind === 'tool') {
      this.useTool(selected.def, mapTile, tx, ty);
    } else if (selected.def.kind === 'seed') {
      const res = FarmingSystem.plant(this.state, tx, ty, selected.itemId, this.state.time.season);
      this.toast(res.message);
      if (res.ok) {
        InventorySystem.removeFromSlot(this.state, this.state.inventory.selectedIndex, 1);
        this.refreshFarmTileVisual(tx, ty);
        this.uiScene.refreshAll();
      }
    } else {
      this.toast('Non puoi usare questo oggetto qui.');
    }
  }

  useTool(toolDef, mapTile, tx, ty) {
    let res;
    switch (toolDef.action) {
      case 'hoe':
        res = FarmingSystem.hoe(this.state, mapTile, tx, ty);
        break;
      case 'water':
        res = FarmingSystem.water(this.state, tx, ty);
        break;
      default:
        res = { ok: false, message: `${toolDef.name}: funzionalità in arrivo in una prossima iterazione.` };
    }
    this.toast(res.message);
    if (res.ok) {
      this.refreshFarmTileVisual(tx, ty);
      this.uiScene.refreshAll();
    }
  }

  refreshFarmTileVisual(tx, ty) {
    const key = farmTileKey(tx, ty);
    const existing = this.tileVisuals.get(key);
    if (existing) {
      existing.soil.destroy();
      if (existing.crop) existing.crop.destroy();
      this.tileVisuals.delete(key);
    }

    const tile = this.state.farmTiles[key];
    if (!tile || !tile.tilled) return;

    const px = tx * TILE_SIZE;
    const py = ty * TILE_SIZE;
    const soilTexture = tile.watered ? 'tile_tilled_wet' : 'tile_tilled_dry';
    const soil = this.add.image(px, py, soilTexture).setOrigin(0, 0).setDepth(1);

    let cropObj = null;
    if (tile.crop) {
      const cropDef = getCropById(tile.crop.cropId);
      const idx = Math.min(tile.crop.growthProgress, cropDef.stageColors.length - 1);
      const colorHex = tile.crop.mature ? cropDef.harvestColor : cropDef.stageColors[idx];
      const radius = tile.crop.mature ? 11 : 5 + Math.min(tile.crop.growthProgress, 6);
      cropObj = this.add.circle(px + TILE_SIZE / 2, py + TILE_SIZE / 2, radius, hexToNum(colorHex)).setDepth(2);
      if (tile.crop.mature) cropObj.setStrokeStyle(2, 0xffffff, 0.9);
    }

    this.tileVisuals.set(key, { soil, crop: cropObj });
  }

  redrawAllFarmTiles() {
    this.tileVisuals.forEach((v) => {
      v.soil.destroy();
      if (v.crop) v.crop.destroy();
    });
    this.tileVisuals.clear();
    Object.keys(this.state.farmTiles).forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      this.refreshFarmTileVisual(x, y);
    });
  }

  goToSleep(forced) {
    this.dayTransitioning = true;
    this.toast(forced ? 'Sei crollata dalla stanchezza...' : 'Buonanotte, Alessia...');

    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      FarmingSystem.processNewDay(this.state);
      TimeSystem.startNewDay(this.state);

      this.state.player.tileX = 6;
      this.state.player.tileY = 7;
      this.state.player.facing = DIRECTIONS.DOWN;
      this.player.sprite.setPosition(
        this.state.player.tileX * TILE_SIZE + TILE_SIZE / 2,
        this.state.player.tileY * TILE_SIZE + TILE_SIZE / 2,
      );
      this.player.sprite.setTexture('player_down');

      this.redrawAllFarmTiles();
      SaveManager.save(this.state);

      this.uiScene.refreshAll();
      this.uiScene.showDayBanner(`${this.state.time.season} - Giorno ${this.state.time.day}, Anno ${this.state.time.year}`);

      this.cameras.main.fadeIn(500, 0, 0, 0);
      this.dayTransitioning = false;
    });
  }

  toast(message) {
    if (this.uiScene) this.uiScene.showToast(message);
  }
}
