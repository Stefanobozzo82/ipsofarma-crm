import { useEffect, useState } from 'react'
import ResourceBar from './components/ResourceBar'
import FarmGrid from './components/FarmGrid'
import ShopMenu, { type ShopSelection } from './components/ShopMenu'
import Inventory from './components/Inventory'
import OrderBoard from './components/OrderBoard'
import MissionPanel from './components/MissionPanel'
import FloatingPopups from './components/FloatingPopups'
import { useGameStore } from './game/store'

export default function App() {
  const tick = useGameStore((s) => s.tick)
  const resetGame = useGameStore((s) => s.resetGame)
  const [selection, setSelection] = useState<ShopSelection>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  useEffect(() => {
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tick])

  return (
    <div className="flex min-h-screen flex-col">
      <ResourceBar />
      <FloatingPopups />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 p-3 lg:flex-row">
        <div className="flex min-h-[420px] flex-1 flex-col gap-3">
          <FarmGrid selection={selection} onSelectionUsed={() => setSelection(null)} />
        </div>

        <aside className="flex w-full flex-col gap-3 lg:w-80">
          <div className="h-64">
            <ShopMenu selection={selection} onSelect={setSelection} />
          </div>
          <Inventory />
          <OrderBoard />
          <MissionPanel />

          <button
            onClick={() => setShowResetConfirm(true)}
            className="chunky-btn bg-gradient-to-b from-red-200 to-red-400 py-1.5 text-xs text-red-950"
          >
            🗑️ Ricomincia partita
          </button>
        </aside>
      </main>

      {showResetConfirm && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="wood-panel p-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 font-bold text-red-700">
              Sei sicuro di voler ricominciare? Perderai tutti i progressi.
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => {
                  resetGame()
                  setShowResetConfirm(false)
                }}
                className="chunky-btn bg-gradient-to-b from-red-400 to-red-600 px-4 py-1.5 text-white"
              >
                Sì, ricomincia
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="chunky-btn bg-gradient-to-b from-gray-200 to-gray-300 px-4 py-1.5 text-gray-800"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="py-2 text-center text-[11px] text-lime-900/50">
        Fattoria Serena — gioco originale, salvataggio automatico nel browser 🌿
      </footer>
    </div>
  )
}
