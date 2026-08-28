import { useGameStore } from '../game/store'
import type { ShopSelection } from '../components/ShopMenu'
import Tile from './Tile'
import CropPlant from './CropPlant'
import BuildingModel from './BuildingModel'
import HabitatModel from './HabitatModel'
import DecorationModel from './DecorationModel'

export const TILE_SIZE = 1
export const TILE_GAP = 0.14
export const SPACING = TILE_SIZE + TILE_GAP

export function worldPos(x: number, y: number, cols: number, rows: number): [number, number] {
  const px = (x - (cols - 1) / 2) * SPACING
  const pz = (y - (rows - 1) / 2) * SPACING
  return [px, pz]
}

export default function FarmScene({
  selection,
  onSelectionUsed,
  onOpenCell,
}: {
  selection: ShopSelection
  onSelectionUsed: () => void
  onOpenCell: (cellId: string) => void
}) {
  const cells = useGameStore((s) => s.cells)
  const unlockCell = useGameStore((s) => s.unlockCell)
  const plantCrop = useGameStore((s) => s.plantCrop)
  const harvestCrop = useGameStore((s) => s.harvestCrop)
  const placeBuilding = useGameStore((s) => s.placeBuilding)
  const coins = useGameStore((s) => s.coins)

  const cols = Math.max(...cells.map((c) => c.x)) + 1
  const rows = Math.max(...cells.map((c) => c.y)) + 1

  function handleCellClick(cellId: string) {
    const cell = cells.find((c) => c.id === cellId)
    if (!cell) return

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

    if (cell.content.kind === 'building' || cell.content.kind === 'habitat') {
      onOpenCell(cell.id)
    }
  }

  return (
    <group>
      {cells.map((cell) => {
        const [x, z] = worldPos(cell.x, cell.y, cols, rows)
        return (
          <group key={cell.id} position={[x, 0, z]}>
            <Tile cell={cell} onClick={() => handleCellClick(cell.id)} />
            {!cell.locked && cell.content?.kind === 'crop' && (
              <CropPlant content={cell.content} onClick={() => handleCellClick(cell.id)} />
            )}
            {!cell.locked && cell.content?.kind === 'decoration' && (
              <DecorationModel decorationId={cell.content.decorationId} />
            )}
            {!cell.locked && cell.content?.kind === 'building' && (
              <BuildingModel content={cell.content} onClick={() => handleCellClick(cell.id)} />
            )}
            {!cell.locked && cell.content?.kind === 'habitat' && (
              <HabitatModel cellId={cell.id} content={cell.content} onClick={() => handleCellClick(cell.id)} />
            )}
          </group>
        )
      })}
    </group>
  )
}
