import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'
import { getItemDisplay, formatDuration } from '../game/utils'
import SpriteIcon from './SpriteIcon'

function useClock() {
  const [, setTime] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setTime(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
}

export default function OrderBoard() {
  useClock()
  const now = Date.now()
  const orders = useGameStore((s) => s.orders)
  const inventory = useGameStore((s) => s.inventory)
  const fulfillOrder = useGameStore((s) => s.fulfillOrder)

  return (
    <div className="wood-panel p-3">
      <h3 className="mb-2 flex items-center gap-1 text-sm font-extrabold text-amber-950">
        📋 Bacheca Ordini
      </h3>
      <div className="flex flex-col gap-2">
        {orders.map((order) => {
          const canFulfill = order.requirements.every(
            (req) => (inventory[req.itemId] ?? 0) >= req.qty,
          )
          return (
            <div key={order.id} className="pop-badge-square bg-gradient-to-b from-teal-50 to-teal-200 p-2">
              <div className="mb-1 flex flex-wrap gap-2">
                {order.requirements.map((req) => {
                  const info = getItemDisplay(req.itemId)
                  const has = inventory[req.itemId] ?? 0
                  return (
                    <span
                      key={req.itemId}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold shadow-sm ${
                        has >= req.qty ? 'bg-green-200 text-green-900' : 'bg-white text-teal-800'
                      }`}
                    >
                      <SpriteIcon sprite={info.sprite} emoji={info.emoji} alt={info.name} className="h-4 w-4 object-contain" />
                      {has}/{req.qty}
                    </span>
                  )
                })}
              </div>
              <div className="flex items-center justify-between text-xs text-teal-800">
                <span>
                  🪙{order.rewardCoins} • ⭐{order.rewardXp}
                  {order.rewardGems > 0 ? ` • 💎${order.rewardGems}` : ''}
                </span>
                <span className="text-[10px] text-teal-600">
                  scade in {formatDuration(order.expiresAt - now)}
                </span>
              </div>
              <button
                disabled={!canFulfill}
                onClick={() => fulfillOrder(order.id)}
                className="chunky-btn mt-1 w-full bg-gradient-to-b from-teal-400 to-teal-600 py-1 text-xs text-white"
              >
                Consegna
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
