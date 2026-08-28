import type { CropDef } from '../types'
import carrotGrow from '../../assets/farm/basics/carrot_2.png'
import carrotReady from '../../assets/farm/basics/carrot_4.png'
import carrotIcon from '../../assets/farm/basics/carrot_icon.png'
import potatoGrow from '../../assets/farm/basics/potato_2.png'
import potatoReady from '../../assets/farm/basics/potato_4.png'
import potatoIcon from '../../assets/farm/basics/potato_icon.png'
import beanGrow from '../../assets/farm/basics/bean_2.png'
import beanReady from '../../assets/farm/basics/bean_4.png'
import beanIcon from '../../assets/farm/basics/bean_icon.png'
import paprikaGrow from '../../assets/farm/basics/paprika_2.png'
import paprikaReady from '../../assets/farm/basics/paprika_4.png'
import paprikaIcon from '../../assets/farm/basics/paprika_icon.png'
import cornReady from '../../assets/farm/citybuildingkit/corn.png'

// Colture: dalle veloci ed economiche alle lente e preziose.
// Sprite da "Farming Game - Basics" (2DPIXX, CC-BY 3.0) e da
// "Corn Farm Isometric Tile" (CityBuildingKit.com, CC0) — vedi
// src/assets/farm/CREDITS.txt.
export const CROPS: CropDef[] = [
  {
    id: 'carota',
    name: 'Carota',
    emoji: '🥕',
    growSprite: carrotGrow,
    readySprite: carrotReady,
    iconSprite: carrotIcon,
    growTimeSec: 20,
    seedCost: 3,
    sellPrice: 8,
    xpReward: 2,
    unlockLevel: 1,
  },
  {
    id: 'fagiolo',
    name: 'Fagiolo',
    emoji: '🫘',
    growSprite: beanGrow,
    readySprite: beanReady,
    iconSprite: beanIcon,
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
    id: 'patata',
    name: 'Patata',
    emoji: '🥔',
    growSprite: potatoGrow,
    readySprite: potatoReady,
    iconSprite: potatoIcon,
    growTimeSec: 150,
    seedCost: 18,
    sellPrice: 48,
    xpReward: 10,
    unlockLevel: 3,
  },
  {
    id: 'peperone',
    name: 'Peperone',
    emoji: '🫑',
    growSprite: paprikaGrow,
    readySprite: paprikaReady,
    iconSprite: paprikaIcon,
    growTimeSec: 240,
    seedCost: 30,
    sellPrice: 82,
    xpReward: 16,
    unlockLevel: 4,
  },
  {
    id: 'mais',
    name: 'Mais',
    emoji: '🌽',
    readySprite: cornReady,
    iconSprite: cornReady,
    growTimeSec: 400,
    seedCost: 55,
    sellPrice: 150,
    xpReward: 26,
    unlockLevel: 6,
  },
]

export const CROPS_BY_ID: Record<string, CropDef> = Object.fromEntries(
  CROPS.map((c) => [c.id, c]),
)
