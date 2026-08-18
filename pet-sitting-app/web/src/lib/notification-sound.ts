/**
 * Un breve "pling" a due note generato via Web Audio API — nessun file
 * audio da scaricare/servire (coerente con la scelta di illustrazioni
 * CSS/SVG pure invece di asset esterni, vedi web/README.md). Richiamabile
 * quante volte serve: ogni chiamata crea e chiude un proprio
 * AudioContext, non ne tiene uno aperto in background.
 */
export function playNotificationSound() {
  try {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();

    const notes = [880, 1174.66]; // A5 poi D6, un intervallo pulito e non invadente
    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.11;
      const duration = 0.14;

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = freq;

      // Attacco rapido, poi decadimento esponenziale — evita il click udibile
      // di uno stop secco e suona come un "ding" invece che un beep piatto.
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    });

    // L'AudioContext va chiuso esplicitamente, altrimenti resta vivo (e
    // Chrome comincia a lamentarsi se se ne accumulano troppi non chiusi).
    setTimeout(() => ctx.close().catch(() => {}), (notes.length * 0.11 + 0.2) * 1000);
  } catch {
    // Nessun Web Audio disponibile (raro) — silenzioso, il badge resta
    // comunque il segnale principale.
  }
}
