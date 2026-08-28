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
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b-4 border-lime-700/30 bg-white/80 px-4 py-2 shadow-md backdrop-blur">
      <div className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 shadow-inner">
        <span className="text-xl">🌻</span>
        <span className="font-bold text-amber-900">Fattoria Serena</span>
      </div>

      <div className="flex items-center gap-2 rounded-full border-2 border-lime-600 bg-lime-50 px-3 py-1">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-lime-500 text-sm font-extrabold text-white shadow">
          {level}
        </div>
        <div className="h-2.5 w-24 overflow-hidden rounded-full bg-lime-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-lime-400 to-green-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-lime-800">
          {xpIntoLevel}/{xpForNextLevel} XP
        </span>
      </div>

      <div className="flex items-center gap-1 rounded-full border-2 border-yellow-500 bg-yellow-50 px-3 py-1 font-bold text-yellow-700">
        <span>🪙</span>
        {coins}
      </div>
      <div className="flex items-center gap-1 rounded-full border-2 border-fuchsia-400 bg-fuchsia-50 px-3 py-1 font-bold text-fuchsia-700">
        <span>💎</span>
        {gems}
      </div>

      <div
        className="ml-auto flex items-center gap-2 rounded-full border-2 border-sky-400 bg-sky-50 px-3 py-1 font-semibold text-sky-800"
        title="Il meteo influenza i tempi di crescita"
      >
        <span className="text-xl">{weatherInfo.emoji}</span>
        {weatherInfo.label}
      </div>
    </div>
  )
}
