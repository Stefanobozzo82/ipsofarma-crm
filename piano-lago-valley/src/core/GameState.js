// Stato di gioco centralizzato e serializzabile. Ogni sistema (tempo, farming,
// inventario...) legge/scrive qui dentro invece di tenere stato proprio, così
// il salvataggio è semplicemente "JSON.stringify(state)".

import { DIRECTIONS, DAY_START_MINUTES, MAX_ENERGY, SEASONS } from '../config.js';

export function createNewGameState() {
  return {
    version: 1,
    meta: {
      farmName: 'Piano Lago',
      playerName: 'Alessia',
    },
    time: {
      minutes: DAY_START_MINUTES, // minuti dalla mezzanotte, es. 360 = 6:00
      day: 1, // giorno all'interno della stagione (1-28)
      season: SEASONS[0],
      year: 1,
    },
    player: {
      tileX: 6,
      tileY: 7,
      facing: DIRECTIONS.DOWN,
    },
    stats: {
      money: 500,
      energy: MAX_ENERGY,
      maxEnergy: MAX_ENERGY,
    },
    // Inventario: array a slot fissi. null = slot vuoto. { itemId, qty }
    inventory: {
      slots: buildStartingInventory(),
      selectedIndex: 0,
    },
    // Terreno coltivato: chiave "x,y" -> { tilled, watered, crop: { cropId, plantedDay, plantedSeason, growthProgress } | null }
    farmTiles: {},
  };
}

function buildStartingInventory() {
  const size = 12;
  const slots = new Array(size).fill(null);
  slots[0] = { itemId: 'zappa', qty: 1 };
  slots[1] = { itemId: 'annaffiatoio', qty: 1 };
  slots[2] = { itemId: 'ascia', qty: 1 };
  slots[3] = { itemId: 'piccone', qty: 1 };
  slots[4] = { itemId: 'semi_rapa', qty: 10 };
  return slots;
}

export function farmTileKey(x, y) {
  return `${x},${y}`;
}
