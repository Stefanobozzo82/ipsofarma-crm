import { useEffect, useState } from 'react'
import type { Cell } from '../game/types'
import { BUILDINGS_BY_ID } from '../game/data/buildings'
import { ANIMALS_BY_HABITAT } from '../game/data/animals'
import { useGameStore } from '../game/store'
import { formatDuration } from '../game/utils'

function useClock() {
  const [, setTime] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setTime(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
}

export default function BuildingModal({ cell, onClose }: { cell: Cell; onClose: () => void }) {
  useClock()
  const now = Date.now()
  const inventory = useGameStore((s) => s.inventory)
  const coins = useGameStore((s) => s.coins)
  const animals = useGameStore((s) => s.animals)
  const buyAnimal = useGameStore((s) => s.buyAnimal)
  const feedAnimal = useGameStore((s) => s.feedAnimal)
  const collectAnimalProduce = useGameStore((s) => s.collectAnimalProduce)
  const startBreeding = useGameStore((s) => s.startBreeding)
  const startCraft = useGameStore((s) => s.startCraft)
  const collectCraft = useGameStore((s) => s.collectCraft)

  if (!cell.content || cell.content.kind === 'crop' || cell.content.kind === 'decoration') return null

  if (cell.content.kind === 'habitat') {
    const def = BUILDINGS_BY_ID[cell.content.habitatId]
    const species = ANIMALS_BY_HABITAT[cell.content.habitatId]
    const occupants = animals.filter((a) => a.habitatCellId === cell.id)
    const canBuy = species && occupants.length < (def?.capacity ?? 0) && coins >= species.buyCost
    const adults = occupants.filter((a) => a.stage === 'adult')
    const breeding = cell.content.breeding
    const canBreed =
      species && adults.length >= 2 && occupants.length < (def?.capacity ?? 0) && !breeding && coins >= species.buyCost

    return (
      <Modal onClose={onClose} title={`${def?.emoji} ${def?.name}`}>
        {species && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-orange-50 p-2">
            <span className="text-sm font-semibold text-orange-900">
              Compra {species.name} {species.emoji} — 🪙{species.buyCost}
            </span>
            <button
              disabled={!canBuy}
              onClick={() => buyAnimal(cell.id, species.id)}
              className="rounded-full bg-orange-500 px-3 py-1 text-sm font-bold text-white shadow disabled:opacity-40"
            >
              Compra
            </button>
          </div>
        )}

        {species && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-pink-50 p-2">
            <span className="text-sm font-semibold text-pink-900">
              💞 Incrocia 2 adulti — 🪙{species.buyCost}
              {breeding && !((now) >= breeding.readyAt) && (
                <span className="ml-1 text-xs text-pink-500">
                  (in corso: {formatDuration(breeding.readyAt - now)})
                </span>
              )}
            </span>
            <button
              disabled={!canBreed}
              onClick={() => startBreeding(cell.id)}
              className="rounded-full bg-pink-500 px-3 py-1 text-sm font-bold text-white shadow disabled:opacity-40"
            >
              Incrocia
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {occupants.map((animal) => {
            const s = ANIMALS_BY_HABITAT[cell.content!.kind === 'habitat' ? cell.content!.habitatId : '']
            if (!s) return null
            const feedReady =
              animal.lastFedAt === 0 || now - animal.lastFedAt >= s.feedIntervalSec * 1000
            const produceReady = animal.produceReadyAt != null && now >= animal.produceReadyAt
            const hasFeed = (inventory[s.feedItemId] ?? 0) > 0
            return (
              <div
                key={animal.id}
                className="flex flex-col items-center gap-1 rounded-xl border-2 border-orange-200 bg-white p-2 text-center"
              >
                <span className="text-2xl">
                  {animal.stage === 'baby' ? s.babyEmoji : animal.isRare ? s.rareVariantEmoji : s.emoji}
                </span>
                <span className="text-[11px] font-bold text-orange-900">
                  {animal.isRare ? s.rareVariantName : s.name}
                </span>
                {animal.stage === 'baby' ? (
                  <>
                    <span className="text-[10px] text-orange-600">
                      Nutrito {animal.feedsGiven}/{s.feedsToGrow}
                    </span>
                    <button
                      disabled={!feedReady || !hasFeed}
                      onClick={() => feedAnimal(animal.id)}
                      className="rounded-full bg-sky-500 px-2 py-0.5 text-[11px] font-bold text-white disabled:opacity-40"
                    >
                      🍽️ Nutri
                    </button>
                  </>
                ) : (
                  <button
                    disabled={!produceReady}
                    onClick={() => collectAnimalProduce(animal.id)}
                    className="rounded-full bg-pink-500 px-2 py-0.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    {produceReady
                      ? `${s.produceEmoji} Raccogli`
                      : formatDuration((animal.produceReadyAt ?? now) - now)}
                  </button>
                )}
              </div>
            )
          })}
          {occupants.length === 0 && (
            <p className="col-span-full py-3 text-sm text-orange-700/70">
              Nessun animale qui. Comprane uno per iniziare!
            </p>
          )}
        </div>
      </Modal>
    )
  }

  // production building
  const def = BUILDINGS_BY_ID[cell.content.buildingId]
  const job = cell.content.job
  const jobReady = job && now >= job.endsAt

  return (
    <Modal onClose={onClose} title={`${def?.emoji} ${def?.name}`}>
      <p className="mb-3 text-sm text-purple-800/80">{def?.description}</p>

      {job ? (
        <div className="rounded-xl bg-purple-50 p-3 text-center">
          {jobReady ? (
            <button
              onClick={() => collectCraft(cell.id)}
              className="rounded-full bg-purple-500 px-4 py-1.5 font-bold text-white shadow"
            >
              ✨ Ritira lavorazione
            </button>
          ) : (
            <p className="font-semibold text-purple-700">
              ⏳ Lavorazione in corso — pronta tra {formatDuration(job.endsAt - now)}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {def?.recipes?.map((recipe) => {
            const canCraft = recipe.inputs.every((inp) => (inventory[inp.itemId] ?? 0) >= inp.qty)
            return (
              <div
                key={recipe.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-purple-200 bg-white p-2"
              >
                <div className="text-sm">
                  <span className="font-bold text-purple-900">
                    {recipe.emoji} {recipe.name}
                  </span>
                  <div className="text-xs text-purple-600">
                    Richiede:{' '}
                    {recipe.inputs
                      .map((inp) => `${inp.itemId} x${inp.qty} (hai ${inventory[inp.itemId] ?? 0})`)
                      .join(', ')}{' '}
                    • {formatDuration(recipe.timeSec * 1000)}
                  </div>
                </div>
                <button
                  disabled={!canCraft}
                  onClick={() => startCraft(cell.id, recipe.id)}
                  className="rounded-full bg-purple-500 px-3 py-1 text-sm font-bold text-white shadow disabled:opacity-40"
                >
                  Avvia
                </button>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border-4 border-lime-700/30 bg-white p-4 shadow-2xl scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-lime-900">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-red-100 font-bold text-red-500 hover:bg-red-200"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
