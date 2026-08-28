import type { CropDef } from '../types'
import carotaGrow from '../../assets/farm/carota_grow.png'
import carotaReady from '../../assets/farm/carota_ready.png'
import carotaIcon from '../../assets/farm/carota_icon.png'
import cavoloGrow from '../../assets/farm/cavolo_grow.png'
import cavoloReady from '../../assets/farm/cavolo_ready.png'
import cavoloIcon from '../../assets/farm/cavolo_icon.png'
import melanzanaGrow from '../../assets/farm/melanzana_grow.png'
import melanzanaReady from '../../assets/farm/melanzana_ready.png'
import melanzanaIcon from '../../assets/farm/melanzana_icon.png'
import maisGrow from '../../assets/farm/mais_grow.png'
import maisReady from '../../assets/farm/mais_ready.png'
import maisIcon from '../../assets/farm/mais_icon.png'
import pomodoroGrow from '../../assets/farm/pomodoro_grow.png'
import pomodoroReady from '../../assets/farm/pomodoro_ready.png'
import pomodoroIcon from '../../assets/farm/pomodoro_icon.png'
import granoGrow from '../../assets/farm/grano_grow.png'
import granoReady from '../../assets/farm/grano_ready.png'
import granoIcon from '../../assets/farm/grano_icon.png'

// Colture: dalle veloci ed economiche alle lente e preziose.
// Sprite da "Tiny Farm" di Kenney (CC0) — vedi src/assets/farm/CREDITS.txt.
export const CROPS: CropDef[] = [
  {
    id: 'carota',
    name: 'Carota',
    emoji: '🥕',
    growSprite: carotaGrow,
    readySprite: carotaReady,
    iconSprite: carotaIcon,
    growTimeSec: 20,
    seedCost: 3,
    sellPrice: 8,
    xpReward: 2,
    unlockLevel: 1,
  },
  {
    id: 'cavolo',
    name: 'Cavolo',
    emoji: '🥬',
    growSprite: cavoloGrow,
    readySprite: cavoloReady,
    iconSprite: cavoloIcon,
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
    growSprite: granoGrow,
    readySprite: granoReady,
    iconSprite: granoIcon,
    growTimeSec: 90,
    seedCost: 10,
    sellPrice: 26,
    xpReward: 6,
    unlockLevel: 2,
  },
  {
    id: 'melanzana',
    name: 'Melanzana',
    emoji: '🍆',
    growSprite: melanzanaGrow,
    readySprite: melanzanaReady,
    iconSprite: melanzanaIcon,
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
    growSprite: maisGrow,
    readySprite: maisReady,
    iconSprite: maisIcon,
    growTimeSec: 240,
    seedCost: 30,
    sellPrice: 82,
    xpReward: 16,
    unlockLevel: 4,
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    emoji: '🍅',
    growSprite: pomodoroGrow,
    readySprite: pomodoroReady,
    iconSprite: pomodoroIcon,
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
