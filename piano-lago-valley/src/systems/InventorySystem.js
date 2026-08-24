// Logica di aggiunta/rimozione oggetti nell'inventario a slot dello stato di gioco.
// Puramente funzionale: riceve lo stato e lo muta, non tiene stato proprio.

import { isStackable, getItemDef } from '../data/items.js';

const STACK_LIMIT = 99;

export const InventorySystem = {
  // Ritorna true se è riuscito ad aggiungere (anche parzialmente rifiutato -> false se niente spazio).
  addItem(state, itemId, qty = 1) {
    const slots = state.inventory.slots;
    let remaining = qty;

    if (isStackable(itemId)) {
      for (const slot of slots) {
        if (remaining <= 0) break;
        if (slot && slot.itemId === itemId && slot.qty < STACK_LIMIT) {
          const canAdd = Math.min(STACK_LIMIT - slot.qty, remaining);
          slot.qty += canAdd;
          remaining -= canAdd;
        }
      }
    }

    while (remaining > 0) {
      const freeIndex = slots.findIndex((s) => s === null);
      if (freeIndex === -1) return remaining < qty; // inventario pieno, ma forse ne ha aggiunto un po'
      const canAdd = isStackable(itemId) ? Math.min(STACK_LIMIT, remaining) : 1;
      slots[freeIndex] = { itemId, qty: canAdd };
      remaining -= canAdd;
    }
    return true;
  },

  // Rimuove qty dal primo slot (o slot specifico via index) che contiene itemId.
  removeFromSlot(state, index, qty = 1) {
    const slot = state.inventory.slots[index];
    if (!slot) return false;
    if (slot.qty < qty) return false;
    slot.qty -= qty;
    if (slot.qty <= 0) state.inventory.slots[index] = null;
    return true;
  },

  getSelectedItem(state) {
    const slot = state.inventory.slots[state.inventory.selectedIndex];
    if (!slot) return null;
    return { ...slot, def: getItemDef(slot.itemId) };
  },

  selectSlot(state, index) {
    if (index >= 0 && index < state.inventory.slots.length) {
      state.inventory.selectedIndex = index;
    }
  },
};
