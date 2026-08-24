// Wrapper minimale su localStorage per salvare/caricare lo stato di gioco.

import { SAVE_KEY } from '../config.js';

export const SaveManager = {
  hasSave() {
    try {
      return localStorage.getItem(SAVE_KEY) !== null;
    } catch (e) {
      return false;
    }
  },

  save(state) {
    try {
      const payload = JSON.stringify({ savedAt: Date.now(), state });
      localStorage.setItem(SAVE_KEY, payload);
      return true;
    } catch (e) {
      console.warn('Salvataggio fallito:', e);
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.state || null;
    } catch (e) {
      console.warn('Caricamento fallito:', e);
      return null;
    }
  },

  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      // ignora
    }
  },
};
