// Catalogo oggetti: strumenti (non stackabili, non consumabili) e oggetti stackabili
// (semi, raccolti, materiali). Le colture in crops.js generano automaticamente le
// voci "seme" e "raccolto" corrispondenti tramite getItemDef.

import { CROPS } from './crops.js';

export const TOOLS = {
  zappa: { id: 'zappa', name: 'Zappa', kind: 'tool', color: '#8d6e63', action: 'hoe' },
  annaffiatoio: { id: 'annaffiatoio', name: 'Annaffiatoio', kind: 'tool', color: '#4fc3f7', action: 'water' },
  ascia: { id: 'ascia', name: 'Ascia', kind: 'tool', color: '#a1887f', action: 'chop' },
  piccone: { id: 'piccone', name: 'Piccone', kind: 'tool', color: '#90a4ae', action: 'mine' },
  canna_da_pesca: { id: 'canna_da_pesca', name: 'Canna da Pesca', kind: 'tool', color: '#bcaaa4', action: 'fish' },
};

// Restituisce la definizione (nome, colore, tipo, prezzo di vendita) per un item id,
// cercando fra strumenti, semi e raccolti.
export function getItemDef(itemId) {
  if (TOOLS[itemId]) return TOOLS[itemId];

  for (const crop of Object.values(CROPS)) {
    if (crop.seedId === itemId) {
      return { id: crop.seedId, name: crop.seedName, kind: 'seed', color: '#dce775', cropId: crop.id, buyPrice: crop.seedBuyPrice };
    }
    if (crop.id === itemId) {
      return { id: crop.id, name: crop.name, kind: 'crop', color: crop.harvestColor, sellPrice: crop.sellPrice };
    }
  }
  return { id: itemId, name: itemId, kind: 'unknown', color: '#999999' };
}

export function isStackable(itemId) {
  const def = getItemDef(itemId);
  return def.kind === 'seed' || def.kind === 'crop' || def.kind === 'material';
}
