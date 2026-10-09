/* ============================================================================
 * split-payment.spec.js — fatture in split payment (scissione dei pagamenti,
 * extra.split = true): nell'elenco il "Totale" e il "Totale fatturato" sono
 * l'imponibile (l'IVA la versa l'ente), aprendo la fattura la casella
 * "Split payment" è spuntata e gli incassi si misurano sull'imponibile.
 *
 * Come esporta-selezionati.spec.js le fatture NON vengono scritte nel
 * database: le risposte di PostgREST per l'elenco sono righe finte.
 * ============================================================================ */
const { test, expect } = require('../helpers/testCompany');
const { gotoList } = require('../helpers/docHelpers');

const anno = new Date().getFullYear();
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fakeRoute = (rows) => route => {
  if (route.request().method() !== 'GET') return route.continue();
  const body = /[?&]id=gt\./.test(route.request().url()) ? [] : rows;
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
};

test('fattura in split payment: totale da incassare = imponibile', async ({ company }) => {
  const { page, companyId } = company;
  const clienti = [{ id: uuid(700), company_id: companyId, nome: 'Azienda Sanitaria Prova', split: 'si', dest: [] }];
  const riga = { cod: 'X', descr: 'riga', qty: 1, prezzo: 1000, sconto: '', iva: 22 };
  const fatture = [
    { id: uuid(71), company_id: companyId, num: `FT/${anno}/7001`, data: `${anno}-03-01`, cliente_id: uuid(700),
      righe: [riga], paid: false, pagamenti: [], extra: { split: true } },
    { id: uuid(72), company_id: companyId, num: `FT/${anno}/7002`, data: `${anno}-03-02`, cliente_id: uuid(700),
      righe: [riga], paid: false, pagamenti: [], extra: {} },
  ];
  await page.route('**/rest/v1/clienti?*', fakeRoute(clienti));
  await page.route('**/rest/v1/fatture_cliente?*', fakeRoute(fatture));

  await gotoList(page, '/fatture.html');
  const righe = page.locator('#list-area tbody tr');
  await expect(righe).toHaveCount(2);
  // 1.000 di imponibile + 1.220 (fattura normale) = 2.220.
  await expect(page.locator('#stats-riga')).toContainText(/2\.?220,00/);
  const split = page.locator(`tr[data-id="${uuid(71)}"]`);
  await expect(split).toContainText('split payment');
  await expect(split.locator('td').nth(6)).toContainText(/1\.?000,00/);
  await expect(page.locator(`tr[data-id="${uuid(72)}"] td`).nth(6)).toContainText(/1\.?220,00/);

  await split.locator('td').nth(1).click();
  await expect(page.locator('#f-split')).toBeChecked();
  await expect(page.locator('#righe-totale')).toContainText('in split payment');
  await expect(page.locator('#f-pagamenti')).toContainText(/1\.?000,00/);
  await expect(page.locator('#f-pagamenti')).not.toContainText(/1\.?220,00/);

  await page.unroute('**/rest/v1/clienti?*');
  await page.unroute('**/rest/v1/fatture_cliente?*');
});
