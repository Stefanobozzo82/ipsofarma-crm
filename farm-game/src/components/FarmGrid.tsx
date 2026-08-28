import { useState } from 'react'
import { useGameStore } from '../game/store'
import Scene from '../three/Scene'
import BuildingModal from './BuildingModal'
import type { ShopSelection } from './ShopMenu'

export default function FarmGrid({
  selection,
  onSelectionUsed,
}: {
  selection: ShopSelection
  onSelectionUsed: () => void
}) {
  const cells = useGameStore((s) => s.cells)
  const [activeCellId, setActiveCellId] = useState<string | null>(null)
  const activeCell = cells.find((c) => c.id === activeCellId) ?? null

  return (
    <div className="relative flex-1 overflow-hidden rounded-2xl border-4 border-lime-800/40 shadow-[inset_0_4px_18px_rgba(0,0,0,0.25)]">
      <Scene selection={selection} onSelectionUsed={onSelectionUsed} onOpenCell={setActiveCellId} />

      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[11px] font-semibold text-white">
        🖱️ Trascina per ruotare la vista · rotella per zoom
      </div>

      {activeCell && <BuildingModal cell={activeCell} onClose={() => setActiveCellId(null)} />}
    </div>
  )
}
