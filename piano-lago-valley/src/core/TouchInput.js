// Stato condiviso del D-pad virtuale (touch/mouse). UIScene lo scrive (pulsanti
// a schermo), FarmScene lo legge insieme a tastiera/frecce per muovere il player.
// Un oggetto semplice condiviso è sufficiente: niente bisogno di un event bus
// per un flag booleano per direzione.

export const TouchInput = {
  up: false,
  down: false,
  left: false,
  right: false,

  resetDirections() {
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
  },
};
