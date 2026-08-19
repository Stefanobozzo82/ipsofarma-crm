/**
 * ui.js — HUD e schermate (menu, pausa, fine livello) disegnate su canvas.
 */
const UI = (() => {
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(ctx, x, y, w, h, alpha = 0.55) {
    ctx.fillStyle = `rgba(10, 20, 30, ${alpha})`;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
  }

  function text(ctx, str, x, y, { size = 16, color = "#fff", align = "left", weight = "bold", font = "monospace" } = {}) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText(str, x, y);
  }

  function drawHUD(ctx, data) {
    const w = CONFIG.CANVAS_WIDTH;
    panel(ctx, 10, 10, 260, 96);
    text(ctx, data.levelName, 22, 18, { size: 15, color: "#ffe9a8" });
    text(ctx, `Score: ${Math.floor(data.score)}`, 22, 40, { size: 18 });
    text(ctx, `High: ${Math.floor(data.highScore)}`, 22, 62, { size: 13, color: "#bfe9ff" });
    text(ctx, `Combo x${data.comboMultiplier.toFixed(1)}`, 22, 82, {
      size: 13,
      color: data.comboMultiplier > 1 ? "#7CFC9A" : "#cccccc",
    });

    // barra di avanzamento verso il target del livello
    const progress = Utils.clamp(data.distance / data.targetDistance, 0, 1);
    panel(ctx, w - 270, 10, 260, 40, 0.5);
    ctx.fillStyle = "#333";
    roundRect(ctx, w - 260, 26, 240, 10, 5);
    ctx.fill();
    ctx.fillStyle = "#3fd0ff";
    roundRect(ctx, w - 260, 26, 240 * progress, 10, 5);
    ctx.fill();
    text(ctx, `${Math.floor(data.distance)}m / ${data.targetDistance}m`, w - 260, 16, { size: 11, color: "#dff" });

    // velocità (barra)
    const speedPct = Utils.clamp(data.speed / CONFIG.PLAYER.RIDE_MAX_SPEED, 0, 1);
    panel(ctx, w / 2 - 110, CONFIG.CANVAS_HEIGHT - 46, 220, 34, 0.45);
    ctx.fillStyle = "#333";
    roundRect(ctx, w / 2 - 100, CONFIG.CANVAS_HEIGHT - 36, 200, 12, 6);
    ctx.fill();
    ctx.fillStyle = data.boosting ? "#ffb347" : "#57e389";
    roundRect(ctx, w / 2 - 100, CONFIG.CANVAS_HEIGHT - 36, 200 * speedPct, 12, 6);
    ctx.fill();
    text(ctx, "SPEED", w / 2, CONFIG.CANVAS_HEIGHT - 44, { size: 10, color: "#fff", align: "center" });

    if (data.trickLabel) {
      text(ctx, data.trickLabel, w / 2, 60, {
        size: 22,
        color: "#fff44f",
        align: "center",
      });
    }

    if (data.state === "wipeout") {
      text(ctx, "WIPEOUT!", w / 2, CONFIG.CANVAS_HEIGHT / 2 - 10, {
        size: 34,
        color: "#ff5d5d",
        align: "center",
      });
    }
  }

  const MENU_LAYOUT = { rowW: 400, rowH: 48, startY: 210, spacing: 60 };

  /** Hit-test per il click del mouse sulle righe del menu livelli — usa la
   * stessa geometria di drawMenu così i due non vanno mai fuori sync. */
  function hitTestMenu(x, y, count) {
    const w = CONFIG.CANVAS_WIDTH;
    const rx = w / 2 - MENU_LAYOUT.rowW / 2;
    for (let i = 0; i < count; i++) {
      const ry = MENU_LAYOUT.startY + i * MENU_LAYOUT.spacing;
      if (x >= rx && x <= rx + MENU_LAYOUT.rowW && y >= ry && y <= ry + MENU_LAYOUT.rowH) return i;
    }
    return null;
  }

  function drawMenu(ctx, levels, selectedIndex) {
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#8ecfe0");
    grad.addColorStop(1, "#0f5e73");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    text(ctx, "PIXEL SURF GIRL", w / 2, 70, { size: 42, color: "#fff", align: "center" });
    text(ctx, "un endless-surf in pixel art", w / 2, 118, { size: 14, color: "#eaffff", align: "center", weight: "normal" });

    text(ctx, "Scegli il livello (↑/↓ e INVIO, o clic):", w / 2, 168, {
      size: 14,
      color: "#fff",
      align: "center",
      weight: "normal",
    });

    levels.forEach((lvl, i) => {
      const y = MENU_LAYOUT.startY + i * MENU_LAYOUT.spacing;
      const rx = w / 2 - MENU_LAYOUT.rowW / 2;
      const active = i === selectedIndex;
      panel(ctx, rx, y, MENU_LAYOUT.rowW, MENU_LAYOUT.rowH, active ? 0.75 : 0.4);
      if (active) {
        ctx.strokeStyle = "#ffe9a8";
        ctx.lineWidth = 2;
        roundRect(ctx, rx, y, MENU_LAYOUT.rowW, MENU_LAYOUT.rowH, 10);
        ctx.stroke();
      }
      text(ctx, `${i + 1}. ${lvl.name}`, rx + 20, y + 8, { size: 18, color: "#fff" });
      const hs = Utils.Storage.getHighScore(lvl.id);
      text(ctx, `High Score: ${hs}`, rx + MENU_LAYOUT.rowW - 10, y + 14, { size: 13, color: "#ffe9a8", align: "right" });
    });

    text(
      ctx,
      "Tieni ↑ / W per accelerare · ← → per curvare · SPAZIO per saltare · combo in aria con le frecce",
      w / 2,
      h - 60,
      { size: 12, color: "#eaffff", align: "center", weight: "normal" }
    );
    text(ctx, "M per silenziare l'audio · P per pausa", w / 2, h - 40, {
      size: 12,
      color: "#eaffff",
      align: "center",
      weight: "normal",
    });
  }

  function drawPause(ctx) {
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);
    text(ctx, "PAUSA", w / 2, h / 2 - 40, { size: 36, color: "#fff", align: "center" });
    text(ctx, "P per riprendere · ESC per uscire al menu", w / 2, h / 2 + 10, {
      size: 14,
      color: "#eaffff",
      align: "center",
      weight: "normal",
    });
  }

  function drawLevelComplete(ctx, data) {
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    ctx.fillStyle = "rgba(5,20,25,0.7)";
    ctx.fillRect(0, 0, w, h);
    text(ctx, "LIVELLO COMPLETATO!", w / 2, h / 2 - 80, { size: 32, color: "#7CFC9A", align: "center" });
    text(ctx, `Punteggio: ${Math.floor(data.score)}`, w / 2, h / 2 - 30, { size: 20, color: "#fff", align: "center" });
    text(ctx, `High Score: ${Math.floor(data.highScore)}${data.isNewHighScore ? "  ★ nuovo record!" : ""}`, w / 2, h / 2, {
      size: 16,
      color: "#ffe9a8",
      align: "center",
    });
    text(ctx, "INVIO per continuare · ESC per il menu", w / 2, h / 2 + 50, {
      size: 14,
      color: "#eaffff",
      align: "center",
      weight: "normal",
    });
  }

  return { drawHUD, drawMenu, drawPause, drawLevelComplete, hitTestMenu, text, panel, roundRect };
})();
