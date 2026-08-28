import type { CSSProperties } from 'react'
import type { Cell } from '../game/types'
import { CROPS_BY_ID } from '../game/data/crops'
import { BUILDINGS_BY_ID } from '../game/data/buildings'
import { ANIMALS_BY_HABITAT } from '../game/data/animals'
import { useGameStore } from '../game/store'
import { formatDuration } from '../game/utils'
import { TILE_H, TILE_W, TOP_PADDING, isoPosition } from '../game/iso'

/**
 * Ogni cella occupa un riquadro rettangolare (serve per il posizionamento
 * isometrico), ma questi riquadri si sovrappongono ai vicini. Per questo
 * il click è applicato solo al rombo del terreno (clip-path) e al badge
 * del contenuto "pop-up", non all'intero wrapper rettangolare.
 */
export default function CellTile({
  cell,
  rows,
  onClick,
}: {
  cell: Cell
  rows: number
  onClick: () => void
}) {
  const now = Date.now()
  const animals = useGameStore((s) => s.animals)
  const { left, top, z } = isoPosition(cell.x, cell.y, rows)

  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    left,
    top,
    width: TILE_W,
    height: TILE_H + TOP_PADDING,
    zIndex: z,
  }

  function Ground({ face }: { face: string }) {
    return (
      <div className="absolute inset-x-0 bottom-0" style={{ height: TILE_H }}>
        <div
          onClick={onClick}
          className={`iso-diamond pointer-events-auto absolute inset-0 cursor-pointer transition group-hover:brightness-110 ${face}`}
        />
        <div className="iso-diamond-outline pointer-events-none absolute inset-0" />
        <div className="iso-ground-shadow" />
      </div>
    )
  }

  if (cell.locked) {
    return (
      <div style={wrapperStyle} data-cell={cell.id} className="group pointer-events-none" title={`Sblocca per 🪙 ${cell.unlockCost}`}>
        <Ground face="iso-face-locked" />
        <span
          className="pointer-events-none absolute text-2xl opacity-80 drop-shadow"
          style={{ left: '50%', top: TOP_PADDING - 6, transform: 'translate(-50%,-55%)' }}
        >
          🌲
        </span>
        <span
          className="pointer-events-none absolute rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-extrabold text-white"
          style={{ left: '50%', bottom: 6, transform: 'translateX(-50%)' }}
        >
          🪙 {cell.unlockCost}
        </span>
      </div>
    )
  }

  if (!cell.content) {
    return (
      <div style={wrapperStyle} data-cell={cell.id} className="group pointer-events-none">
        <Ground face="iso-face-grass" />
      </div>
    )
  }

  if (cell.content.kind === 'crop') {
    const crop = CROPS_BY_ID[cell.content.cropId]
    const ready = now >= cell.content.readyAt
    const total = cell.content.readyAt - cell.content.plantedAt
    const elapsed = Math.min(total, now - cell.content.plantedAt)
    const pct = total > 0 ? Math.round((elapsed / total) * 100) : 100
    return (
      <div style={wrapperStyle} data-cell={cell.id} className="group pointer-events-none">
        <Ground face={ready ? 'iso-face-ready' : 'iso-face-dirt'} />

        <div
          onClick={onClick}
          className="pointer-events-auto absolute flex cursor-pointer flex-col items-center"
          style={{ left: '50%', top: TOP_PADDING - 4, transform: 'translate(-50%,-92%)' }}
        >
          <span className={`pop-badge grid h-10 w-10 place-items-center bg-gradient-to-b from-lime-100 to-lime-300 text-xl ${ready ? 'animate-bob' : ''}`}>
            {ready ? crop?.emoji : '🌱'}
          </span>
          {!ready && (
            <span className="mt-1 h-1.5 w-9 overflow-hidden rounded-full bg-black/25">
              <span className="block h-full rounded-full bg-lime-400" style={{ width: `${pct}%` }} />
            </span>
          )}
          {ready && <span className="animate-sparkle absolute -right-2 -top-2 text-sm">✨</span>}
        </div>
      </div>
    )
  }

  if (cell.content.kind === 'decoration') {
    const def = BUILDINGS_BY_ID[cell.content.decorationId]
    return (
      <div style={wrapperStyle} data-cell={cell.id} className="pointer-events-none" title={def?.name}>
        <div className="absolute inset-x-0 bottom-0" style={{ height: TILE_H }}>
          <div className="iso-diamond iso-face-grass absolute inset-0" />
          <div className="iso-diamond-outline absolute inset-0" />
          <div className="iso-ground-shadow" />
        </div>
        <span
          className="pointer-events-none absolute text-3xl drop-shadow-lg"
          style={{ left: '50%', top: TOP_PADDING - 4, transform: 'translate(-50%,-90%)' }}
        >
          {def?.emoji}
        </span>
      </div>
    )
  }

  if (cell.content.kind === 'habitat') {
    const def = BUILDINGS_BY_ID[cell.content.habitatId]
    const species = ANIMALS_BY_HABITAT[cell.content.habitatId]
    const occupants = animals.filter((a) => a.habitatCellId === cell.id)
    const anyReady = occupants.some(
      (a) => a.stage === 'adult' && a.produceReadyAt != null && now >= a.produceReadyAt,
    )
    const babyGrowing = occupants.some((a) => a.stage === 'baby')
    return (
      <div style={wrapperStyle} data-cell={cell.id} className="group pointer-events-none">
        <Ground face="iso-face-grass" />

        <div
          onClick={onClick}
          className="pointer-events-auto absolute flex cursor-pointer flex-col items-center"
          style={{ left: '50%', top: TOP_PADDING - 10, transform: 'translate(-50%,-88%)' }}
        >
          <span className="pop-badge-square grid h-12 w-12 place-items-center bg-gradient-to-b from-orange-100 to-orange-300 text-2xl">
            {def?.emoji}
          </span>
          <span className="mt-1 rounded-full bg-orange-900/80 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
            {occupants.length}/{def?.capacity ?? 0}
          </span>
          {anyReady && <span className="animate-sparkle absolute -right-2 -top-2 text-base">✨</span>}
          {babyGrowing && !anyReady && <span className="absolute -right-2 -top-2 text-base">🍼</span>}
          {cell.content.breeding && now < cell.content.breeding.readyAt && (
            <span className="absolute -bottom-1 -right-3 text-base">💞</span>
          )}
          {species && occupants.length === 0 && (
            <span className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-xs font-black text-white shadow">
              +
            </span>
          )}
        </div>
      </div>
    )
  }

  if (cell.content.kind === 'building') {
    const def = BUILDINGS_BY_ID[cell.content.buildingId]
    const job = cell.content.job
    const jobReady = job && now >= job.endsAt
    return (
      <div style={wrapperStyle} data-cell={cell.id} className="group pointer-events-none">
        <Ground face="iso-face-grass" />

        <div
          onClick={onClick}
          className="pointer-events-auto absolute flex cursor-pointer flex-col items-center"
          style={{ left: '50%', top: TOP_PADDING - 10, transform: 'translate(-50%,-88%)' }}
        >
          <span className="pop-badge-square grid h-12 w-12 place-items-center bg-gradient-to-b from-purple-100 to-purple-300 text-2xl">
            {def?.emoji}
          </span>
          {job && !jobReady && (
            <span className="mt-1 rounded-full bg-purple-900/80 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
              {formatDuration(job.endsAt - now)}
            </span>
          )}
          {jobReady && <span className="animate-sparkle absolute -right-2 -top-2 text-base">✨</span>}
        </div>
      </div>
    )
  }

  return null
}
