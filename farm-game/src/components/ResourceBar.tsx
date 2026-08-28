import { useGameStore, useLevel } from '../game/store'
import { WEATHER_INFO } from '../game/utils'

export default function ResourceBar() {
  const coins = useGameStore((s) => s.coins)
  const gems = useGameStore((s) => s.gems)
  const weather = useGameStore((s) => s.weather)
  const { level, xpIntoLevel, xpForNextLevel } = useLevel()
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100))
  const weatherInfo = WEATHER_INFO[weather]

  return (
    <div className="sticky top-0 z-30 border-b-4 border-amber-800/30 bg-gradient-to-b from-amber-50 to-amber-100/90 px-3 py-2 shadow-lg backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2.5">
        <div className="pop-badge-square flex items-center gap-2 bg-gradient-to-b from-amber-200 to-amber-400 px-3 py-1.5">
          <span className="animate-bob text-2xl">🌻</span>
          <span className="font-extrabold tracking-tight text-amber-950">Fattoria Serena</span>
        </div>

        <div className="pop-badge flex items-center gap-2 bg-gradient-to-b from-lime-200 to-lime-400 px-2.5 py-1">
          <div className="pop-badge grid h-7 w-7 place-items-center bg-gradient-to-b from-lime-400 to-lime-600 text-sm font-black text-white">
            {level}
          </div>
          <div className="h-2.5 w-24 overflow-hidden rounded-full bg-black/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-lime-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-bold text-lime-950">
            {xpIntoLevel}/{xpForNextLevel} XP
          </span>
        </div>

        <div className="pop-badge flex items-center gap-1 bg-gradient-to-b from-yellow-200 to-yellow-400 px-3 py-1 font-black text-yellow-900">
          <span className="text-lg">🪙</span>
          {coins}
        </div>
        <div className="pop-badge flex items-center gap-1 bg-gradient-to-b from-fuchsia-200 to-fuchsia-400 px-3 py-1 font-black text-fuchsia-900">
          <span className="text-lg">💎</span>
          {gems}
        </div>

        <div
          className="pop-badge ml-auto flex items-center gap-2 bg-gradient-to-b from-sky-200 to-sky-400 px-3 py-1 font-bold text-sky-900"
          title="Il meteo influenza i tempi di crescita"
        >
          <span className="text-xl">{weatherInfo.emoji}</span>
          {weatherInfo.label}
        </div>
      </div>
    </div>
  )
}
