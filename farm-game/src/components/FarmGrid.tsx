import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'
import type { Cell } from '../game/types'
import { CROPS_BY_ID } from '../game/data/crops'
import { BUILDINGS_BY_ID } from '../game/data/buildings'
import type { ShopSelection } from './ShopMenu'
import CellTile from './CellTile'
import BuildingModal from './BuildingModal'

/** Tick locale per forzare il ri-render ogni secondo (barre di progresso in tempo reale). */
function useClock() {
  const [, setTime] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setTime(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
}

export default function FarmGrid({
  selection,
  onSelectionUsed,
}: {
  selection: ShopSelection
  onSelectionUsed: () => void
}) {
  useClock()
  const cells = useGameStore((s) => s.cells)
  const unlockCell = useGameStore((s) => s.unlockCell)
  const plantCrop = useGameStore((s) => s.plantCrop)
  const harvestCrop = useGameStore((s) => s.harvestCrop)
  const placeBuilding = useGameStore((s) => s.placeBuilding)
  const coins = useGameStore((s) => s.coins)

  const [activeCell, setActiveCell] = useState<Cell | null>(null)

  const cols = Math.max(...cells.map((c) => c.x)) + 1
  const sorted = [...cells].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

  function handleCellClick(cell: Cell) {
    if (cell.locked) {
      if (coins >= cell.unlockCost) unlockCell(cell.id)
      return
    }

    if (!cell.content) {
      if (selection?.kind === 'crop') {
        plantCrop(cell.id, selection.id)
        onSelectionUsed()
        return
      }
      if (selection?.kind === 'building') {
        placeBuilding(cell.id, selection.id)
        onSelectionUsed()
        return
      }
      return
    }

    if (cell.content.kind === 'crop') {
      harvestCrop(cell.id)
      return
    }

    // buildings / habitats / decorations open a detail panel
    if (cell.content.kind === 'building' || cell.content.kind === 'habitat') {
      setActiveCell(cell)
    }
  }

  return (
    <div className="flex-1 overflow-auto rounded-2xl border-4 border-lime-700/40 bg-gradient-to-b from-green-200 to-green-300 p-3 shadow-inner">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(56px, 1fr))` }}
      >
        {sorted.map((cell) => (
          <CellTile key={cell.id} cell={cell} onClick={() => handleCellClick(cell)} />
        ))}
      </div>

      {activeCell && (
        <BuildingModal
          cell={cells.find((c) => c.id === activeCell.id) ?? activeCell}
          onClose={() => setActiveCell(null)}
        />
      )}
    </div>
  )
}

export function cropInfo(id: string) {
  return CROPS_BY_ID[id]
}
export function buildingInfo(id: string) {
  return BUILDINGS_BY_ID[id]
}
