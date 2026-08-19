/**
 * main.js — bootstrap: canvas, input, audio, game loop con delta time.
 */
(function () {
  const canvas = document.getElementById("game-canvas");
  canvas.width = CONFIG.CANVAS_WIDTH;
  canvas.height = CONFIG.CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const input = new InputManager(canvas);
  const audio = new AudioManager();
  const game = new Game(ctx, input, audio);
  window.__game = game; // hook utile per debug/test manuale dalla console

  let muted = false;
  function unlockAudio() {
    audio.ensureContext();
    window.removeEventListener("keydown", unlockAudio);
    window.removeEventListener("click", unlockAudio);
  }
  window.addEventListener("keydown", unlockAudio, { once: false });
  window.addEventListener("click", unlockAudio, { once: false });

  // --- Game loop con delta time (non affidato al frame count) ---
  let lastTime = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let fpsDisplay = 0;

  function loop(timestamp) {
    requestAnimationFrame(loop);

    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    dt = Math.min(dt, CONFIG.MAX_DELTA_TIME);

    if (input.consumeMuteToggle()) {
      muted = !muted;
      audio.setMuted(muted);
    }

    game.update(dt);
    game.render(ctx);
    input.endFrame();

    // contatore FPS leggero, solo per debug visivo opzionale
    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum >= 0.5) {
      fpsDisplay = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
    }
    if (window.__SHOW_FPS__) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(CONFIG.CANVAS_WIDTH - 60, CONFIG.CANVAS_HEIGHT - 20, 60, 20);
      ctx.fillStyle = "#0f0";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${fpsDisplay} fps`, CONFIG.CANVAS_WIDTH - 55, CONFIG.CANVAS_HEIGHT - 5);
    }
  }

  requestAnimationFrame(loop);
})();
