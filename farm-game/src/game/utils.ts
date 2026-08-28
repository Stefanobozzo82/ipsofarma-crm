import { CROPS_BY_ID } from './data/crops'
import { GOODS_BY_ID } from './data/goods'
import type { Weather } from './types'

let idCounter = 0
export function makeId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`
}

/** Nome, emoji, sprite (se disponibile) e prezzo di vendita per qualunque item del gioco. */
export function getItemDisplay(
  itemId: string,
): { name: string; emoji: string; sellPrice: number; sprite?: string } {
  const crop = CROPS_BY_ID[itemId]
  if (crop) {
    return { name: crop.name, emoji: crop.emoji, sellPrice: crop.sellPrice, sprite: crop.iconSprite }
  }
  const good = GOODS_BY_ID[itemId]
  if (good) return good
  return { name: itemId, emoji: '❓', sellPrice: 1 }
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m <= 0) return `${s}s`
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export const WEATHER_INFO: Record<Weather, { emoji: string; label: string; growthMultiplier: number }> = {
  sereno: { emoji: '☀️', label: 'Sereno', growthMultiplier: 1 },
  pioggia: { emoji: '🌧️', label: 'Pioggia', growthMultiplier: 0.8 }, // cresce più in fretta
  temporale: { emoji: '⛈️', label: 'Temporale', growthMultiplier: 1.2 }, // rallenta un po'
}

export function rollWeather(): Weather {
  const roll = Math.random()
  if (roll < 0.55) return 'sereno'
  if (roll < 0.85) return 'pioggia'
  return 'temporale'
}

export function levelFromXp(xp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number } {
  // Curva di progressione: soglia crescente per livello.
  let level = 1
  let remaining = xp
  let threshold = 100
  while (remaining >= threshold) {
    remaining -= threshold
    level += 1
    threshold = Math.round(threshold * 1.35)
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: threshold }
}
