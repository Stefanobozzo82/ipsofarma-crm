const { test, expect } = require('../helpers/testCompany');

test.describe('Anagrafiche (clienti, fornitori, prodotti)', () => {
  test('crea, modifica ed elimina un fornitore', async ({ company }) => {
    const { page } = company;
    await page.goto('/fornitori.html');
    await page.click('#new-fornitore');
    await page.fill('#f-nome', 'Fornitore Test SRL');
    await page.fill('#f-piva', '12345678901');
    await page.click('#f-save');
    await expect(page.locator('tbody tr', { hasText: 'Fornitore Test SRL' })).toBeVisible();

    await page.locator('tbody tr', { hasText: 'Fornitore Test SRL' }).click();
    await page.fill('#f-nome', 'Fornitore Test SRL Modificato');
    await page.click('#f-save');
    await expect(page.locator('tbody tr', { hasText: 'Fornitore Test SRL Modificato' })).toBeVisible();

    page.once('dialog', d => d.accept());
    await page.locator('tbody tr', { hasText: 'Fornitore Test SRL Modificato' }).click();
    await page.click('button:has-text("Elimina")');
    await expect(page.locator('text=Nessun fornitore ancora')).toBeVisible();
  });

  test('crea un cliente e un prodotto con fornitore abituale', async ({ company }) => {
    const { page } = company;
    await page.goto('/fornitori.html');
    await page.click('#new-fornitore');
    await page.fill('#f-nome', 'Fornitore Abituale SRL');
    await page.click('#f-save');

    await page.goto('/clienti.html');
    await page.click('#new-cliente');
    await page.fill('#f-nome', 'Cliente Test SRL');
    await page.fill('#f-piva', '98765432109');
    await page.click('#f-save');
    await expect(page.locator('tbody tr', { hasText: 'Cliente Test SRL' })).toBeVisible();

    await page.goto('/prodotti.html');
    await page.click('#new-prodotto');
    await page.fill('#f-cod', 'TESTCOD001');
    await page.fill('#f-descr', 'Prodotto di test QA');
    await page.fill('#f-acq', '10');
    await page.fill('#f-ven', '20');
    await page.selectOption('#f-fornitore', { label: 'Fornitore Abituale SRL' });
    await page.click('#f-save');

    const row = page.locator('tbody tr', { hasText: 'TESTCOD001' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Fornitore Abituale SRL');
    await expect(row).toContainText('20,00'); // prezzo di vendita in elenco
  });
});
