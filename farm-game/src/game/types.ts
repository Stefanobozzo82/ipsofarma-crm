// Core domain types for Fattoria Serena (Serene Farm) - an original farm-sim.

export type ResourceId = string // crop harvest id, animal produce id, or crafted good id

export interface CropDef {
  id: string
  name: string
  emoji: string
  growTimeSec: number
  seedCost: number
  sellPrice: number
  xpReward: number
  unlockLevel: number
}

export interface AnimalDef {
  id: string
  name: string
  emoji: string
  babyEmoji: string
  produceId: string
  produceName: string
  produceEmoji: string
  produceTimeSec: number
  buyCost: number
  feedItemId: string
  feedsToGrow: number
  feedIntervalSec: number
  sellPrice: number
  xpReward: number
  unlockLevel: number
  habitatId: string
  rareVariantName: string
  rareVariantEmoji: string
}

export interface Recipe {
  id: string
  name: string
  emoji: string
  inputs: { itemId: string; qty: number }[]
  outputId: string
  outputQty: number
  timeSec: number
  xpReward: number
}

export type BuildingCategory = 'production' | 'decoration' | 'habitat'

export interface BuildingDef {
  id: string
  name: string
  emoji: string
  category: BuildingCategory
  cost: number
  unlockLevel: number
  capacity?: number // for habitats
  recipes?: Recipe[] // for production buildings
  description: string
}

export type GoodDef = CropDef | { id: string; name: string; emoji: string; sellPrice: number }

export type Weather = 'sereno' | 'pioggia' | 'temporale'

export type CellContent =
  | { kind: 'crop'; cropId: string; plantedAt: number; readyAt: number }
  | { kind: 'building'; buildingId: string; job?: { recipeId: string; startedAt: number; endsAt: number } }
  | { kind: 'decoration'; decorationId: string }
  | { kind: 'habitat'; habitatId: string; breeding?: { startedAt: number; readyAt: number } }

export interface Cell {
  id: string
  x: number
  y: number
  locked: boolean
  unlockCost: number
  content: CellContent | null
}

export type AnimalStage = 'baby' | 'adult'

export interface AnimalInstance {
  id: string
  speciesId: string
  habitatCellId: string
  stage: AnimalStage
  feedsGiven: number
  lastFedAt: number
  isRare: boolean
  produceReadyAt: number | null
}

export interface OrderRequirement {
  itemId: string
  qty: number
}

export interface Order {
  id: string
  requirements: OrderRequirement[]
  rewardCoins: number
  rewardXp: number
  rewardGems: number
  expiresAt: number
}

export interface Mission {
  id: string
  description: string
  goalType: 'harvest' | 'collect' | 'craft' | 'order'
  goalCount: number
  progress: number
  rewardCoins: number
  rewardXp: number
  claimed: boolean
}

export interface FloatingPopup {
  id: string
  x: number
  y: number
  text: string
  color: string
}
