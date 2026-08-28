// Proiezione isometrica 2:1 per la griglia della fattoria.
// Ogni cella è un rombo; le celle più in basso/a destra nella griglia
// logica devono disegnarsi sopra quelle dietro (algoritmo del pittore).

export const TILE_W = 108
export const TILE_H = 62
export const TOP_PADDING = 64 // spazio per edifici/colture che "spuntano" sopra il tile

export function isoPosition(x: number, y: number, rows: number) {
  const left = (x - y + (rows - 1)) * (TILE_W / 2)
  const top = (x + y) * (TILE_H / 2)
  const z = (x + y) * 10
  return { left, top, z }
}

export function isoContainerSize(cols: number, rows: number) {
  const width = (cols + rows - 1) * (TILE_W / 2) + TILE_W
  const height = (cols + rows - 2) * (TILE_H / 2) + TILE_H + TOP_PADDING + 40
  return { width, height }
}
