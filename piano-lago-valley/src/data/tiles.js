// Definizione dei tipi di tile della mappa fattoria e delle loro proprietà.
// I colori sono placeholder geometrici: verranno sostituiti da sprite definitivi in seguito.

import { FARM_COLS, FARM_ROWS } from '../config.js';

export const TILE = {
  GRASS: 0,
  PATH: 1,
  WATER: 2,
  TREE: 3,
  ROCK: 4,
  HOUSE_WALL: 5,
  HOUSE_DOOR: 6,
  SHIPPING_BIN: 7,
  FENCE: 8,
};

// walkable: il player ci può camminare sopra
// hoeable: la zappa può trasformarlo in terreno arato (solo GRASS dentro l'area coltivabile)
export const TILE_PROPERTIES = {
  [TILE.GRASS]: { walkable: true, hoeable: true, textureKey: 'tile_grass' },
  [TILE.PATH]: { walkable: true, hoeable: false, textureKey: 'tile_path' },
  [TILE.WATER]: { walkable: false, hoeable: false, textureKey: 'tile_water' },
  [TILE.TREE]: { walkable: false, hoeable: false, textureKey: 'tile_tree' },
  [TILE.ROCK]: { walkable: false, hoeable: false, textureKey: 'tile_rock' },
  [TILE.HOUSE_WALL]: { walkable: false, hoeable: false, textureKey: 'tile_house_wall' },
  [TILE.HOUSE_DOOR]: { walkable: true, hoeable: false, textureKey: 'tile_house_door', isBed: true },
  [TILE.SHIPPING_BIN]: { walkable: false, hoeable: false, textureKey: 'tile_shipping_bin', isShippingBin: true },
  [TILE.FENCE]: { walkable: false, hoeable: false, textureKey: 'tile_fence' },
};

// Mappa della fattoria "Piano Lago" (FARM_COLS x FARM_ROWS caselle, vedi config.js).
// Più alta della larghezza del viewport mobile così la camera ha margine per scorrere
// verticalmente seguendo il player. 0 = erba (default).
// Costruita a mano come primo layout giocabile; sarà sostituita/estesa con un editor in seguito.
export function buildFarmMapLayout() {
  const cols = FARM_COLS;
  const rows = FARM_ROWS;
  const map = Array.from({ length: rows }, () => Array(cols).fill(TILE.GRASS));

  const setRect = (x0, y0, x1, y1, tile) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (map[y] && map[y][x] !== undefined) map[y][x] = tile;
      }
    }
  };

  // Bordo esterno: alberi e rocce a delimitare la valle.
  for (let x = 0; x < cols; x++) {
    map[0][x] = TILE.TREE;
    map[rows - 1][x] = TILE.TREE;
  }
  for (let y = 0; y < rows; y++) {
    map[y][0] = TILE.TREE;
    map[y][cols - 1] = TILE.TREE;
  }

  // Qualche roccia e albero sparsi come ostacoli interni.
  const scattered = [
    [4, 3, TILE.ROCK], [5, 3, TILE.ROCK],
    [18, 4, TILE.TREE], [19, 4, TILE.TREE], [20, 5, TILE.TREE],
    [3, 13, TILE.ROCK], [4, 14, TILE.TREE],
    [20, 13, TILE.TREE], [21, 14, TILE.ROCK],
  ];
  scattered.forEach(([x, y, t]) => { map[y][x] = t; });

  // Laghetto in basso a destra (richiamo al nome "Piano Lago").
  setRect(17, 12, 21, 15, TILE.WATER);

  // Sentiero centrale verticale + orizzontale.
  for (let y = 1; y < rows - 1; y++) map[y][12] = TILE.PATH;
  for (let x = 1; x < cols - 1; x++) map[8][x] = TILE.PATH;

  // Casa colonica in alto a sinistra.
  setRect(3, 2, 7, 5, TILE.HOUSE_WALL);
  map[5][5] = TILE.HOUSE_DOOR; // porta = anche "letto" per dormire nell'MVP

  // Recinto simbolico attorno all'orto.
  setRect(8, 9, 15, 9, TILE.FENCE);
  map[9][11] = TILE.PATH; // varco d'ingresso all'orto
  map[9][12] = TILE.PATH;

  // Cassa di spedizione vicino alla casa.
  map[6][8] = TILE.SHIPPING_BIN;

  // Prato aperto a sud, riserva di spazio per future espansioni (stalle, nuovi
  // campi...): qualche albero/roccia sparsi per non lasciarlo completamente vuoto.
  const southScattered = [
    [5, 19, TILE.TREE], [6, 20, TILE.ROCK], [15, 20, TILE.TREE],
    [16, 21, TILE.TREE], [9, 22, TILE.ROCK], [19, 19, TILE.ROCK],
  ];
  southScattered.forEach(([x, y, t]) => {
    if (map[y] && map[y][x] !== undefined) map[y][x] = t;
  });

  return map;
}

// Area rettangolare (inclusiva) del terreno coltivabile dentro il recinto.
export const FARMABLE_AREA = { x0: 8, y0: 10, x1: 15, y1: 16 };

export function isInsideFarmableArea(x, y) {
  return (
    x >= FARMABLE_AREA.x0 && x <= FARMABLE_AREA.x1 &&
    y >= FARMABLE_AREA.y0 && y <= FARMABLE_AREA.y1
  );
}
