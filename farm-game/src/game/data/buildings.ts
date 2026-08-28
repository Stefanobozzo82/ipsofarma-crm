import type { BuildingDef, Recipe } from '../types'
import alberoSprite from '../../assets/farm/albero.png'
import girasoleSprite from '../../assets/farm/girasole.png'

// Edifici: habitat per animali, edifici di produzione (crafting) e decorazioni.
export const BUILDINGS: BuildingDef[] = [
  // --- Habitat ---
  {
    id: 'pollaio',
    name: 'Pollaio',
    emoji: '🏠',
    category: 'habitat',
    cost: 50,
    unlockLevel: 1,
    capacity: 4,
    description: 'Ospita fino a 4 galline.',
  },
  {
    id: 'ovile',
    name: 'Ovile',
    emoji: '🛖',
    category: 'habitat',
    cost: 120,
    unlockLevel: 2,
    capacity: 3,
    description: 'Ospita fino a 3 pecore.',
  },
  {
    id: 'stalla',
    name: 'Stalla',
    emoji: '🏚️',
    category: 'habitat',
    cost: 220,
    unlockLevel: 3,
    capacity: 2,
    description: 'Ospita fino a 2 mucche.',
  },
  {
    id: 'porcile',
    name: 'Porcile',
    emoji: '🛖',
    category: 'habitat',
    cost: 320,
    unlockLevel: 5,
    capacity: 2,
    description: 'Ospita fino a 2 maiali.',
  },

  // --- Produzione / Crafting ---
  {
    id: 'mulino',
    name: 'Mulino',
    emoji: '🏭',
    category: 'production',
    cost: 70,
    unlockLevel: 1,
    description: 'Trasforma il grano in mangime per gli animali.',
    recipes: [
      {
        id: 'mangime',
        name: 'Mangime',
        emoji: '🌰',
        inputs: [{ itemId: 'grano', qty: 3 }],
        outputId: 'mangime',
        outputQty: 3,
        timeSec: 30,
        xpReward: 8,
      },
    ],
  },
  {
    id: 'caseificio',
    name: 'Caseificio',
    emoji: '🧀',
    category: 'production',
    cost: 150,
    unlockLevel: 3,
    description: 'Trasforma il latte in formaggio pregiato.',
    recipes: [
      {
        id: 'formaggio',
        name: 'Formaggio',
        emoji: '🧀',
        inputs: [{ itemId: 'latte', qty: 2 }],
        outputId: 'formaggio',
        outputQty: 1,
        timeSec: 60,
        xpReward: 14,
      },
    ],
  },
  {
    id: 'forno',
    name: 'Forno',
    emoji: '🍞',
    category: 'production',
    cost: 200,
    unlockLevel: 4,
    description: 'Sforna pane e torte con i prodotti della fattoria.',
    recipes: [
      {
        id: 'pane',
        name: 'Pane',
        emoji: '🍞',
        inputs: [
          { itemId: 'grano', qty: 2 },
          { itemId: 'uovo', qty: 1 },
        ],
        outputId: 'pane',
        outputQty: 1,
        timeSec: 50,
        xpReward: 12,
      },
      {
        id: 'torta',
        name: 'Torta',
        emoji: '🎂',
        inputs: [
          { itemId: 'uovo', qty: 2 },
          { itemId: 'latte', qty: 1 },
          { itemId: 'grano', qty: 1 },
        ],
        outputId: 'torta',
        outputQty: 1,
        timeSec: 120,
        xpReward: 24,
      },
    ],
  },
  {
    id: 'filanda',
    name: 'Filanda',
    emoji: '🧵',
    category: 'production',
    cost: 260,
    unlockLevel: 5,
    description: 'Fila la lana in morbidi maglioni.',
    recipes: [
      {
        id: 'maglione',
        name: 'Maglione',
        emoji: '🧥',
        inputs: [{ itemId: 'lana', qty: 2 }],
        outputId: 'maglione',
        outputQty: 1,
        timeSec: 90,
        xpReward: 18,
      },
    ],
  },

  // --- Decorazioni ---
  {
    id: 'staccionata',
    name: 'Staccionata',
    emoji: '🚧',
    category: 'decoration',
    cost: 15,
    unlockLevel: 1,
    description: 'Un tocco rustico per delimitare la fattoria.',
  },
  {
    id: 'albero',
    name: 'Albero',
    emoji: '🌳',
    sprite: alberoSprite,
    category: 'decoration',
    cost: 25,
    unlockLevel: 1,
    description: 'Ombra e verde per la fattoria.',
  },
  {
    id: 'fontana',
    name: 'Fontana',
    emoji: '⛲',
    category: 'decoration',
    cost: 80,
    unlockLevel: 2,
    description: 'Una fontana decorativa che rallegra i visitatori.',
  },
  {
    id: 'panchina',
    name: 'Panchina',
    emoji: '🪑',
    category: 'decoration',
    cost: 20,
    unlockLevel: 1,
    description: 'Un posto dove riposare.',
  },
  {
    id: 'mulino_a_vento',
    name: 'Mulino a Vento',
    emoji: '🎡',
    category: 'decoration',
    cost: 120,
    unlockLevel: 3,
    description: 'Un grande mulino a vento decorativo.',
  },
  {
    id: 'girasoli',
    name: 'Girasoli',
    emoji: '🌻',
    sprite: girasoleSprite,
    category: 'decoration',
    cost: 18,
    unlockLevel: 1,
    description: 'Una aiuola di girasoli dorati.',
  },
]

export const BUILDINGS_BY_ID: Record<string, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b]),
)

export const RECIPES_BY_ID: Record<string, { buildingId: string; recipe: Recipe }> = {}
BUILDINGS.forEach((b) => {
  b.recipes?.forEach((r) => {
    RECIPES_BY_ID[r.id] = { buildingId: b.id, recipe: r }
  })
})
