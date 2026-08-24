// HUD e interfacce a schermo: orologio/data/stagione, energia, denaro, hotbar,
// pannello inventario, messaggi toast, D-pad e pulsanti touch. Gira in parallelo a
// FarmScene (stesso GameState passato per riferimento, quindi qualunque modifica
// fatta da FarmScene è visibile qui). Ha una camera propria e fissa: non scrolla
// mai insieme al mondo, quindi resta leggibile mentre la camera di FarmScene segue
// il player sulla mappa.

import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT, MAX_ENERGY } from '../config.js';
import { TimeSystem } from '../systems/TimeSystem.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { TouchInput } from '../core/TouchInput.js';
import { getItemDef } from '../data/items.js';

const HOTBAR_SIZE = 5;
const SLOT_SIZE = 38;
// La riga di hotbar è ancorata sopra il D-pad/pulsante azione (vedi buildTouchControls);
// altri elementi (toast) si posizionano relativi a questa così restano sempre coerenti
// se in futuro si sposta la fila dei controlli.
const HOTBAR_Y = VIEWPORT_HEIGHT - 172;

export class UIScene extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  init(data) {
    this.state = data.state;
  }

  create() {
    this.isInventoryOpen = false;
    this.toastTimer = null;
    this.farmScene = this.scene.get('Farm');

    this.buildHud();
    this.buildHotbar();
    this.buildTouchControls();
    this.buildInventoryPanel();
    this.buildToast();
    this.buildDayBanner();

    this.input.keyboard.on('keydown-ESC', () => {
      if (this.isInventoryOpen) this.toggleInventory();
    });

    // Se un dito scivola via da un pulsante direzionale senza passare per il suo
    // pointerup, questo evita che la direzione resti "incollata" a true.
    this.input.on('pointerup', () => TouchInput.resetDirections());

    this.refreshAll();
  }

  update() {
    this.clockText.setText(TimeSystem.formatClock(this.state.time.minutes));
    this.dateText.setText(`${this.state.time.season} · G${this.state.time.day} · A${this.state.time.year}`);
    this.moneyText.setText(`${this.state.stats.money} monete`);
    this.updateEnergyBar();
  }

  // ---------- HUD superiore ----------

  buildHud() {
    this.add.rectangle(0, 0, VIEWPORT_WIDTH, 36, 0x1b1b1b, 0.6).setOrigin(0, 0).setDepth(100);

    this.clockText = this.add.text(8, 4, '06:00', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffe082',
    }).setDepth(101);

    this.dateText = this.add.text(VIEWPORT_WIDTH / 2, 4, '', {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#e0f2f1',
    }).setOrigin(0.5, 0).setDepth(101);

    this.moneyText = this.add.text(VIEWPORT_WIDTH - 8, 21, '', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#fff176',
    }).setOrigin(1, 0.5).setDepth(101);

    this.energyBarBg = this.add.rectangle(8, 21, 90, 8, 0x333333).setOrigin(0, 0.5).setDepth(101);
    this.energyBarFg = this.add.rectangle(8, 21, 90, 8, 0x66bb6a).setOrigin(0, 0.5).setDepth(102);
  }

  updateEnergyBar() {
    const ratio = Phaser.Math.Clamp(this.state.stats.energy / (this.state.stats.maxEnergy || MAX_ENERGY), 0, 1);
    this.energyBarFg.width = 90 * ratio;
    this.energyBarFg.setFillStyle(ratio > 0.3 ? 0x66bb6a : 0xe57373);
  }

  // ---------- Hotbar ----------

  buildHotbar() {
    const totalWidth = HOTBAR_SIZE * (SLOT_SIZE + 4) - 4;
    const startX = VIEWPORT_WIDTH / 2 - totalWidth / 2;
    const y = HOTBAR_Y;

    this.hotbarSlots = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const x = startX + i * (SLOT_SIZE + 4) + SLOT_SIZE / 2;
      const bg = this.add.rectangle(x, y, SLOT_SIZE, SLOT_SIZE, 0x2b2b2b, 0.75).setStrokeStyle(2, 0x888888).setDepth(100);
      const icon = this.add.rectangle(x, y, SLOT_SIZE - 12, SLOT_SIZE - 12, 0x999999).setDepth(101);
      const qty = this.add.text(x + SLOT_SIZE / 2 - 4, y + SLOT_SIZE / 2 - 4, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#ffffff',
      }).setOrigin(1, 1).setDepth(102);
      const num = this.add.text(x - SLOT_SIZE / 2 + 3, y - SLOT_SIZE / 2 + 1, String(i + 1), {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#cccccc',
      }).setDepth(102);

      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        InventorySystem.selectSlot(this.state, i);
        this.refreshAll();
      });

      this.hotbarSlots.push({ bg, icon, qty, num });
    }
  }

  refreshHotbar() {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slotData = this.state.inventory.slots[i];
      const ui = this.hotbarSlots[i];
      ui.bg.setStrokeStyle(2, i === this.state.inventory.selectedIndex ? 0xffe082 : 0x888888);

      if (slotData) {
        const def = getItemDef(slotData.itemId);
        ui.icon.setVisible(true).setFillStyle(hexToNum(def.color));
        ui.qty.setText(slotData.qty > 1 ? String(slotData.qty) : '');
      } else {
        ui.icon.setVisible(false);
        ui.qty.setText('');
      }
    }
  }

  // ---------- Controlli touch: D-pad + pulsante azione + pulsante inventario ----------

  buildTouchControls() {
    // Margine dal bordo inferiore generoso: su molti telefoni lì sotto c'è la
    // barra dei gesti di sistema (o l'home indicator iOS), non solo il bordo schermo.
    const padCenterX = 72;
    const padCenterY = VIEWPORT_HEIGHT - 84;
    const padOffset = 40;
    const btnSize = 38;

    this.makeDirectionButton(padCenterX, padCenterY - padOffset, btnSize, '▲', 'up');
    this.makeDirectionButton(padCenterX, padCenterY + padOffset, btnSize, '▼', 'down');
    this.makeDirectionButton(padCenterX - padOffset, padCenterY, btnSize, '◀', 'left');
    this.makeDirectionButton(padCenterX + padOffset, padCenterY, btnSize, '▶', 'right');

    const actionX = VIEWPORT_WIDTH - 52;
    const actionY = padCenterY;
    const actionBg = this.add.circle(actionX, actionY, 32, 0x2b2b2b, 0.7).setStrokeStyle(2, 0xffe082).setDepth(100);
    this.add.text(actionX, actionY, 'AZIONE', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#ffe082', align: 'center',
    }).setOrigin(0.5).setDepth(101);

    actionBg.setInteractive({ useHandCursor: true });
    actionBg.on('pointerdown', () => {
      actionBg.setFillStyle(0xffe082, 0.5);
      this.farmScene.interact();
    });
    actionBg.on('pointerup', () => actionBg.setFillStyle(0x2b2b2b, 0.7));
    actionBg.on('pointerout', () => actionBg.setFillStyle(0x2b2b2b, 0.7));

    const invX = VIEWPORT_WIDTH - 20;
    const invY = 54;
    const invBg = this.add.rectangle(invX, invY, 32, 32, 0x2b2b2b, 0.7).setStrokeStyle(2, 0x888888).setDepth(100)
      .setInteractive({ useHandCursor: true });
    this.add.text(invX, invY, 'I', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(101);
    invBg.on('pointerdown', () => this.toggleInventory());
  }

  makeDirectionButton(x, y, size, label, direction) {
    const bg = this.add.rectangle(x, y, size, size, 0x2b2b2b, 0.6).setStrokeStyle(2, 0x888888).setDepth(100);
    this.add.text(x, y, label, {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(101);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      TouchInput[direction] = true;
      bg.setFillStyle(0xffe082, 0.55);
    });
    const release = () => {
      TouchInput[direction] = false;
      bg.setFillStyle(0x2b2b2b, 0.6);
    };
    bg.on('pointerup', release);
    bg.on('pointerout', release);
  }

  // ---------- Pannello inventario ----------

  buildInventoryPanel() {
    this.invContainer = this.add.container(0, 0).setDepth(200).setVisible(false);

    const panelW = VIEWPORT_WIDTH - 40;
    const panelH = 240;
    const px = VIEWPORT_WIDTH / 2 - panelW / 2;
    const py = VIEWPORT_HEIGHT / 2 - panelH / 2;

    const bg = this.add.rectangle(px, py, panelW, panelH, 0x1b1b1b, 0.94).setOrigin(0, 0).setStrokeStyle(2, 0xffe082);
    const title = this.add.text(VIEWPORT_WIDTH / 2, py + 14, 'Inventario', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#ffe082',
    }).setOrigin(0.5);
    const hint = this.add.text(VIEWPORT_WIDTH / 2, py + panelH - 14, 'Tocca per selezionare · [I] chiude', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#bbbbbb',
    }).setOrigin(0.5);

    this.invContainer.add([bg, title, hint]);

    const cols = 4;
    const size = 46;
    const gap = 8;
    const gridW = cols * size + (cols - 1) * gap;
    const startX = VIEWPORT_WIDTH / 2 - gridW / 2 + size / 2;
    const startY = py + 46;

    this.invSlotsUi = this.state.inventory.slots.map((_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (size + gap);
      const y = startY + row * (size + gap);

      const slotBg = this.add.rectangle(x, y, size, size, 0x2b2b2b).setStrokeStyle(1, 0x888888)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          InventorySystem.selectSlot(this.state, i);
          this.refreshAll();
        });
      const icon = this.add.rectangle(x, y, size - 16, size - 16, 0x999999);
      const qty = this.add.text(x + size / 2 - 4, y + size / 2 - 4, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#ffffff',
      }).setOrigin(1, 1);

      this.invContainer.add([slotBg, icon, qty]);
      return { slotBg, icon, qty };
    });
  }

  refreshInventoryPanel() {
    this.state.inventory.slots.forEach((slotData, i) => {
      const ui = this.invSlotsUi[i];
      ui.slotBg.setStrokeStyle(1, i === this.state.inventory.selectedIndex ? 0xffe082 : 0x888888);
      if (slotData) {
        const def = getItemDef(slotData.itemId);
        ui.icon.setVisible(true).setFillStyle(hexToNum(def.color));
        ui.qty.setText(slotData.qty > 1 ? String(slotData.qty) : '');
      } else {
        ui.icon.setVisible(false);
        ui.qty.setText('');
      }
    });
  }

  toggleInventory() {
    this.isInventoryOpen = !this.isInventoryOpen;
    this.invContainer.setVisible(this.isInventoryOpen);
    if (this.isInventoryOpen) {
      TouchInput.resetDirections();
      this.refreshInventoryPanel();
    }
  }

  // ---------- Toast / banner ----------

  buildToast() {
    this.toastText = this.add.text(VIEWPORT_WIDTH / 2, HOTBAR_Y - SLOT_SIZE - 14, '', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
      align: 'center',
      wordWrap: { width: VIEWPORT_WIDTH - 40 },
    }).setOrigin(0.5).setDepth(150).setAlpha(0);
  }

  showToast(message) {
    if (!message) return;
    this.toastText.setText(message).setAlpha(1);
    if (this.toastTimer) this.toastTimer.remove(false);
    this.toastTimer = this.time.delayedCall(2200, () => {
      this.tweens.add({ targets: this.toastText, alpha: 0, duration: 400 });
    });
  }

  buildDayBanner() {
    this.dayBannerText = this.add.text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2, '', {
      fontFamily: 'Georgia, serif', fontSize: '20px', color: '#fff8e1',
      backgroundColor: '#000000aa', padding: { x: 16, y: 10 },
      align: 'center',
      wordWrap: { width: VIEWPORT_WIDTH - 40 },
    }).setOrigin(0.5).setDepth(160).setAlpha(0);
  }

  showDayBanner(text) {
    this.dayBannerText.setText(text).setAlpha(1);
    this.time.delayedCall(1800, () => {
      this.tweens.add({ targets: this.dayBannerText, alpha: 0, duration: 500 });
    });
  }

  // ---------- API pubblica ----------

  refreshAll() {
    this.refreshHotbar();
    if (this.isInventoryOpen) this.refreshInventoryPanel();
  }
}

function hexToNum(hex) {
  return parseInt(hex.replace('#', ''), 16);
}
