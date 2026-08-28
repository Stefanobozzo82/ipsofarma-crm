import type { CropDef } from '../types'

// Colture: dalle veloci ed economiche alle lente e preziose.
export const CROPS: CropDef[] = [
  {
    id: 'ravanello',
    name: 'Ravanello',
    emoji: '🌱',
    growTimeSec: 20,
    seedCost: 3,
    sellPrice: 8,
    xpReward: 2,
    unlockLevel: 1,
  },
  {
    id: 'carota',
    name: 'Carota',
    emoji: '🥕',
    growTimeSec: 45,
    seedCost: 6,
    sellPrice: 15,
    xpReward: 4,
    unlockLevel: 1,
  },
  {
    id: 'grano',
    name: 'Grano',
    emoji: '🌾',
    growTimeSec: 90,
    seedCost: 10,
    sellPrice: 26,
    xpReward: 6,
    unlockLevel: 2,
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    emoji: '🍅',
    growTimeSec: 150,
    seedCost: 18,
    sellPrice: 48,
    xpReward: 10,
    unlockLevel: 3,
  },
  {
    id: 'mais',
    name: 'Mais',
    emoji: '🌽',
    growTimeSec: 240,
    seedCost: 30,
    sellPrice: 82,
    xpReward: 16,
    unlockLevel: 4,
  },
  {
    id: 'zucca',
    name: 'Zucca',
    emoji: '🎃',
    growTimeSec: 400,
    seedCost: 55,
    sellPrice: 150,
    xpReward: 26,
    unlockLevel: 6,
  },
  {
    id: 'uva',
    name: 'Uva',
    emoji: '🍇',
    growTimeSec: 600,
    seedCost: 90,
    sellPrice: 260,
    xpReward: 40,
    unlockLevel: 8,
  },
]

export const CROPS_BY_ID: Record<string, CropDef> = Object.fromEntries(
  CROPS.map((c) => [c.id, c]),
)
