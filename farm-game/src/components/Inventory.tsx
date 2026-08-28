import { useGameStore } from '../game/store'
import { getItemDisplay } from '../game/utils'

export default function Inventory() {
  const inventory = useGameStore((s) => s.inventory)
  const sellItem = useGameStore((s) => s.sellItem)

  const entries = Object.entries(inventory).filter(([, qty]) => qty > 0)

  return (
    <div className="rounded-2xl border-4 border-lime-700/40 bg-white/90 p-3 shadow-lg">
      <h3 className="mb-2 flex items-center gap-1 text-sm font-extrabold text-lime-900">
        🧺 Magazzino
      </h3>
      {entries.length === 0 && (
        <p className="text-xs text-lime-700/70">Vuoto. Raccogli colture e prodotti animali!</p>
      )}
      <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto scrollbar-thin sm:grid-cols-3">
        {entries.map(([itemId, qty]) => {
          const info = getItemDisplay(itemId)
          return (
            <div
              key={itemId}
              className="flex flex-col items-center rounded-xl border-2 border-lime-200 bg-lime-50 p-1.5 text-center"
            >
              <span className="text-xl">{info.emoji}</span>
              <span className="text-[11px] font-bold text-lime-900">{info.name}</span>
              <span className="text-[10px] text-lime-700">x{qty}</span>
              <button
                onClick={() => sellItem(itemId, qty)}
                className="mt-1 rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-bold text-yellow-900 shadow"
              >
                Vendi 🪙{info.sellPrice * qty}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
