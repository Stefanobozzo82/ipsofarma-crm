const { test, expect } = require('../helpers/testCompany');
const { pickProdottoInRiga } = require('../helpers/docHelpers');

// Prepara cliente+prodotto+fattura incassata: la base comune per i tre
// test sotto (totali, link con l'anno, legenda del grafico).
async function creaFatturaDiProva(page) {
  await page.goto('/clienti.html');
  await page.click('#new-cliente');
  await page.fill('#f-nome', 'Cliente Test SRL');
  await page.click('#f-save');

  await page.goto('/prodotti.html');
  await page.click('#new-prodotto');
  await page.fill('#f-cod', 'TESTCOD001');
  await page.fill('#f-descr', 'Prodotto di test QA');
  await page.fill('#f-ven', '20');
  await page.click('#f-save');

  await page.goto('/fatture.html');
  await page.click('#new-fattura');
  await page.selectOption('#f-cliente', { label: 'Cliente Test SRL' });
  await pickProdottoInRiga(page, 'TESTCOD', { qty: 5 });
  await page.click('#f-save');
  await page.waitForSelector('#form-card[hidden]', { timeout: 10_000 });
}

test('i totali della dashboard riflettono le fatture reali', async ({ company }) => {
  const { page } = company;
  await creaFatturaDiProva(page);

  await page.goto('/dashboard.html');
  await expect(page.locator('.stat', { hasText: 'Totale fatturato' })).toContainText('122');
  await expect(page.locator('.stat', { hasText: 'Da incassare dai clienti' })).toContainText('122');
});

test('il pulsante "Totale fatturato" apre le fatture filtrate sull\'anno selezionato', async ({ company }) => {
  const { page } = company;
  await creaFatturaDiProva(page);

  const anno = String(new Date().getFullYear());
  await page.goto('/dashboard.html');
  await page.click(`.dash-period a[data-y="${anno}"]`);
  await page.click('a.stat >> text=Totale fatturato');
  await expect(page).toHaveURL(new RegExp(`fatture\\.html\\?anno=${anno}`));
  await expect(page.locator('#ff-from')).toHaveValue(`${anno}-01-01`);
  await expect(page.locator('#ff-to')).toHaveValue(`${anno}-12-31`);
});

test('la legenda del grafico nasconde/mostra le serie', async ({ company }) => {
  const { page } = company;
  await creaFatturaDiProva(page);

  await page.goto('/dashboard.html');
  const acquisti = page.locator('button.lg[data-series="acq"]');
  await expect(acquisti).toHaveClass(/on/);
  await acquisti.click();
  await expect(acquisti).not.toHaveClass(/on/);
  await acquisti.click();
  await expect(acquisti).toHaveClass(/on/);
});
