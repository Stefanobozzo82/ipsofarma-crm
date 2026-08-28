import { useEffect, useState } from 'react'
import type { Cell } from '../game/types'
import { BUILDINGS_BY_ID } from '../game/data/buildings'
import { ANIMALS_BY_HABITAT } from '../game/data/animals'
import { useGameStore } from '../game/store'
import { formatDuration } from '../game/utils'
import SpriteIcon from './SpriteIcon'

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
          <div className="pop-badge-square mb-3 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-b from-orange-50 to-orange-100 p-2">
            <span className="flex items-center gap-1 text-sm font-semibold text-orange-900">
              Compra {species.name}
              <SpriteIcon sprite={species.sprite} emoji={species.emoji} alt={species.name} className="h-5 w-5 object-contain" />— 🪙{species.buyCost}
            </span>
            <button
              disabled={!canBuy}
              onClick={() => buyAnimal(cell.id, species.id)}
              className="chunky-btn bg-gradient-to-b from-orange-400 to-orange-600 px-3 py-1 text-sm text-white"
            >
              Compra
            </button>
          </div>
        )}

        {species && (
          <div className="pop-badge-square mb-3 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-b from-pink-50 to-pink-100 p-2">
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
              className="chunky-btn bg-gradient-to-b from-pink-400 to-pink-600 px-3 py-1 text-sm text-white"
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
                className="pop-badge-square flex flex-col items-center gap-1 bg-gradient-to-b from-white to-orange-50 p-2 text-center"
              >
                <span className="pop-badge grid h-11 w-11 place-items-center bg-gradient-to-b from-white to-orange-200">
                  {animal.stage === 'baby' ? (
                    <span className="text-xl">{s.babyEmoji}</span>
                  ) : animal.isRare ? (
                    <span className="text-xl">{s.rareVariantEmoji}</span>
                  ) : (
                    <SpriteIcon sprite={s.sprite} emoji={s.emoji} alt={s.name} className="h-8 w-8 object-contain text-xl" />
                  )}
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
                      className="chunky-btn bg-gradient-to-b from-sky-400 to-sky-600 px-2 py-0.5 text-[11px] text-white"
                    >
                      🍽️ Nutri
                    </button>
                  </>
                ) : (
                  <button
                    disabled={!produceReady}
                    onClick={() => collectAnimalProduce(animal.id)}
                    className="chunky-btn bg-gradient-to-b from-pink-400 to-pink-600 px-2 py-0.5 text-[11px] text-white"
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
        <div className="pop-badge-square bg-gradient-to-b from-purple-50 to-purple-100 p-3 text-center">
          {jobReady ? (
            <button
              onClick={() => collectCraft(cell.id)}
              className="chunky-btn bg-gradient-to-b from-purple-400 to-purple-600 px-4 py-1.5 text-white"
            >
              ✨ Ritira lavorazione
            </button>
          ) : (
            <p className="font-semibold text-purple-800">
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
                className="pop-badge-square flex flex-wrap items-center justify-between gap-2 bg-gradient-to-b from-white to-purple-50 p-2"
              >
                <div className="text-sm">
                  <span className="font-bold text-purple-900">
                    {recipe.emoji} {recipe.name}
                  </span>
                  <div className="text-xs text-purple-700">
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
                  className="chunky-btn bg-gradient-to-b from-purple-400 to-purple-600 px-3 py-1 text-sm text-white"
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
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="wood-panel max-h-[80vh] w-full max-w-lg overflow-y-auto p-4 scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-amber-950">{title}</h3>
          <button
            onClick={onClose}
            className="chunky-btn grid h-8 w-8 place-items-center bg-gradient-to-b from-red-300 to-red-500 text-white"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
