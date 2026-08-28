import { useState } from 'react'
import { CROPS } from '../game/data/crops'
import { BUILDINGS } from '../game/data/buildings'
import { ANIMALS_BY_HABITAT } from '../game/data/animals'
import { useGameStore, useLevel } from '../game/store'
import SpriteIcon from './SpriteIcon'

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
    <div className="wood-panel flex h-full flex-col overflow-hidden">
      <div className="flex gap-1 overflow-x-auto border-b-2 border-amber-300/70 p-2 scrollbar-thin">
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`chunky-btn whitespace-nowrap px-3 py-1.5 text-sm ${
              category === cat
                ? 'bg-gradient-to-b from-lime-300 to-lime-500 text-lime-950'
                : 'bg-gradient-to-b from-lime-50 to-lime-100 text-lime-700'
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
                  <span className="pop-badge grid h-9 w-9 place-items-center bg-gradient-to-b from-white to-amber-200">
                    <SpriteIcon sprite={crop.iconSprite} emoji={crop.emoji} alt={crop.name} className="h-7 w-7 object-contain text-xl" />
                  </span>
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
                  <span className="pop-badge grid h-9 w-9 place-items-center bg-gradient-to-b from-white to-orange-200">
                    <SpriteIcon
                      sprite={ANIMALS_BY_HABITAT[h.id]?.sprite ?? h.sprite}
                      emoji={h.emoji}
                      alt={h.name}
                      className="h-7 w-7 object-contain text-xl"
                    />
                  </span>
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
                  <span className="pop-badge grid h-9 w-9 place-items-center bg-gradient-to-b from-white to-purple-200">
                    <SpriteIcon sprite={b.sprite} emoji={b.emoji} alt={b.name} className="h-7 w-7 object-contain text-xl" />
                  </span>
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
                  <span className="pop-badge grid h-9 w-9 place-items-center bg-gradient-to-b from-white to-sky-200">
                    <SpriteIcon sprite={d.sprite} emoji={d.emoji} alt={d.name} className="h-7 w-7 object-contain text-xl" />
                  </span>
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
