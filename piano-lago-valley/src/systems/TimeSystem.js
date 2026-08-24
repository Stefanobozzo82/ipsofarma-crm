// Orologio di gioco: avanzamento minuti, formattazione oraria, cambio giorno/stagione/anno.
// Non tocca farming/inventario direttamente: FarmScene orchestra la sequenza di fine giornata
// chiamando in ordine TimeSystem.startNewDay() e FarmingSystem.processNewDay().

import {
  GAME_MINUTES_PER_REAL_SECOND,
  DAY_START_MINUTES,
  DAY_FORCED_END_MINUTES,
  SEASONS,
  DAYS_PER_SEASON,
  MAX_ENERGY,
} from '../config.js';

export const TimeSystem = {
  // Avanza l'orologio in base al delta reale (ms). Ritorna true se è scattata la
  // fine forzata della giornata (26:00, il player crolla dalla stanchezza).
  update(state, deltaMs) {
    const deltaMinutes = (deltaMs / 1000) * GAME_MINUTES_PER_REAL_SECOND;
    state.time.minutes += deltaMinutes;
    return state.time.minutes >= DAY_FORCED_END_MINUTES;
  },

  // Formatta i minuti di gioco in stringa "HH:MM" a 24h+ (supporta ore >24 tipo 26:00).
  formatClock(minutesFloat) {
    const totalMinutes = Math.floor(minutesFloat);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  isNight(minutesFloat) {
    // Sera/notte da dopo le 19:00 a prima delle 6:00 (usato per il tint visivo).
    const m = Math.floor(minutesFloat) % (24 * 60);
    return m >= 19 * 60 || m < 6 * 60;
  },

  // Fattore 0..1 di oscurità per il tint giorno/notte (0 = pieno giorno, 1 = notte fonda).
  nightFactor(minutesFloat) {
    const m = Math.floor(minutesFloat) % (24 * 60);
    const duskStart = 18 * 60;
    const nightFull = 21 * 60;
    const dawnStart = 5 * 60;
    const dayFull = 7 * 60;

    if (m >= nightFull || m < dawnStart) return 1;
    if (m >= duskStart && m < nightFull) return (m - duskStart) / (nightFull - duskStart);
    if (m >= dawnStart && m < dayFull) return 1 - (m - dawnStart) / (dayFull - dawnStart);
    return 0;
  },

  // Fa scattare il nuovo giorno: avanza data/stagione/anno, resetta orario ed energia.
  // Il chiamante (FarmScene) si occupa separatamente di far crescere le colture.
  startNewDay(state) {
    state.time.day += 1;
    if (state.time.day > DAYS_PER_SEASON) {
      state.time.day = 1;
      const seasonIndex = SEASONS.indexOf(state.time.season);
      const nextSeasonIndex = (seasonIndex + 1) % SEASONS.length;
      state.time.season = SEASONS[nextSeasonIndex];
      if (nextSeasonIndex === 0) state.time.year += 1;
    }
    state.time.minutes = DAY_START_MINUTES;
    state.stats.energy = state.stats.maxEnergy || MAX_ENERGY;
  },
};
