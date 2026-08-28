import { useEffect } from 'react'
import { useGameStore } from '../game/store'

/** Mostra le notifiche "pop-up" (monete/XP guadagnati, eventi) in alto a destra. */
export default function FloatingPopups() {
  const popups = useGameStore((s) => s.popups)
  const removePopup = useGameStore((s) => s.removePopup)

  useEffect(() => {
    if (popups.length === 0) return
    const timers = popups.map((p) =>
      setTimeout(() => removePopup(p.id), 1400),
    )
    return () => timers.forEach(clearTimeout)
  }, [popups, removePopup])

  return (
    <div className="pointer-events-none fixed right-3 top-16 z-[1000] flex flex-col items-end gap-1.5">
      {popups.slice(-6).map((p) => (
        <div
          key={p.id}
          className="animate-float-up rounded-full border-2 bg-white/95 px-3 py-1 text-sm font-bold shadow-lg"
          style={{ borderColor: p.color, color: p.color }}
        >
          {p.text}
        </div>
      ))}
    </div>
  )
}
