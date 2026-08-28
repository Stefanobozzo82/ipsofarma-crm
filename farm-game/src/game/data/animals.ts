import type { AnimalDef } from '../types'
import muccaSprite from '../../assets/farm/animalspack/cow.png'
import maialeSprite from '../../assets/farm/animalspack/pig.png'

// Animali della fattoria: ognuno con un bene prodotto unico.
// Sprite (mucca/maiale) da "Animals pack" di Olga Bikmullina (CC-BY 3.0) —
// vedi src/assets/farm/CREDITS.txt. Gallina/pecora restano su emoji: nessuno
// sprite reperito nello stesso stile per questi due animali.
export const ANIMALS: AnimalDef[] = [
  {
    id: 'gallina',
    name: 'Gallina',
    emoji: '🐔',
    babyEmoji: '🐣',
    produceId: 'uovo',
    produceName: 'Uovo',
    produceEmoji: '🥚',
    produceTimeSec: 40,
    buyCost: 40,
    feedItemId: 'mangime',
    feedsToGrow: 2,
    feedIntervalSec: 15,
    sellPrice: 12,
    xpReward: 5,
    unlockLevel: 1,
    habitatId: 'pollaio',
    rareVariantName: 'Gallina Dorata',
    rareVariantEmoji: '🐓',
  },
  {
    id: 'pecora',
    name: 'Pecora',
    emoji: '🐑',
    babyEmoji: '🐑',
    produceId: 'lana',
    produceName: 'Lana',
    produceEmoji: '🧶',
    produceTimeSec: 90,
    buyCost: 90,
    feedItemId: 'mangime',
    feedsToGrow: 3,
    feedIntervalSec: 25,
    sellPrice: 28,
    xpReward: 9,
    unlockLevel: 2,
    habitatId: 'ovile',
    rareVariantName: 'Pecora Riccioluta',
    rareVariantEmoji: '🐏',
  },
  {
    id: 'mucca',
    name: 'Mucca',
    emoji: '🐄',
    sprite: muccaSprite,
    babyEmoji: '🐮',
    produceId: 'latte',
    produceName: 'Latte',
    produceEmoji: '🥛',
    produceTimeSec: 150,
    buyCost: 180,
    feedItemId: 'mangime',
    feedsToGrow: 4,
    feedIntervalSec: 35,
    sellPrice: 45,
    xpReward: 14,
    unlockLevel: 3,
    habitatId: 'stalla',
    rareVariantName: 'Mucca Maculata',
    rareVariantEmoji: '🐮',
  },
  {
    id: 'maiale',
    name: 'Maiale',
    emoji: '🐖',
    sprite: maialeSprite,
    babyEmoji: '🐷',
    produceId: 'tartufo',
    produceName: 'Tartufo',
    produceEmoji: '🍄',
    produceTimeSec: 220,
    buyCost: 260,
    feedItemId: 'mangime',
    feedsToGrow: 4,
    feedIntervalSec: 40,
    sellPrice: 70,
    xpReward: 20,
    unlockLevel: 5,
    habitatId: 'porcile',
    rareVariantName: 'Maialino Fortunato',
    rareVariantEmoji: '🐗',
  },
]

export const ANIMALS_BY_ID: Record<string, AnimalDef> = Object.fromEntries(
  ANIMALS.map((a) => [a.id, a]),
)

export const ANIMALS_BY_HABITAT: Record<string, AnimalDef> = Object.fromEntries(
  ANIMALS.map((a) => [a.habitatId, a]),
)
