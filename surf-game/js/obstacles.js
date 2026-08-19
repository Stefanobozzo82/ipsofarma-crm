/**
 * obstacles.js — spawner e gestione ostacoli.
 *
 * Gli ostacoli sono generati proceduralmente (RNG seedato sul livello) man
 * mano che il mondo scorre. Due tipi con due forme di collisione diverse,
 * come richiesto: roccia -> AABB, boa -> cerchio-cerchio.
 */
class ObstacleManager {
  constructor(level) {
    this.level = level;
    this.rng = Utils.makeRng((level.seed || 1) + 777);
    this.obstacles = [];
    this.nextSpawnWorldX = 900; // primo ostacolo un po' più avanti della partenza
    this.lastWorldX = 0;
  }

  reset(level) {
    this.level = level;
    this.rng = Utils.makeRng((level.seed || 1) + 777);
    this.obstacles = [];
    this.nextSpawnWorldX = 900;
  }

  _scheduleNextSpawn(fromWorldX) {
    const O = CONFIG.OBSTACLES;
    const density = Math.max(0.1, this.level.obstacleDensity || 1);
    const base = O.SPAWN_INTERVAL_BASE / density;
    const jitter = (this.rng() * 2 - 1) * O.SPAWN_INTERVAL_JITTER;
    const seconds = Math.max(0.4, base + jitter);
    const worldGap = Math.max(O.MIN_WORLD_GAP, seconds * this.level.speed);
    this.nextSpawnWorldX = fromWorldX + worldGap;
  }

  _spawnOne(worldX) {
    const O = CONFIG.OBSTACLES;
    const isRock = this.rng() < 0.55;
    const lateralRange = CONFIG.PLAYER.CARVE_LATERAL_RANGE * 1.5;
    const lateralOffset = (this.rng() * 2 - 1) * lateralRange;
    this.obstacles.push({
      type: isRock ? "rock" : "buoy",
      worldX,
      lateralOffset,
      halfW: O.ROCK_HALF_W,
      halfH: O.ROCK_HALF_H,
      radius: O.BUOY_RADIUS,
      passed: false,
    });
  }

  /** worldOffset = distanza totale percorsa (px). */
  update(dt, worldOffset) {
    const aheadLimit = worldOffset + CONFIG.CANVAS_WIDTH + 200;
    while (this.nextSpawnWorldX < aheadLimit) {
      this._spawnOne(this.nextSpawnWorldX);
      this._scheduleNextSpawn(this.nextSpawnWorldX);
    }
    // rimuovi ostacoli ormai fuori schermo a sinistra
    const behindLimit = worldOffset - 150;
    this.obstacles = this.obstacles.filter((o) => o.worldX > behindLimit);
  }

  /** Ritorna l'ostacolo con cui la giocatrice è in collisione, o null. */
  checkCollision(player, worldOffset, wave) {
    const P = CONFIG.PLAYER;
    const px = player.position.x;
    const py = player.position.y;
    for (const o of this.obstacles) {
      const screenX = o.worldX - worldOffset + o.lateralOffset;
      if (screenX < -60 || screenX > CONFIG.CANVAS_WIDTH + 60) continue;
      const screenY = wave.surfaceScreenY(screenX - o.lateralOffset) - (o.type === "rock" ? 14 : 6);

      let hit = false;
      if (o.type === "rock") {
        hit = Utils.circleIntersectsAABB(px, py, P.HITBOX_RADIUS, screenX, screenY, o.halfW, o.halfH);
      } else {
        hit = Utils.circleIntersectsCircle(px, py, P.HITBOX_RADIUS, screenX, screenY, o.radius);
      }
      if (hit) return o;
    }
    return null;
  }

  render(ctx, worldOffset, wave) {
    for (const o of this.obstacles) {
      const screenX = o.worldX - worldOffset + o.lateralOffset;
      if (screenX < -60 || screenX > CONFIG.CANVAS_WIDTH + 60) continue;
      const screenY = wave.surfaceScreenY(screenX - o.lateralOffset) - (o.type === "rock" ? 14 : 6);
      const sprite = o.type === "rock" ? Sprites.ROCK : Sprites.BUOY;
      Sprites.drawFrame(ctx, sprite, screenX, screenY, CONFIG.PIXEL_SCALE * 0.9);
    }
  }
}
