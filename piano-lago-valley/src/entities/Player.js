// Player a movimento tile-based: WASD/frecce, una casella alla volta, con un piccolo
// tween per l'animazione dello spostamento. La direzione in cui è rivolta determina
// la "tile bersaglio" per zappare/annaffiare/piantare/raccogliere.

import { TILE_SIZE, DIRECTIONS, DIRECTION_VECTORS, PLAYER_MOVE_DURATION_MS } from '../config.js';

export class Player {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} state - state.player del GameState (tileX, tileY, facing)
   * @param {(tx:number, ty:number)=>boolean} canMoveTo - true se la tile è calpestabile
   */
  constructor(scene, state, canMoveTo) {
    this.scene = scene;
    this.state = state;
    this.canMoveTo = canMoveTo;
    this.isMoving = false;

    const px = state.tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = state.tileY * TILE_SIZE + TILE_SIZE / 2;

    this.sprite = scene.add.sprite(px, py, this.textureForFacing(state.facing));
    this.sprite.setDepth(10);
  }

  textureForFacing(facing) {
    return `player_${facing}`;
  }

  getTargetTile() {
    const vec = DIRECTION_VECTORS[this.state.facing];
    return { x: this.state.tileX + vec.x, y: this.state.tileY + vec.y };
  }

  // Legge WASD/frecce e prova a muoversi. Va chiamato ad ogni update() della scena.
  handleInput(cursors, wasd) {
    if (this.isMoving) return;

    let dir = null;
    if (cursors.left.isDown || wasd.left.isDown) dir = DIRECTIONS.LEFT;
    else if (cursors.right.isDown || wasd.right.isDown) dir = DIRECTIONS.RIGHT;
    else if (cursors.up.isDown || wasd.up.isDown) dir = DIRECTIONS.UP;
    else if (cursors.down.isDown || wasd.down.isDown) dir = DIRECTIONS.DOWN;

    if (!dir) return;

    if (dir !== this.state.facing) {
      this.state.facing = dir;
      this.sprite.setTexture(this.textureForFacing(dir));
    }

    const vec = DIRECTION_VECTORS[dir];
    const targetX = this.state.tileX + vec.x;
    const targetY = this.state.tileY + vec.y;

    if (this.canMoveTo(targetX, targetY)) {
      this.moveTo(targetX, targetY);
    }
  }

  moveTo(tx, ty) {
    this.isMoving = true;
    this.state.tileX = tx;
    this.state.tileY = ty;

    this.scene.tweens.add({
      targets: this.sprite,
      x: tx * TILE_SIZE + TILE_SIZE / 2,
      y: ty * TILE_SIZE + TILE_SIZE / 2,
      duration: PLAYER_MOVE_DURATION_MS,
      ease: 'Linear',
      onComplete: () => {
        this.isMoving = false;
      },
    });
  }
}
