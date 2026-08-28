import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'
import type { Cell } from '../game/types'
import { isoContainerSize } from '../game/iso'
import CellTile from './CellTile'
import BuildingModal from './BuildingModal'
import type { ShopSelection } from './ShopMenu'

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
  const rows = Math.max(...cells.map((c) => c.y)) + 1
  const { width, height } = isoContainerSize(cols, rows)

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
    <div className="iso-sky relative flex-1 overflow-auto rounded-2xl border-4 border-lime-800/40 shadow-[inset_0_4px_18px_rgba(0,0,0,0.25)]">
      <div className="relative mx-auto" style={{ width, height }}>
        {cells.map((cell) => (
          <CellTile
            key={cell.id}
            cell={cell}
            rows={rows}
            onClick={() => handleCellClick(cell)}
          />
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
