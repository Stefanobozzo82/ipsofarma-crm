/**
 * input.js — tastiera + mouse. Espone stati "held" per i controlli continui
 * (accelerare, carving) e metodi "consume*" edge-triggered (una pressione =
 * un evento) per azioni discrete (salto, conferma, pausa, trick combo...).
 */
class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = { left: false, right: false, accelerate: false };
    this._edges = { jump: false, confirm: false, pause: false, escape: false, up: false, down: false, mute: false };
    this._dirQueue = [];
    this._pendingClick = null;

    window.addEventListener("keydown", (e) => this._onKeyDown(e));
    window.addEventListener("keyup", (e) => this._onKeyUp(e));
    canvas.addEventListener("click", (e) => this._onClick(e));
  }

  _onKeyDown(e) {
    const scrollKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];
    if (scrollKeys.includes(e.code)) e.preventDefault();

    switch (e.code) {
      case "ArrowUp":
      case "KeyW":
        this.held.accelerate = true;
        if (!e.repeat) this._edges.up = true;
        break;
      case "ArrowLeft":
      case "KeyA":
        this.held.left = true;
        if (!e.repeat) this._dirQueue.push("Left");
        break;
      case "ArrowRight":
      case "KeyD":
        this.held.right = true;
        if (!e.repeat) this._dirQueue.push("Right");
        break;
      case "ArrowDown":
      case "KeyS":
        if (!e.repeat) {
          this._edges.down = true;
          this._dirQueue.push("Down");
        }
        break;
      case "Space":
        if (!e.repeat) this._edges.jump = true;
        break;
      case "Enter":
        if (!e.repeat) this._edges.confirm = true;
        break;
      case "KeyP":
        if (!e.repeat) this._edges.pause = true;
        break;
      case "Escape":
        if (!e.repeat) this._edges.escape = true;
        break;
      case "KeyM":
        if (!e.repeat) this._edges.mute = true;
        break;
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case "ArrowUp":
      case "KeyW":
        this.held.accelerate = false;
        break;
      case "ArrowLeft":
      case "KeyA":
        this.held.left = false;
        break;
      case "ArrowRight":
      case "KeyD":
        this.held.right = false;
        break;
    }
  }

  _onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this._pendingClick = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  get accelerate() {
    return this.held.accelerate;
  }
  get left() {
    return this.held.left;
  }
  get right() {
    return this.held.right;
  }

  consumeJumpPress() {
    const v = this._edges.jump;
    this._edges.jump = false;
    return v;
  }
  consumeConfirmPress() {
    const v = this._edges.confirm;
    this._edges.confirm = false;
    return v;
  }
  consumePausePress() {
    const v = this._edges.pause;
    this._edges.pause = false;
    return v;
  }
  consumeEscapePress() {
    const v = this._edges.escape;
    this._edges.escape = false;
    return v;
  }
  consumeUpPress() {
    const v = this._edges.up;
    this._edges.up = false;
    return v;
  }
  consumeDownPress() {
    const v = this._edges.down;
    this._edges.down = false;
    return v;
  }
  consumeMuteToggle() {
    const v = this._edges.mute;
    this._edges.mute = false;
    return v;
  }
  consumeDirectionalPress() {
    return this._dirQueue.length ? this._dirQueue.shift() : null;
  }
  drainDirectionalQueue() {
    this._dirQueue.length = 0;
  }
  /** Ritorna l'indice del livello cliccato nel menu (usa la geometria di UI), o null. */
  consumeMenuClick(levelCount) {
    if (!this._pendingClick) return null;
    const { x, y } = this._pendingClick;
    this._pendingClick = null;
    return UI.hitTestMenu(x, y, levelCount);
  }

  /** Da chiamare una volta per frame, a fine loop. Le pressioni "edge" (salto,
   * conferma, pausa, esc, su/giù) valgono solo per il frame in cui sono
   * avvenute: se nessuno stato le consuma restano scartate invece di
   * rimanere in coda e scattare a sorpresa in uno stato successivo (es. un
   * INVIO premuto durante il gioco che auto-conferma la schermata di fine
   * livello minuti dopo). Il buffer direzionale dei trick NON viene toccato
   * qui: deve sopravvivere per l'intera finestra temporale del trick. */
  endFrame() {
    this._edges.jump = false;
    this._edges.confirm = false;
    this._edges.pause = false;
    this._edges.escape = false;
    this._edges.up = false;
    this._edges.down = false;
  }
}
