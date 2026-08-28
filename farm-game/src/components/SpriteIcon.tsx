/**
 * Mostra uno sprite se disponibile, altrimenti l'emoji di fallback.
 * Usato ovunque un item (coltura/animale/decorazione) va rappresentato
 * come piccola icona dentro un badge "pop" o in una lista.
 */
export default function SpriteIcon({
  sprite,
  emoji,
  alt,
  className,
  pixelated = true,
}: {
  sprite?: string
  emoji: string
  alt?: string
  className?: string
  pixelated?: boolean
}) {
  if (sprite) {
    return (
      <img
        src={sprite}
        alt={alt ?? ''}
        draggable={false}
        className={className}
        style={pixelated ? { imageRendering: 'pixelated' } : undefined}
      />
    )
  }
  return <span className={className}>{emoji}</span>
}
