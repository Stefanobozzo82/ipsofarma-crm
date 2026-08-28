import type { Cell } from '../game/types'
import { CROPS_BY_ID } from '../game/data/crops'
import { BUILDINGS_BY_ID } from '../game/data/buildings'
import { ANIMALS_BY_HABITAT } from '../game/data/animals'
import { useGameStore } from '../game/store'
import { formatDuration } from '../game/utils'

export default function CellTile({ cell, onClick }: { cell: Cell; onClick: () => void }) {
  const now = Date.now()
  const animals = useGameStore((s) => s.animals)

  if (cell.locked) {
    return (
      <button
        onClick={onClick}
        title={`Sblocca per 🪙 ${cell.unlockCost}`}
        className="group relative aspect-square rounded-lg border-2 border-green-900/20 bg-green-800/40 shadow-inner transition hover:bg-green-800/55"
      >
        <span className="absolute inset-0 grid place-items-center text-lg opacity-70 grayscale">
          🌲
        </span>
        <span className="absolute bottom-0.5 left-0 right-0 rounded bg-black/50 text-[10px] font-bold text-white">
          🪙{cell.unlockCost}
        </span>
      </button>
    )
  }

  if (!cell.content) {
    return (
      <button
        onClick={onClick}
        className="aspect-square rounded-lg border-2 border-dashed border-lime-700/30 bg-lime-100/70 transition hover:border-lime-600 hover:bg-lime-200"
      />
    )
  }

  if (cell.content.kind === 'crop') {
    const crop = CROPS_BY_ID[cell.content.cropId]
    const ready = now >= cell.content.readyAt
    const total = cell.content.readyAt - cell.content.plantedAt
    const elapsed = Math.min(total, now - cell.content.plantedAt)
    const pct = total > 0 ? Math.round((elapsed / total) * 100) : 100
    return (
      <button
        onClick={onClick}
        className={`relative aspect-square rounded-lg border-2 bg-amber-800/20 shadow-inner transition ${
          ready
            ? 'border-yellow-400 bg-yellow-100 hover:scale-105'
            : 'border-amber-700/30 hover:bg-amber-800/30'
        }`}
      >
        <span className={`absolute inset-0 grid place-items-center text-2xl ${ready ? 'animate-pop-in' : ''}`}>
          {ready ? crop?.emoji : '🌱'}
        </span>
        {!ready && (
          <span className="absolute inset-x-1 bottom-1 h-1.5 overflow-hidden rounded-full bg-black/20">
            <span className="block h-full rounded-full bg-lime-500" style={{ width: `${pct}%` }} />
          </span>
        )}
        {ready && (
          <span className="absolute -top-1.5 -right-1.5 text-sm">✨</span>
        )}
      </button>
    )
  }

  if (cell.content.kind === 'decoration') {
    const def = BUILDINGS_BY_ID[cell.content.decorationId]
    return (
      <div
        className="aspect-square rounded-lg border-2 border-sky-700/20 bg-sky-100/60 shadow-inner"
        title={def?.name}
      >
        <span className="grid h-full w-full place-items-center text-2xl">{def?.emoji}</span>
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
      <button
        onClick={onClick}
        className="relative aspect-square rounded-lg border-2 border-orange-700/30 bg-orange-100 shadow-inner transition hover:bg-orange-200"
      >
        <span className="absolute inset-0 grid place-items-center text-2xl">{def?.emoji}</span>
        <span className="absolute bottom-0.5 left-0.5 text-[10px] font-bold text-orange-900">
          {occupants.length}/{def?.capacity ?? 0}
        </span>
        {species && occupants.length === 0 && (
          <span className="absolute top-0.5 right-0.5 text-[10px] font-bold text-orange-700">+</span>
        )}
        {anyReady && <span className="absolute -top-1.5 -right-1.5 animate-pop-in text-base">✨</span>}
        {babyGrowing && !anyReady && <span className="absolute -top-1.5 -right-1.5 text-base">🍼</span>}
        {cell.content.breeding && now < cell.content.breeding.readyAt && (
          <span className="absolute -bottom-1.5 -right-1.5 text-base">💞</span>
        )}
      </button>
    )
  }

  if (cell.content.kind === 'building') {
    const def = BUILDINGS_BY_ID[cell.content.buildingId]
    const job = cell.content.job
    const jobReady = job && now >= job.endsAt
    return (
      <button
        onClick={onClick}
        className={`relative aspect-square rounded-lg border-2 shadow-inner transition ${
          jobReady
            ? 'border-purple-400 bg-purple-100 hover:scale-105'
            : 'border-purple-700/30 bg-purple-50 hover:bg-purple-100'
        }`}
      >
        <span className="absolute inset-0 grid place-items-center text-2xl">{def?.emoji}</span>
        {job && !jobReady && (
          <span className="absolute bottom-0.5 left-0.5 right-0.5 rounded bg-black/50 text-[9px] font-bold text-white">
            {formatDuration(job.endsAt - now)}
          </span>
        )}
        {jobReady && <span className="absolute -top-1.5 -right-1.5 animate-pop-in text-base">✨</span>}
      </button>
    )
  }

  return null
}
