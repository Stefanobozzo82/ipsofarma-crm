import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CROPS_BY_ID } from './data/crops'
import { ANIMALS_BY_ID, ANIMALS_BY_HABITAT } from './data/animals'
import { BUILDINGS_BY_ID, RECIPES_BY_ID } from './data/buildings'
import { getItemDisplay, levelFromXp, makeId, rollWeather, WEATHER_INFO } from './utils'
import type {
  AnimalInstance,
  Cell,
  FloatingPopup,
  Mission,
  Order,
  Weather,
} from './types'

const GRID_COLS = 8
const GRID_ROWS = 6
const FREE_COLS = 4
const FREE_ROWS = 3
const WEATHER_DURATION_MS = 90_000
const ORDER_DURATION_MS = 6 * 60_000
const MAX_ACTIVE_ORDERS = 3
const BREEDING_TIME_MS = 45_000

function buildInitialCells(): Cell[] {
  const cells: Cell[] = []
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const isFree = x < FREE_COLS && y < FREE_ROWS
      const distance = x + y
      cells.push({
        id: `${x}-${y}`,
        x,
        y,
        locked: !isFree,
        unlockCost: isFree ? 0 : 25 + distance * 12,
        content: null,
      })
    }
  }
  return cells
}

function buildDailyMissions(): Mission[] {
  return [
    {
      id: makeId('mission'),
      description: 'Raccogli 5 colture',
      goalType: 'harvest',
      goalCount: 5,
      progress: 0,
      rewardCoins: 40,
      rewardXp: 15,
      claimed: false,
    },
    {
      id: makeId('mission'),
      description: 'Raccogli 3 prodotti animali',
      goalType: 'collect',
      goalCount: 3,
      progress: 0,
      rewardCoins: 50,
      rewardXp: 20,
      claimed: false,
    },
    {
      id: makeId('mission'),
      description: 'Completa 1 lavorazione in un edificio',
      goalType: 'craft',
      goalCount: 1,
      progress: 0,
      rewardCoins: 35,
      rewardXp: 15,
      claimed: false,
    },
    {
      id: makeId('mission'),
      description: 'Consegna 1 ordine',
      goalType: 'order',
      goalCount: 1,
      progress: 0,
      rewardCoins: 60,
      rewardXp: 25,
      claimed: false,
    },
  ]
}

function generateOrder(): Order {
  const pool = ['carota', 'fagiolo', 'grano', 'peperone', 'uovo', 'latte', 'lana']
  const reqCount = 1 + Math.floor(Math.random() * 2)
  const chosen = new Set<string>()
  while (chosen.size < reqCount) {
    chosen.add(pool[Math.floor(Math.random() * pool.length)])
  }
  const requirements = Array.from(chosen).map((itemId) => ({
    itemId,
    qty: 2 + Math.floor(Math.random() * 4),
  }))
  const value = requirements.reduce((sum, r) => {
    const info = getItemDisplay(r.itemId)
    return sum + info.sellPrice * r.qty
  }, 0)
  return {
    id: makeId('order'),
    requirements,
    rewardCoins: Math.round(value * 1.4),
    rewardXp: Math.round(value * 0.3),
    rewardGems: Math.random() < 0.3 ? 1 : 0,
    expiresAt: Date.now() + ORDER_DURATION_MS,
  }
}

interface GameState {
  coins: number
  gems: number
  xp: number
  inventory: Record<string, number>
  cells: Cell[]
  animals: AnimalInstance[]
  weather: Weather
  weatherChangesAt: number
  orders: Order[]
  missions: Mission[]
  missionDay: string
  popups: FloatingPopup[]

  // --- derived / computed via selectors in components ---

  // actions
  tick: () => void
  unlockCell: (cellId: string) => void
  plantCrop: (cellId: string, cropId: string) => void
  harvestCrop: (cellId: string) => void
  placeBuilding: (cellId: string, buildingId: string) => void
  startCraft: (cellId: string, recipeId: string) => void
  collectCraft: (cellId: string) => void
  buyAnimal: (habitatCellId: string, speciesId: string) => void
  feedAnimal: (animalId: string) => void
  collectAnimalProduce: (animalId: string) => void
  startBreeding: (habitatCellId: string) => void
  sellItem: (itemId: string, qty: number) => void
  fulfillOrder: (orderId: string) => void
  claimMission: (missionId: string) => void
  addPopup: (popup: Omit<FloatingPopup, 'id'>) => void
  removePopup: (id: string) => void
  resetGame: () => void
}

function addXpAndCoins(
  state: Pick<GameState, 'xp' | 'coins'>,
  xpGain: number,
  coinGain: number,
) {
  return { xp: state.xp + xpGain, coins: state.coins + coinGain }
}

const initialState = {
  coins: 200,
  gems: 10,
  xp: 0,
  inventory: {} as Record<string, number>,
  cells: buildInitialCells(),
  animals: [] as AnimalInstance[],
  weather: 'sereno' as Weather,
  weatherChangesAt: Date.now() + WEATHER_DURATION_MS,
  orders: [generateOrder(), generateOrder()],
  missions: buildDailyMissions(),
  missionDay: new Date().toDateString(),
  popups: [] as FloatingPopup[],
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      ...initialState,

      tick: () => {
        const now = Date.now()
        const state = get()
        let patch: Partial<GameState> = {}

        // weather rotation
        if (now >= state.weatherChangesAt) {
          patch.weather = rollWeather()
          patch.weatherChangesAt = now + WEATHER_DURATION_MS
        }

        // orders: drop expired, top up pool
        let orders = state.orders.filter((o) => o.expiresAt > now)
        while (orders.length < MAX_ACTIVE_ORDERS) {
          orders = [...orders, generateOrder()]
        }
        if (orders.length !== state.orders.length || orders !== state.orders) {
          patch.orders = orders
        }

        // daily missions reset
        const today = new Date().toDateString()
        if (state.missionDay !== today) {
          patch.missions = buildDailyMissions()
          patch.missionDay = today
        }

        // breeding completion
        let cellsChanged = false
        const cells = state.cells.map((cell) => {
          if (
            cell.content?.kind === 'habitat' &&
            cell.content.breeding &&
            now >= cell.content.breeding.readyAt
          ) {
            cellsChanged = true
            const { breeding: _drop, ...rest } = cell.content
            return { ...cell, content: { ...rest } }
          }
          return cell
        })
        if (cellsChanged) {
          patch.cells = cells

          // spawn babies for habitats whose breeding just completed
          const newAnimals: AnimalInstance[] = []
          state.cells.forEach((cell) => {
            if (
              cell.content?.kind === 'habitat' &&
              cell.content.breeding &&
              now >= cell.content.breeding.readyAt
            ) {
              const species = ANIMALS_BY_HABITAT[cell.content.habitatId]
              if (!species) return
              const occupants = state.animals.filter((a) => a.habitatCellId === cell.id)
              const habitatDef = BUILDINGS_BY_ID[cell.content.habitatId]
              const capacity = habitatDef?.capacity ?? 0
              if (occupants.length < capacity) {
                const isRare = Math.random() < 0.15
                newAnimals.push({
                  id: makeId('animal'),
                  speciesId: species.id,
                  habitatCellId: cell.id,
                  stage: 'baby',
                  feedsGiven: 0,
                  lastFedAt: 0,
                  isRare,
                  produceReadyAt: null,
                })
              }
            }
          })
          if (newAnimals.length > 0) {
            patch.animals = [...state.animals, ...newAnimals]
            patch.popups = [
              ...state.popups,
              {
                id: makeId('popup'),
                x: 50,
                y: 50,
                text: `🐣 Nuovo cucciolo nato!`,
                color: '#22c55e',
              },
            ]
          }
        }

        if (Object.keys(patch).length > 0) set(patch)
      },

      unlockCell: (cellId) => {
        const state = get()
        const cell = state.cells.find((c) => c.id === cellId)
        if (!cell || !cell.locked) return
        if (state.coins < cell.unlockCost) return
        set({
          coins: state.coins - cell.unlockCost,
          cells: state.cells.map((c) =>
            c.id === cellId ? { ...c, locked: false, unlockCost: 0 } : c,
          ),
        })
      },

      plantCrop: (cellId, cropId) => {
        const state = get()
        const crop = CROPS_BY_ID[cropId]
        const cell = state.cells.find((c) => c.id === cellId)
        if (!crop || !cell || cell.locked || cell.content) return
        if (state.coins < crop.seedCost) return
        const now = Date.now()
        const multiplier = WEATHER_INFO[state.weather].growthMultiplier
        set({
          coins: state.coins - crop.seedCost,
          cells: state.cells.map((c) =>
            c.id === cellId
              ? {
                  ...c,
                  content: {
                    kind: 'crop',
                    cropId,
                    plantedAt: now,
                    readyAt: now + crop.growTimeSec * 1000 * multiplier,
                  },
                }
              : c,
          ),
        })
      },

      harvestCrop: (cellId) => {
        const state = get()
        const cell = state.cells.find((c) => c.id === cellId)
        if (!cell || cell.content?.kind !== 'crop') return
        if (Date.now() < cell.content.readyAt) return
        const crop = CROPS_BY_ID[cell.content.cropId]
        if (!crop) return
        const inventory = { ...state.inventory }
        inventory[crop.id] = (inventory[crop.id] ?? 0) + 1
        set({
          inventory,
          ...addXpAndCoins(state, crop.xpReward, 0),
          cells: state.cells.map((c) => (c.id === cellId ? { ...c, content: null } : c)),
          missions: state.missions.map((m) =>
            m.goalType === 'harvest' && !m.claimed
              ? { ...m, progress: Math.min(m.goalCount, m.progress + 1) }
              : m,
          ),
          popups: [
            ...state.popups,
            {
              id: makeId('popup'),
              x: cell.x,
              y: cell.y,
              text: `${crop.emoji} +1  •  +${crop.xpReward} XP`,
              color: '#f59e0b',
            },
          ],
        })
      },

      placeBuilding: (cellId, buildingId) => {
        const state = get()
        const def = BUILDINGS_BY_ID[buildingId]
        const cell = state.cells.find((c) => c.id === cellId)
        if (!def || !cell || cell.locked || cell.content) return
        if (state.coins < def.cost) return
        const content =
          def.category === 'habitat'
            ? ({ kind: 'habitat', habitatId: buildingId } as const)
            : def.category === 'decoration'
              ? ({ kind: 'decoration', decorationId: buildingId } as const)
              : ({ kind: 'building', buildingId } as const)
        set({
          coins: state.coins - def.cost,
          cells: state.cells.map((c) => (c.id === cellId ? { ...c, content } : c)),
        })
      },

      startCraft: (cellId, recipeId) => {
        const state = get()
        const cell = state.cells.find((c) => c.id === cellId)
        if (!cell || cell.content?.kind !== 'building' || cell.content.job) return
        const entry = RECIPES_BY_ID[recipeId]
        if (!entry || entry.buildingId !== cell.content.buildingId) return
        const recipe = entry.recipe
        const hasAll = recipe.inputs.every(
          (inp) => (state.inventory[inp.itemId] ?? 0) >= inp.qty,
        )
        if (!hasAll) return
        const inventory = { ...state.inventory }
        recipe.inputs.forEach((inp) => {
          inventory[inp.itemId] -= inp.qty
        })
        const now = Date.now()
        set({
          inventory,
          cells: state.cells.map((c) =>
            c.id === cellId && c.content?.kind === 'building'
              ? {
                  ...c,
                  content: {
                    ...c.content,
                    job: { recipeId, startedAt: now, endsAt: now + recipe.timeSec * 1000 },
                  },
                }
              : c,
          ),
        })
      },

      collectCraft: (cellId) => {
        const state = get()
        const cell = state.cells.find((c) => c.id === cellId)
        if (!cell || cell.content?.kind !== 'building' || !cell.content.job) return
        if (Date.now() < cell.content.job.endsAt) return
        const entry = RECIPES_BY_ID[cell.content.job.recipeId]
        if (!entry) return
        const recipe = entry.recipe
        const inventory = { ...state.inventory }
        inventory[recipe.outputId] = (inventory[recipe.outputId] ?? 0) + recipe.outputQty
        set({
          inventory,
          ...addXpAndCoins(state, recipe.xpReward, 0),
          cells: state.cells.map((c) =>
            c.id === cellId && c.content?.kind === 'building'
              ? { ...c, content: { kind: 'building', buildingId: c.content.buildingId } }
              : c,
          ),
          missions: state.missions.map((m) =>
            m.goalType === 'craft' && !m.claimed
              ? { ...m, progress: Math.min(m.goalCount, m.progress + 1) }
              : m,
          ),
          popups: [
            ...state.popups,
            {
              id: makeId('popup'),
              x: cell.x,
              y: cell.y,
              text: `${recipe.emoji} +${recipe.outputQty}  •  +${recipe.xpReward} XP`,
              color: '#a855f7',
            },
          ],
        })
      },

      buyAnimal: (habitatCellId, speciesId) => {
        const state = get()
        const cell = state.cells.find((c) => c.id === habitatCellId)
        const species = ANIMALS_BY_ID[speciesId]
        if (!cell || cell.content?.kind !== 'habitat' || !species) return
        if (species.habitatId !== cell.content.habitatId) return
        const habitatDef = BUILDINGS_BY_ID[cell.content.habitatId]
        const occupants = state.animals.filter((a) => a.habitatCellId === habitatCellId)
        if (habitatDef?.capacity != null && occupants.length >= habitatDef.capacity) return
        if (state.coins < species.buyCost) return
        const animal: AnimalInstance = {
          id: makeId('animal'),
          speciesId,
          habitatCellId,
          stage: 'baby',
          feedsGiven: 0,
          lastFedAt: 0,
          isRare: false,
          produceReadyAt: null,
        }
        set({ coins: state.coins - species.buyCost, animals: [...state.animals, animal] })
      },

      feedAnimal: (animalId) => {
        const state = get()
        const animal = state.animals.find((a) => a.id === animalId)
        if (!animal || animal.stage !== 'baby') return
        const species = ANIMALS_BY_ID[animal.speciesId]
        if (!species) return
        const now = Date.now()
        if (now - animal.lastFedAt < species.feedIntervalSec * 1000 && animal.lastFedAt !== 0) return
        if ((state.inventory[species.feedItemId] ?? 0) < 1) return
        const feedsGiven = animal.feedsGiven + 1
        const grownUp = feedsGiven >= species.feedsToGrow
        const inventory = { ...state.inventory }
        inventory[species.feedItemId] -= 1
        set({
          inventory,
          animals: state.animals.map((a) =>
            a.id === animalId
              ? {
                  ...a,
                  feedsGiven,
                  lastFedAt: now,
                  stage: grownUp ? 'adult' : 'baby',
                  produceReadyAt: grownUp ? now + species.produceTimeSec * 1000 : null,
                }
              : a,
          ),
          popups: [
            ...state.popups,
            {
              id: makeId('popup'),
              x: 0,
              y: 0,
              text: grownUp ? `${species.emoji} È cresciuto!` : `🍽️ Nutrito`,
              color: '#38bdf8',
            },
          ],
        })
      },

      collectAnimalProduce: (animalId) => {
        const state = get()
        const animal = state.animals.find((a) => a.id === animalId)
        if (!animal || animal.stage !== 'adult' || animal.produceReadyAt == null) return
        if (Date.now() < animal.produceReadyAt) return
        const species = ANIMALS_BY_ID[animal.speciesId]
        if (!species) return
        const bonus = animal.isRare ? 2 : 1
        const inventory = { ...state.inventory }
        inventory[species.produceId] = (inventory[species.produceId] ?? 0) + bonus
        const now = Date.now()
        set({
          inventory,
          ...addXpAndCoins(state, species.xpReward, 0),
          animals: state.animals.map((a) =>
            a.id === animalId ? { ...a, produceReadyAt: now + species.produceTimeSec * 1000 } : a,
          ),
          missions: state.missions.map((m) =>
            m.goalType === 'collect' && !m.claimed
              ? { ...m, progress: Math.min(m.goalCount, m.progress + 1) }
              : m,
          ),
          popups: [
            ...state.popups,
            {
              id: makeId('popup'),
              x: 0,
              y: 0,
              text: `${species.produceEmoji} +${bonus}  •  +${species.xpReward} XP`,
              color: '#f472b6',
            },
          ],
        })
      },

      startBreeding: (habitatCellId) => {
        const state = get()
        const cell = state.cells.find((c) => c.id === habitatCellId)
        if (!cell || cell.content?.kind !== 'habitat' || cell.content.breeding) return
        const species = ANIMALS_BY_HABITAT[cell.content.habitatId]
        const habitatDef = BUILDINGS_BY_ID[cell.content.habitatId]
        if (!species || !habitatDef) return
        const occupants = state.animals.filter((a) => a.habitatCellId === habitatCellId)
        const adults = occupants.filter((a) => a.stage === 'adult')
        if (adults.length < 2) return
        if (habitatDef.capacity != null && occupants.length >= habitatDef.capacity) return
        const cost = species.buyCost
        if (state.coins < cost) return
        const now = Date.now()
        set({
          coins: state.coins - cost,
          cells: state.cells.map((c) =>
            c.id === habitatCellId && c.content?.kind === 'habitat'
              ? { ...c, content: { ...c.content, breeding: { startedAt: now, readyAt: now + BREEDING_TIME_MS } } }
              : c,
          ),
        })
      },

      sellItem: (itemId, qty) => {
        const state = get()
        const have = state.inventory[itemId] ?? 0
        if (have < qty || qty <= 0) return
        const info = getItemDisplay(itemId)
        const inventory = { ...state.inventory }
        inventory[itemId] = have - qty
        set({
          inventory,
          coins: state.coins + info.sellPrice * qty,
          popups: [
            ...state.popups,
            {
              id: makeId('popup'),
              x: 0,
              y: 0,
              text: `💰 +${info.sellPrice * qty}`,
              color: '#facc15',
            },
          ],
        })
      },

      fulfillOrder: (orderId) => {
        const state = get()
        const order = state.orders.find((o) => o.id === orderId)
        if (!order) return
        const canFulfill = order.requirements.every(
          (req) => (state.inventory[req.itemId] ?? 0) >= req.qty,
        )
        if (!canFulfill) return
        const inventory = { ...state.inventory }
        order.requirements.forEach((req) => {
          inventory[req.itemId] -= req.qty
        })
        set({
          inventory,
          coins: state.coins + order.rewardCoins,
          gems: state.gems + order.rewardGems,
          xp: state.xp + order.rewardXp,
          orders: [...state.orders.filter((o) => o.id !== orderId), generateOrder()],
          missions: state.missions.map((m) =>
            m.goalType === 'order' && !m.claimed
              ? { ...m, progress: Math.min(m.goalCount, m.progress + 1) }
              : m,
          ),
          popups: [
            ...state.popups,
            {
              id: makeId('popup'),
              x: 0,
              y: 0,
              text: `📋 Ordine completato! +${order.rewardCoins} 💰`,
              color: '#34d399',
            },
          ],
        })
      },

      claimMission: (missionId) => {
        const state = get()
        const mission = state.missions.find((m) => m.id === missionId)
        if (!mission || mission.claimed || mission.progress < mission.goalCount) return
        set({
          coins: state.coins + mission.rewardCoins,
          xp: state.xp + mission.rewardXp,
          missions: state.missions.map((m) =>
            m.id === missionId ? { ...m, claimed: true } : m,
          ),
        })
      },

      addPopup: (popup) => set((s) => ({ popups: [...s.popups, { ...popup, id: makeId('popup') }] })),
      removePopup: (id) => set((s) => ({ popups: s.popups.filter((p) => p.id !== id) })),

      resetGame: () => set({ ...initialState, cells: buildInitialCells(), orders: [generateOrder(), generateOrder()], missions: buildDailyMissions() }),
    }),
    {
      name: 'fattoria-serena-save',
      partialize: (state) => {
        const { popups: _popups, ...rest } = state
        return rest
      },
    },
  ),
)

export function useLevel() {
  const xp = useGameStore((s) => s.xp)
  return levelFromXp(xp)
}
