import { useGameStore } from '../game/store'
import { getItemDisplay } from '../game/utils'
import SpriteIcon from './SpriteIcon'

export default function Inventory() {
  const inventory = useGameStore((s) => s.inventory)
  const sellItem = useGameStore((s) => s.sellItem)

  const entries = Object.entries(inventory).filter(([, qty]) => qty > 0)

  return (
    <div className="wood-panel p-3">
      <h3 className="mb-2 flex items-center gap-1 text-sm font-extrabold text-amber-950">
        🧺 Magazzino
      </h3>
      {entries.length === 0 && (
        <p className="text-xs text-amber-800/70">Vuoto. Raccogli colture e prodotti animali!</p>
      )}
      <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto scrollbar-thin sm:grid-cols-3">
        {entries.map(([itemId, qty]) => {
          const info = getItemDisplay(itemId)
          return (
            <div
              key={itemId}
              className="pop-badge-square flex flex-col items-center bg-gradient-to-b from-lime-50 to-lime-200 p-1.5 text-center"
            >
              <span className="pop-badge grid h-9 w-9 place-items-center bg-gradient-to-b from-white to-lime-200">
                <SpriteIcon sprite={info.sprite} emoji={info.emoji} alt={info.name} className="h-7 w-7 object-contain text-lg" />
              </span>
              <span className="mt-1 text-[11px] font-bold text-lime-950">{info.name}</span>
              <span className="text-[10px] text-lime-800">x{qty}</span>
              <button
                onClick={() => sellItem(itemId, qty)}
                className="chunky-btn mt-1 bg-gradient-to-b from-yellow-300 to-yellow-500 px-2 py-0.5 text-[10px] text-yellow-950"
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
