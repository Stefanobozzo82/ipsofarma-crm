/* ============================================================================
 * lista-grandi.spec.js — app/list-cap.js: un elenco con più di 300 righe
 * disegna solo le prime 300 (con un avviso), invece di ricostruire
 * un'intera tabella enorme ad ogni tasto premuto nella ricerca — il fix di
 * prestazioni nato dall'import storico Maestro Gold (fatture cliente/ddt/
 * ordini fornitore passati da poche centinaia a migliaia di righe). Qui si
 * ricrea la stessa condizione (>300 righe) su un'azienda di prova, invece
 * di fidarsi che il taglio a 300 resti a 300 per sempre senza controllarlo.
 *
 * L'inserimento usa store.saveDoc() direttamente in pagina invece di
 * cliccare "+ Nuovo ordine" 305 volte: lo scopo qui è collaudare il
 * RENDERING dell'elenco, non rifare il test di creazione di un ordine
 * (già coperto da cascata.spec.js) — 305 submit di un form via UI
 * renderebbero questo singolo test più lento dell'intera suite.
 * ============================================================================ */
const { test, expect } = require('../helpers/testCompany');

const RENDER_CAP = 300;
const TOTALE_RIGHE = RENDER_CAP + 5;

test('un elenco con più di 300 documenti mostra solo le prime 300 righe, con avviso', async ({ company }) => {
  const { page, companyId } = company;

  await page.goto('/fornitori.html');
  await page.click('#new-fornitore');
  await page.fill('#f-nome', 'Fornitore Test SRL');
  await page.click('#f-save');

  await page.goto('/ordini-fornitore.html');
  const fornitoreId = await page.evaluate(async (companyId) => {
    const [f] = await window.SaasStore.loadCollection('fornitori', companyId);
    return f.id;
  }, companyId);

  await page.evaluate(async ({ companyId, fornitoreId, totale }) => {
    const store = window.SaasStore;
    for (let i = 0; i < totale; i++) {
      await store.saveDoc('ordiniFornitore', {
        num: 'OF/TEST/' + String(i).padStart(4, '0'),
        data: '2026-01-01',
        fornitoreId,
        righe: [{ cod: 'X', descr: 'riga ' + i, qty: 1, prezzo: 1, sconto: '', iva: 22 }],
      }, companyId);
    }
  }, { companyId, fornitoreId, totale: TOTALE_RIGHE });

  await page.reload();
  await expect(page.locator('.list-cap-notice')).toContainText(`prime ${RENDER_CAP}`);
  await expect(page.locator('tbody tr')).toHaveCount(RENDER_CAP);
});
