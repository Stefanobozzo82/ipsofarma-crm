// Definizione delle colture. growthStages è la lista dei giorni "cumulativi" annaffiati
// necessari per passare da uno stadio visivo al successivo; l'ultimo valore è la maturazione.
// Per l'MVP sono disponibili solo colture di Primavera; le altre stagioni arriveranno dopo.

export const CROPS = {
  rapa: {
    id: 'rapa',
    name: 'Rapa',
    seedId: 'semi_rapa',
    seedName: 'Semi di Rapa',
    seedBuyPrice: 20,
    sellPrice: 35,
    seasons: ['Primavera'],
    growthDays: 4,
    stageColors: ['#8bc34a', '#689f38', '#558b2f', '#9c6ade'], // germoglio -> pianta -> matura
    harvestColor: '#9575cd',
  },
  patata: {
    id: 'patata',
    name: 'Patata',
    seedId: 'semi_patata',
    seedName: 'Semi di Patata',
    seedBuyPrice: 30,
    sellPrice: 80,
    seasons: ['Primavera'],
    growthDays: 6,
    stageColors: ['#8bc34a', '#689f38', '#558b2f', '#558b2f', '#c9a26d', '#c9a26d'],
    harvestColor: '#d7ccc8',
  },
  cavolfiore: {
    id: 'cavolfiore',
    name: 'Cavolfiore',
    seedId: 'semi_cavolfiore',
    seedName: 'Semi di Cavolfiore',
    seedBuyPrice: 80,
    sellPrice: 175,
    seasons: ['Primavera'],
    growthDays: 12,
    stageColors: ['#8bc34a', '#689f38', '#558b2f', '#558b2f', '#558b2f', '#558b2f', '#558b2f', '#558b2f', '#558b2f', '#558b2f', '#558b2f', '#f5f5f5'],
    harvestColor: '#f5f5f5',
  },
};

export function getCropById(id) {
  return CROPS[id] || null;
}

export function getCropBySeedId(seedId) {
  return Object.values(CROPS).find((c) => c.seedId === seedId) || null;
}
