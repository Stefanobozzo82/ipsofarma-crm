import { useGameStore } from '../game/store'

export default function MissionPanel() {
  const missions = useGameStore((s) => s.missions)
  const claimMission = useGameStore((s) => s.claimMission)

  return (
    <div className="rounded-2xl border-4 border-lime-700/40 bg-white/90 p-3 shadow-lg">
      <h3 className="mb-2 flex items-center gap-1 text-sm font-extrabold text-lime-900">
        🎯 Missioni Giornaliere
      </h3>
      <div className="flex flex-col gap-2">
        {missions.map((m) => {
          const done = m.progress >= m.goalCount
          const pct = Math.min(100, Math.round((m.progress / m.goalCount) * 100))
          return (
            <div key={m.id} className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-2">
              <p className="text-xs font-semibold text-indigo-900">{m.description}</p>
              <div className="my-1 h-2 overflow-hidden rounded-full bg-indigo-100">
                <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-indigo-600">
                <span>
                  {m.progress}/{m.goalCount} • 🪙{m.rewardCoins} ⭐{m.rewardXp}
                </span>
                <button
                  disabled={!done || m.claimed}
                  onClick={() => claimMission(m.id)}
                  className="rounded-full bg-indigo-500 px-2 py-0.5 font-bold text-white disabled:opacity-40"
                >
                  {m.claimed ? 'Riscossa ✓' : 'Riscuoti'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
