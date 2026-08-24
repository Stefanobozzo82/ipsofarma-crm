// Costanti globali di gioco. Un solo posto da cambiare quando si ritocca il bilanciamento.

export const TILE_SIZE = 32;

export const FARM_COLS = 24;
// Più alta della vecchia mappa 24x18: dà margine di scroll verticale alla camera
// quando il viewport è in formato verticale da telefono (vedi VIEWPORT_* sotto).
export const FARM_ROWS = 26;

// Dimensioni della mappa in pixel: la mappa può essere più grande di quanto
// si vede a schermo, la camera segue il player e mostra solo il viewport.
export const MAP_PIXEL_WIDTH = FARM_COLS * TILE_SIZE;
export const MAP_PIXEL_HEIGHT = FARM_ROWS * TILE_SIZE;

// Risoluzione logica del "viewport" di gioco (quello che l'utente vede e su cui
// è disegnata la UI): formato verticale 9:16, pensato per schermi da telefono.
// Phaser scala questo viewport per adattarlo a qualsiasi schermo (Scale.FIT).
export const VIEWPORT_WIDTH = 360;
export const VIEWPORT_HEIGHT = 640;

// Direzioni cardinali usate da player/NPC per movimento a griglia.
export const DIRECTIONS = {
  DOWN: 'down',
  UP: 'up',
  LEFT: 'left',
  RIGHT: 'right',
};

export const DIRECTION_VECTORS = {
  [DIRECTIONS.DOWN]: { x: 0, y: 1 },
  [DIRECTIONS.UP]: { x: 0, y: -1 },
  [DIRECTIONS.LEFT]: { x: -1, y: 0 },
  [DIRECTIONS.RIGHT]: { x: 1, y: 0 },
};

// Tempo di gioco: quanti "minuti di gioco" passano per ogni secondo reale.
export const GAME_MINUTES_PER_REAL_SECOND = 7;

// La giornata inizia alle 6:00 e finisce forzatamente alle 26:00 (= 2:00 del giorno dopo).
export const DAY_START_MINUTES = 6 * 60;
export const DAY_FORCED_END_MINUTES = 26 * 60;

// Quanto dura in millisecondi il tempo che il player impiega a muoversi di una casella.
export const PLAYER_MOVE_DURATION_MS = 150;

export const SEASONS = ['Primavera', 'Estate', 'Autunno', 'Inverno'];
export const DAYS_PER_SEASON = 28;

export const MAX_ENERGY = 100;

export const SAVE_KEY = 'pianoLagoValley_save_v1';
