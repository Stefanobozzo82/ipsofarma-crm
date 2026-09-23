/* ============================================================================
 * docHelpers.js — interazioni ricorrenti sui form documento (ordini, DDT,
 * fatture...): riempire una riga scegliendo un prodotto dal catalogo,
 * gestire il dialog nativo confirm()/alert() dei pulsanti "Elimina".
 * ============================================================================ */

// Riempie la riga N (0-based, default la prima) scegliendo `cod` dal
// suggerimento del catalogo — non basta scrivere il codice e basta: senza
// scegliere il suggerimento (come farebbe una persona vera cliccandoci o
// premendo Invio) l'autocompletamento di descr/prezzo/iva non scatta,
// vedi app/prodpicker.js onPick(). Trovato per davvero durante il primo
// collaudo manuale di questa suite: scrivere il codice esatto e basta
// lasciava prezzo/iva ai valori di default (0), un falso negativo che
// sembrava un bug del prodotto invece che dello script di test.
async function pickProdottoInRiga(page, cod, { rigaIndex = 0, qty } = {}) {
  const riga = page.locator('#righe-body tr').nth(rigaIndex);
  await riga.locator('.r-cod').fill(cod);
  await page.waitForSelector('.sugg-item', { timeout: 5_000 });
  await page.locator('.sugg-item').first().click();
  if (qty != null) await riga.locator('.r-qty').fill(String(qty));
  return riga;
}

// I pulsanti "Elimina" nel gestionale usano window.confirm() — Playwright
// lo intercetta e lo respinge di default (nessun dialog nativo mostrato),
// quindi senza questo handler ogni test di eliminazione fallirebbe non per
// un problema del prodotto ma perché nessuno ha mai accettato il confirm.
function acceptConfirms(page) {
  page.on('dialog', d => d.accept());
}

// Come acceptConfirms(), ma registra anche il testo di ogni alert() (es.
// l'errore "Non hai i permessi..." di removeDoc() — vedi app/store.js):
// un alert nativo non lascia traccia nel DOM, va intercettato qui per
// poterlo verificare in un'asserzione. Ritorna l'array che si riempie via
// via (stesso riferimento, letto quando serve dal test).
function captureDialogs(page) {
  const messages = [];
  page.on('dialog', d => { messages.push(d.message()); d.accept(); });
  return messages;
}

module.exports = { pickProdottoInRiga, acceptConfirms, captureDialogs };
