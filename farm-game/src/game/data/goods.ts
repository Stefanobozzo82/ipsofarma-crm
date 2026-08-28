// Beni non-coltura: prodotti animali grezzi + prodotti trasformati (crafting).
// Usati per prezzi di vendita in magazzino e per soddisfare gli ordini.
export interface GoodInfo {
  id: string
  name: string
  emoji: string
  sellPrice: number
}

export const GOODS: GoodInfo[] = [
  { id: 'uovo', name: 'Uovo', emoji: '🥚', sellPrice: 10 },
  { id: 'lana', name: 'Lana', emoji: '🧶', sellPrice: 22 },
  { id: 'latte', name: 'Latte', emoji: '🥛', sellPrice: 18 },
  { id: 'tartufo', name: 'Tartufo', emoji: '🍄', sellPrice: 60 },
  { id: 'mangime', name: 'Mangime', emoji: '🌰', sellPrice: 5 },
  { id: 'formaggio', name: 'Formaggio', emoji: '🧀', sellPrice: 45 },
  { id: 'pane', name: 'Pane', emoji: '🍞', sellPrice: 30 },
  { id: 'torta', name: 'Torta', emoji: '🎂', sellPrice: 90 },
  { id: 'maglione', name: 'Maglione', emoji: '🧥', sellPrice: 70 },
]

export const GOODS_BY_ID: Record<string, GoodInfo> = Object.fromEntries(
  GOODS.map((g) => [g.id, g]),
)

/** Restituisce nome/emoji per qualsiasi itemId (coltura, prodotto animale o bene lavorato). */
export function getItemInfo(
  itemId: string,
): { name: string; emoji: string } | undefined {
  const good = GOODS_BY_ID[itemId]
  if (good) return good
  return undefined
}
