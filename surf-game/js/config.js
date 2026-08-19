/**
 * config.js
 * -----------------------------------------------------------------------
 * Tutte le costanti "tunabili" del gioco vivono qui: nessun valore di
 * gameplay è hardcoded dentro la logica (player.js, wave.js, ecc.).
 * Modificare i numeri qui sotto cambia il comportamento del gioco senza
 * toccare il codice.
 * -----------------------------------------------------------------------
 */
const CONFIG = Object.freeze({
  CANVAS_WIDTH: 960,
  CANVAS_HEIGHT: 540,

  // Il delta time reale viene "clampato" a questo massimo per evitare la
  // "spiral of death" quando il tab perde il focus o il frame è lentissimo.
  MAX_DELTA_TIME: 1 / 15,

  GRAVITY: 1500, // px/s^2, usato in stato "aerial"

  // Posizione orizzontale fissa (schermo) della tavola/giocatrice.
  // Il mondo scorre sotto di lei (classico endless runner).
  PLAYER_SCREEN_X: 260,

  PLAYER: {
    // --- Paddling (avvicinamento all'onda) ---
    PADDLE_MAX_SPEED: 170,
    PADDLE_ACCEL_TIME: 1.0, // secondi per raggiungere la velocità massima
    CATCH_WAVE_SPEED: 140, // velocità minima per "prendere" l'onda

    // --- Riding: curva di accelerazione NON lineare su hold ---
    RIDE_BASE_SPEED: 210,
    RIDE_MAX_SPEED: 560,
    RIDE_ACCEL_TIME: 1.4, // secondi di hold per andare da BASE a MAX
    RIDE_ACCEL_CURVE_POWER: 2.2, // >1 = ease-in (accelerazione crescente)
    RIDE_DECEL_PER_SEC: 220, // perdita di velocità/sec quando non si accelera
    RIDE_MIN_SPEED: 90,

    // --- Carving sinistra/destra ---
    CARVE_TURN_RATE: 3.4, // rad/s, velocità di rotazione dell'angolo di lean
    CARVE_MAX_ANGLE: 0.95, // rad (~54°) massima inclinazione
    CARVE_RETURN_RATE: 2.2, // rad/s, quanto velocemente l'angolo torna a 0
    CARVE_TIGHT_ANGLE_DEG: 32, // soglia minima per considerare la curva "stretta"
    CARVE_BOOST_SPEED: 110, // px/s aggiunti quando si esegue una carve stretta
    CARVE_BOOST_DURATION: 0.6, // secondi di durata del boost
    CARVE_REVERSAL_WINDOW: 0.55, // secondi entro cui un'inversione conta come carve
    CARVE_LATERAL_RANGE: 46, // px, escursione laterale a schermo per angolo massimo (utile per schivare)

    // --- Salto / Aerial ---
    JUMP_VELOCITY: 640, // px/s verticale iniziale
    JUMP_MIN_SPEED: 200, // velocità minima di riding per poter saltare
    AIR_HORIZONTAL_DRIFT: 40, // px/s, drift orizzontale extra controllabile in aria

    // --- Wipeout ---
    WIPEOUT_FREEZE_MS: 450, // freeze frame all'impatto
    WIPEOUT_TUMBLE_MS: 1100, // durata animazione di caduta
    WIPEOUT_RECOVERY_SPEED: 60, // velocità con cui si riparte dopo il wipeout
    LANDING_SAFE_VY: 780, // velocità verticale massima per un atterraggio "in sync"
    LANDING_SAFE_SLOPE_DIFF: 0.85, // rad, scarto massimo tra angolo player e onda

    // --- Combo ---
    COMBO_MULTIPLIER_STEP: 0.5,
    COMBO_MULTIPLIER_MAX: 5,

    HITBOX_RADIUS: 16,
  },

  // Parametri dell'onda PROCEDURALE per livello: altezza, velocità, curvatura.
  // wave.js non conosce questi numeri: legge solo l'oggetto livello corrente.
  WAVE: {
    SAMPLE_STEP: 10, // distanza in px fra due campioni della curva dell'onda
    LEVELS: [
      {
        id: 1,
        name: "Baia Calma",
        height: 55, // ampiezza onda in px
        speed: 210, // velocità di scorrimento base (px/s)
        curvature: 0.85, // frequenza delle creste (rad per 100px)
        seed: 1337,
        obstacleDensity: 0.55,
        targetDistance: 3200,
      },
      {
        id: 2,
        name: "Onda Media",
        height: 85,
        speed: 270,
        curvature: 1.25,
        seed: 4242,
        obstacleDensity: 0.8,
        targetDistance: 4400,
      },
      {
        id: 3,
        name: "Big Wave",
        height: 125,
        speed: 330,
        curvature: 1.7,
        seed: 9001,
        obstacleDensity: 1.05,
        targetDistance: 5600,
      },
    ],
  },

  OBSTACLES: {
    SPAWN_INTERVAL_BASE: 1.7, // secondi medi fra due ostacoli a densità 1.0
    SPAWN_INTERVAL_JITTER: 0.6,
    MIN_WORLD_GAP: 260, // px minimi fra due ostacoli
    ROCK_HALF_W: 20,
    ROCK_HALF_H: 22,
    BUOY_RADIUS: 16,
  },

  // Finestra temporale (ms) per inserire una combo di tasti mentre si è in aria.
  TRICK_WINDOW_MS: 900,
  TRICK_MIN_AIR_TIME_MS: 150, // sotto questa soglia non si contano i trick

  // Tabella dati dei trick: facile da espandere aggiungendo una riga.
  // `sequence` è la sequenza di input (in ordine) da premere in aria.
  TRICKS: [
    { id: "shove_it", name: "Shove-It", sequence: ["Left", "Right"], points: 150 },
    { id: "shove_it_r", name: "Shove-It", sequence: ["Right", "Left"], points: 150 },
    { id: "air_360", name: "360 Air", sequence: ["Right", "Right"], points: 300 },
    { id: "air_360_l", name: "360 Air", sequence: ["Left", "Left"], points: 300 },
    { id: "superman", name: "Superman Grab", sequence: ["Down", "Up", "Up"], points: 450 },
    { id: "method", name: "Method Grab", sequence: ["Up", "Down"], points: 250 },
    { id: "rodeo", name: "Rodeo Flip", sequence: ["Up", "Right", "Down"], points: 500 },
    { id: "rodeo_l", name: "Rodeo Flip", sequence: ["Up", "Left", "Down"], points: 500 },
    { id: "alley_oop", name: "Alley-Oop", sequence: ["Left", "Up", "Right"], points: 400 },
    { id: "alley_oop_r", name: "Alley-Oop", sequence: ["Right", "Up", "Left"], points: 400 },
  ],

  SCORING: {
    DISTANCE_POINTS_PER_100PX: 10,
    CLEAN_LANDING_BONUS: 50,
    CARVE_BOOST_BONUS: 25,
    WIPEOUT_PENALTY: 0,
  },

  STORAGE_PREFIX: "pixelSurfGirl_highscore_level_",

  PIXEL_SCALE: 4,

  COLORS: {
    skyTop: "#8ecfe0",
    skyBottom: "#d9f3ee",
    deepWater: "#0f5e73",
    midWater: "#1687a0",
    waveFace: "#2fb0c9",
    foam: "#f2fbfb",
    sand: "#e8c98a",
  },
});
