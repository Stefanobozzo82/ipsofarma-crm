/**
 * tricks.js — trick system.
 *
 * Mentre la giocatrice è in aria, il player registra le pressioni dei tasti
 * direzionali in un buffer. All'atterraggio, TrickSystem.resolve() confronta
 * la coda del buffer con CONFIG.TRICKS (tabella dati separata, facile da
 * espandere: basta aggiungere una riga in config.js).
 */
const TrickSystem = (() => {
  function endsWith(inputSeq, sequence) {
    if (sequence.length > inputSeq.length) return false;
    const offset = inputSeq.length - sequence.length;
    for (let i = 0; i < sequence.length; i++) {
      if (inputSeq[offset + i] !== sequence[i]) return false;
    }
    return true;
  }

  /** Ritorna la definizione del trick migliore (più tasti = priorità, poi
   * punteggio più alto) che combacia con la fine del buffer di input, oppure
   * null se nessun trick riconosciuto o se l'air time è troppo corto. */
  function resolve(inputSeq, airTimeMs) {
    if (!inputSeq || inputSeq.length === 0) return null;
    if (airTimeMs < CONFIG.TRICK_MIN_AIR_TIME_MS) return null;

    let best = null;
    for (const trick of CONFIG.TRICKS) {
      if (!endsWith(inputSeq, trick.sequence)) continue;
      if (
        !best ||
        trick.sequence.length > best.sequence.length ||
        (trick.sequence.length === best.sequence.length && trick.points > best.points)
      ) {
        best = trick;
      }
    }
    return best;
  }

  return { resolve };
})();
