/* ============================================================================
 * cascata.spec.js — la catena intera ordine cliente → ordine fornitore →
 * DDT → fattura, con gli importi verificati ad ogni passo. È lo scenario
 * più prezioso della suite: la prima volta che l'ho eseguito a mano (senza
 * automatizzarlo) ha fatto scoprire un bug reale rimasto invisibile per
 * mesi — checkDocLimit() poteva bloccare "Salva" per sempre senza nessun
 * errore (vedi la correzione in app/store.js, commit "checkDocLimit/
 * checkAiLimit potevano bloccare il Salva per sempre"). Questo test lo
 * ripete ogni volta, apposta perché non debba mai più servire scoprirlo a
 * mano.
 * ============================================================================ */
const { test, expect } = require('../helpers/testCompany');
const { pickProdottoInRiga, acceptConfirms, saveAndSeeRow, gotoList } = require('../helpers/docHelpers');

test('ordine cliente → ordine fornitore → DDT → fattura, con gli importi giusti ad ogni passo', async ({ company }) => {
  const { page } = company;
  acceptConfirms(page);

  await gotoList(page, '/fornitori.html');
  await page.click('#new-fornitore');
  await page.fill('#f-nome', 'Fornitore Test SRL');
  await saveAndSeeRow(page, 'Fornitore Test SRL');

  await gotoList(page, '/clienti.html');
  await page.click('#new-cliente');
  await page.fill('#f-nome', 'Cliente Test SRL');
  await saveAndSeeRow(page, 'Cliente Test SRL');

  await gotoList(page, '/prodotti.html');
  await page.click('#new-prodotto');
  await page.fill('#f-cod', 'TESTCOD001');
  await page.fill('#f-descr', 'Prodotto di test QA');
  await page.fill('#f-acq', '10');
  await page.fill('#f-ven', '20');
  await page.selectOption('#f-fornitore', { label: 'Fornitore Test SRL' });
  await saveAndSeeRow(page, 'TESTCOD001');

  // --- ordine cliente: 5 x 20€ + 22% IVA = 122,00 € ---
  await gotoList(page, '/ordini.html');
  await page.click('#new-ordine');
  await page.selectOption('#f-cliente', { label: 'Cliente Test SRL' });
  await pickProdottoInRiga(page, 'TESTCOD', { qty: 5 });
  await page.click('#f-save');
  const ocRow = page.locator('tbody tr', { hasText: 'Cliente Test SRL' });
  await expect(ocRow).toContainText('122,00');

  // --- cascata → ordine fornitore: 5 x 10€ (listino acquisto) + 22% = 61,00 € ---
  await ocRow.locator('.row-check').check();
  await page.click('[data-gen-of]');
  await page.waitForURL('**/ordini-fornitore.html');
  await expect(page.locator('tbody tr', { hasText: 'Fornitore Test SRL' })).toContainText('61,00');

  // --- cascata → DDT: precompilato dall'ordine, si salva com'è ---
  await gotoList(page, '/ordini.html');
  await page.locator('tbody tr', { hasText: 'Cliente Test SRL' }).locator('.row-check').check();
  await page.click('[data-gen-ddt]');
  await page.waitForURL('**/ddt.html');
  await expect(page.locator('#righe-body .r-qty')).toHaveValue('5');
  await expect(page.locator('#righe-body .r-prezzo')).toHaveValue('20');
  await page.click('#f-save');
  // Un DDT nuovo generato da un ordine resta aperto dopo il salvataggio
  // (vedi il commento in ddt.html su "→ Genera fattura" — apposta, per
  // poterlo premere subito) invece di tornare all'elenco.
  await expect(page.locator('#ddt-btn-ft')).toBeVisible({ timeout: 30_000 });

  // --- cascata → fattura: stessi importi del DDT, poi segnata incassata ---
  await page.click('#ddt-btn-ft');
  await page.waitForURL('**/fatture.html');
  await expect(page.locator('#righe-body .r-prezzo')).toHaveValue('20');
  await page.click('#f-save');
  await page.waitForSelector('#form-card[hidden]', { state: 'attached', timeout: 30_000 });

  const ftRow = page.locator('tbody tr', { hasText: 'Cliente Test SRL' });
  await expect(ftRow).toContainText('122,00');
  await ftRow.locator('button[data-toggle]').click();
  await expect(ftRow.locator('button[data-toggle]')).toContainText('incassata');

  // --- la dashboard riflette la stessa cifra, non solo l'elenco fatture ---
  await page.goto('/dashboard.html');
  await expect(page.locator('.stat', { hasText: 'Totale fatturato' })).toContainText('122');
  await expect(page.locator('.stat', { hasText: 'Da incassare dai clienti' })).toContainText('€ 0');
  await expect(page.locator('.stat', { hasText: 'Da ricevere dai fornitori' })).toContainText('61');
});
