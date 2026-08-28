import { useState } from 'react'
import { CROPS } from '../game/data/crops'
import { BUILDINGS } from '../game/data/buildings'
import { useGameStore, useLevel } from '../game/store'

export type ShopSelection =
  | { kind: 'crop'; id: string }
  | { kind: 'building'; id: string }
  | null

type Category = 'colture' | 'animali' | 'edifici' | 'decorazioni'

const CATEGORY_LABEL: Record<Category, string> = {
  colture: '🌾 Colture',
  animali: '🐮 Animali',
  edifici: '🏭 Edifici',
  decorazioni: '🌳 Decorazioni',
}

export default function ShopMenu({
  selection,
  onSelect,
}: {
  selection: ShopSelection
  onSelect: (s: ShopSelection) => void
}) {
  const [category, setCategory] = useState<Category>('colture')
  const coins = useGameStore((s) => s.coins)
  const { level } = useLevel()

  const habitats = BUILDINGS.filter((b) => b.category === 'habitat')
  const productionBuildings = BUILDINGS.filter((b) => b.category === 'production')
  const decorations = BUILDINGS.filter((b) => b.category === 'decoration')

  return (
    <div className="flex h-full flex-col rounded-2xl border-4 border-lime-700/40 bg-white/90 shadow-lg">
      <div className="flex gap-1 overflow-x-auto border-b-2 border-lime-200 p-2 scrollbar-thin">
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold transition ${
              category === cat
                ? 'bg-lime-500 text-white shadow'
                : 'bg-lime-50 text-lime-700 hover:bg-lime-100'
            }`}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {category === 'colture' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CROPS.map((crop) => {
              const locked = level < crop.unlockLevel
              const active = selection?.kind === 'crop' && selection.id === crop.id
              return (
                <button
                  key={crop.id}
                  disabled={locked || coins < crop.seedCost}
                  onClick={() => onSelect(active ? null : { kind: 'crop', id: crop.id })}
                  className={`flex flex-col items-center rounded-xl border-2 p-2 text-center transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'border-amber-500 bg-amber-100 ring-2 ring-amber-400'
                      : 'border-amber-200 bg-amber-50 hover:border-amber-400'
                  }`}
                >
                  <span className="text-2xl">{crop.emoji}</span>
                  <span className="text-xs font-bold text-amber-900">{crop.name}</span>
                  <span className="text-[11px] text-amber-700">
                    {locked ? `Lv. ${crop.unlockLevel}` : `🪙 ${crop.seedCost}`}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {category === 'animali' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {habitats.map((h) => {
              const locked = level < h.unlockLevel
              const active = selection?.kind === 'building' && selection.id === h.id
              return (
                <button
                  key={h.id}
                  disabled={locked || coins < h.cost}
                  onClick={() => onSelect(active ? null : { kind: 'building', id: h.id })}
                  className={`flex flex-col items-center rounded-xl border-2 p-2 text-center transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'border-orange-500 bg-orange-100 ring-2 ring-orange-400'
                      : 'border-orange-200 bg-orange-50 hover:border-orange-400'
                  }`}
                  title={h.description}
                >
                  <span className="text-2xl">{h.emoji}</span>
                  <span className="text-xs font-bold text-orange-900">{h.name}</span>
                  <span className="text-[11px] text-orange-700">
                    {locked ? `Lv. ${h.unlockLevel}` : `🪙 ${h.cost}`}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {category === 'edifici' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {productionBuildings.map((b) => {
              const locked = level < b.unlockLevel
              const active = selection?.kind === 'building' && selection.id === b.id
              return (
                <button
                  key={b.id}
                  disabled={locked || coins < b.cost}
                  onClick={() => onSelect(active ? null : { kind: 'building', id: b.id })}
                  className={`flex flex-col items-center rounded-xl border-2 p-2 text-center transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'border-purple-500 bg-purple-100 ring-2 ring-purple-400'
                      : 'border-purple-200 bg-purple-50 hover:border-purple-400'
                  }`}
                  title={b.description}
                >
                  <span className="text-2xl">{b.emoji}</span>
                  <span className="text-xs font-bold text-purple-900">{b.name}</span>
                  <span className="text-[11px] text-purple-700">
                    {locked ? `Lv. ${b.unlockLevel}` : `🪙 ${b.cost}`}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {category === 'decorazioni' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {decorations.map((d) => {
              const locked = level < d.unlockLevel
              const active = selection?.kind === 'building' && selection.id === d.id
              return (
                <button
                  key={d.id}
                  disabled={locked || coins < d.cost}
                  onClick={() => onSelect(active ? null : { kind: 'building', id: d.id })}
                  className={`flex flex-col items-center rounded-xl border-2 p-2 text-center transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'border-sky-500 bg-sky-100 ring-2 ring-sky-400'
                      : 'border-sky-200 bg-sky-50 hover:border-sky-400'
                  }`}
                  title={d.description}
                >
                  <span className="text-2xl">{d.emoji}</span>
                  <span className="text-xs font-bold text-sky-900">{d.name}</span>
                  <span className="text-[11px] text-sky-700">
                    {locked ? `Lv. ${d.unlockLevel}` : `🪙 ${d.cost}`}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selection && (
        <div className="border-t-2 border-lime-200 p-2 text-center text-xs font-semibold text-lime-800">
          Tocca una casella libera sulla mappa per piazzare l'elemento scelto.
          <button
            className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-red-600"
            onClick={() => onSelect(null)}
          >
            Annulla
          </button>
        </div>
      )}
    </div>
  )
}
