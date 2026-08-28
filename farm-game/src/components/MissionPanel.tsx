import { useGameStore } from '../game/store'

export default function MissionPanel() {
  const missions = useGameStore((s) => s.missions)
  const claimMission = useGameStore((s) => s.claimMission)

  return (
    <div className="wood-panel p-3">
      <h3 className="mb-2 flex items-center gap-1 text-sm font-extrabold text-amber-950">
        🎯 Missioni Giornaliere
      </h3>
      <div className="flex flex-col gap-2">
        {missions.map((m) => {
          const done = m.progress >= m.goalCount
          const pct = Math.min(100, Math.round((m.progress / m.goalCount) * 100))
          return (
            <div key={m.id} className="pop-badge-square bg-gradient-to-b from-indigo-50 to-indigo-200 p-2">
              <p className="text-xs font-semibold text-indigo-950">{m.description}</p>
              <div className="my-1 h-2 overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-300 to-indigo-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-indigo-700">
                <span>
                  {m.progress}/{m.goalCount} • 🪙{m.rewardCoins} ⭐{m.rewardXp}
                </span>
                <button
                  disabled={!done || m.claimed}
                  onClick={() => claimMission(m.id)}
                  className="chunky-btn bg-gradient-to-b from-indigo-400 to-indigo-600 px-2 py-0.5 text-white"
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
