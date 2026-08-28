import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'
import { getItemDisplay, formatDuration } from '../game/utils'

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
    <div className="rounded-2xl border-4 border-lime-700/40 bg-white/90 p-3 shadow-lg">
      <h3 className="mb-2 flex items-center gap-1 text-sm font-extrabold text-lime-900">
        📋 Bacheca Ordini
      </h3>
      <div className="flex flex-col gap-2">
        {orders.map((order) => {
          const canFulfill = order.requirements.every(
            (req) => (inventory[req.itemId] ?? 0) >= req.qty,
          )
          return (
            <div key={order.id} className="rounded-xl border-2 border-teal-200 bg-teal-50 p-2">
              <div className="mb-1 flex flex-wrap gap-2">
                {order.requirements.map((req) => {
                  const info = getItemDisplay(req.itemId)
                  const has = inventory[req.itemId] ?? 0
                  return (
                    <span
                      key={req.itemId}
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        has >= req.qty ? 'bg-green-200 text-green-800' : 'bg-white text-teal-700'
                      }`}
                    >
                      {info.emoji} {has}/{req.qty}
                    </span>
                  )
                })}
              </div>
              <div className="flex items-center justify-between text-xs text-teal-700">
                <span>
                  🪙{order.rewardCoins} • ⭐{order.rewardXp}
                  {order.rewardGems > 0 ? ` • 💎${order.rewardGems}` : ''}
                </span>
                <span className="text-[10px] text-teal-500">
                  scade in {formatDuration(order.expiresAt - now)}
                </span>
              </div>
              <button
                disabled={!canFulfill}
                onClick={() => fulfillOrder(order.id)}
                className="mt-1 w-full rounded-full bg-teal-500 py-1 text-xs font-bold text-white shadow disabled:opacity-40"
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
