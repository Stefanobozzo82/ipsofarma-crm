// Logica di coltivazione: zappare, annaffiare, piantare, raccogliere, crescita giornaliera.
// Opera sulla mappa state.farmTiles (dizionario "x,y" -> dato tile) tenuta nel GameState.

import { farmTileKey } from '../core/GameState.js';
import { isInsideFarmableArea, TILE, TILE_PROPERTIES } from '../data/tiles.js';
import { getCropById, getCropBySeedId } from '../data/crops.js';
import { InventorySystem } from './InventorySystem.js';

const ENERGY_COST = {
  hoe: 2,
  water: 1,
  plant: 1,
  harvest: 1,
};

function getFarmTile(state, x, y) {
  return state.farmTiles[farmTileKey(x, y)] || null;
}

export const FarmingSystem = {
  hasEnergyFor(state, action) {
    return state.stats.energy >= (ENERGY_COST[action] || 0);
  },

  spendEnergy(state, action) {
    state.stats.energy = Math.max(0, state.stats.energy - (ENERGY_COST[action] || 0));
  },

  // Prova a zappare la tile (tx,ty) del layout mappa. Ritorna { ok, message }.
  hoe(state, mapTile, tx, ty) {
    if (!isInsideFarmableArea(tx, ty)) return { ok: false, message: 'Qui non si può coltivare.' };
    if (mapTile !== TILE.GRASS) return { ok: false, message: 'Non c\'è erba da zappare qui.' };
    if (!this.hasEnergyFor(state, 'hoe')) return { ok: false, message: 'Troppo stanca per continuare.' };

    const key = farmTileKey(tx, ty);
    const existing = getFarmTile(state, tx, ty);
    if (existing && existing.tilled) return { ok: false, message: 'Il terreno è già arato.' };

    state.farmTiles[key] = { tilled: true, watered: false, crop: null };
    this.spendEnergy(state, 'hoe');
    return { ok: true, message: 'Terreno arato.' };
  },

  water(state, tx, ty) {
    const tile = getFarmTile(state, tx, ty);
    if (!tile || !tile.tilled) return { ok: false, message: 'Non c\'è terreno arato qui.' };
    if (tile.watered) return { ok: false, message: 'Già annaffiato.' };
    if (!this.hasEnergyFor(state, 'water')) return { ok: false, message: 'Troppo stanca per continuare.' };

    tile.watered = true;
    this.spendEnergy(state, 'water');
    return { ok: true, message: 'Terreno annaffiato.' };
  },

  plant(state, tx, ty, seedId, currentSeason) {
    const tile = getFarmTile(state, tx, ty);
    if (!tile || !tile.tilled) return { ok: false, message: 'Serve terreno arato per piantare.' };
    if (tile.crop) return { ok: false, message: 'C\'è già una coltura qui.' };

    const crop = getCropBySeedId(seedId);
    if (!crop) return { ok: false, message: 'Questo non è un seme.' };
    if (!crop.seasons.includes(currentSeason)) {
      return { ok: false, message: `${crop.name} non si semina in ${currentSeason}.` };
    }
    if (!this.hasEnergyFor(state, 'plant')) return { ok: false, message: 'Troppo stanca per continuare.' };

    tile.crop = { cropId: crop.id, growthProgress: 0, mature: false };
    this.spendEnergy(state, 'plant');
    return { ok: true, message: `Hai piantato ${crop.name}.` };
  },

  harvest(state, tx, ty) {
    const tile = getFarmTile(state, tx, ty);
    if (!tile || !tile.crop || !tile.crop.mature) return { ok: false, message: 'Niente da raccogliere qui.' };
    if (!this.hasEnergyFor(state, 'harvest')) return { ok: false, message: 'Troppo stanca per continuare.' };

    const crop = getCropById(tile.crop.cropId);
    InventorySystem.addItem(state, crop.id, 1);
    tile.crop = null;
    tile.watered = false;
    this.spendEnergy(state, 'harvest');
    return { ok: true, message: `Hai raccolto: ${crop.name}!` };
  },

  // Vende l'intera pila selezionata nell'inventario, se è un raccolto vendibile.
  sellSelectedStack(state) {
    const selected = InventorySystem.getSelectedItem(state);
    if (!selected || selected.def.kind !== 'crop') {
      return { ok: false, message: 'Seleziona un raccolto da vendere.' };
    }
    const total = selected.qty * selected.def.sellPrice;
    InventorySystem.removeFromSlot(state, state.inventory.selectedIndex, selected.qty);
    state.stats.money += total;
    return { ok: true, message: `Venduto per ${total} monete!` };
  },

  // Chiamata a ogni cambio giorno: fa crescere le colture annaffiate, resetta l'annaffiatura.
  processNewDay(state) {
    Object.values(state.farmTiles).forEach((tile) => {
      if (tile.crop && !tile.crop.mature) {
        if (tile.watered) {
          const crop = getCropById(tile.crop.cropId);
          tile.crop.growthProgress += 1;
          if (tile.crop.growthProgress >= crop.growthDays) {
            tile.crop.mature = true;
          }
        }
      }
      tile.watered = false;
    });
  },
};

export { TILE_PROPERTIES };
