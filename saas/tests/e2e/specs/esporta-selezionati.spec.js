/* ============================================================================
 * esporta-selezionati.spec.js — app/bulk-export.js: spuntati più documenti
 * in un elenco, "⬇ Esporta" scarica un riepilogo Excel, uno ZIP con un PDF
 * per documento e (fatture clienti) uno ZIP di XML FatturaPA, saltando le
 * fatture a cui mancano dati obbligatori.
 *
 * Come lista-grandi.spec.js, i documenti NON vengono scritti nel database
 * (limite di documenti del piano di prova): le risposte di PostgREST per
 * l'elenco sono sostituite con righe finte, il resto della pagina gira
 * com'è. Le route vengono tolte prima della pulizia finale dell'azienda.
 * ============================================================================ */
const fs = require('fs');
const { test, expect } = require('../helpers/testCompany');
const { gotoList } = require('../helpers/docHelpers');

const anno = new Date().getFullYear();
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fakeRoute = (rows) => route => {
  if (route.request().method() !== 'GET') return route.continue();
  const body = /[?&]id=gt\./.test(route.request().url()) ? [] : rows;
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
};
// Nomi dei file dentro uno ZIP: stanno in chiaro nella directory centrale.
const zipNames = buf => [...buf.toString('latin1').matchAll(/PK\x01\x02[\s\S]{42}([^\x00]+?\.(?:pdf|xml))/g)].map(m => m[1]);

async function exportAs(page, kind) {
  await page.click('[data-bx-open]');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.click(`[data-bx="${kind}"]`)]);
  return { name: download.suggestedFilename(), buf: fs.readFileSync(await download.path()) };
}

test('ordini fornitore spuntati: Excel riepilogativo e ZIP con un PDF per ordine', async ({ company }) => {
  const { page, companyId } = company;
  const fornitori = [{ id: uuid(900), company_id: companyId, nome: 'Fornitore Export SRL' }];
  const ordini = [1, 2, 3].map(i => ({
    id: uuid(i), company_id: companyId, num: `OF/${anno}/900${i}`, data: `${anno}-02-0${i}`, fornitore_id: uuid(900),
    righe: [{ cod: 'X' + i, descr: 'riga ' + i, qty: i, prezzo: 10, sconto: '', iva: 22 }], ftf_ids: [], extra: {},
  }));
  await page.route('**/rest/v1/fornitori?*', fakeRoute(fornitori));
  await page.route('**/rest/v1/ordini_fornitore?*', fakeRoute(ordini));

  await gotoList(page, '/ordini-fornitore.html');
  await expect(page.locator('#list-area tbody tr')).toHaveCount(3);
  await expect(page.locator('[data-bx-open]')).toHaveCount(0);
  await page.click('#check-all');
  await expect(page.locator('[data-bx-open]')).toContainText('Esporta (3)');

  const xlsx = await exportAs(page, 'excel');
  expect(xlsx.name).toMatch(/^ordini-fornitori-riepilogo-\d{4}-\d{2}-\d{2}\.xlsx$/);
  expect(xlsx.buf.subarray(0, 2).toString()).toBe('PK');

  // Due soli ordini spuntati: lo ZIP contiene esattamente quei due PDF.
  await page.locator(`.row-check[data-id="${uuid(3)}"]`).click();
  const zip = await exportAs(page, 'pdf');
  expect(zip.name).toMatch(/^ordini-fornitori-pdf-.*\.zip$/);
  expect(zipNames(zip.buf).sort()).toEqual([`OF-${anno}-9001.pdf`, `OF-${anno}-9002.pdf`]);

  await page.unroute('**/rest/v1/fornitori?*');
  await page.unroute('**/rest/v1/ordini_fornitore?*');
});

test('fatture spuntate: ZIP di XML FatturaPA, saltando quelle senza dati del cliente', async ({ company }) => {
  const { page, companyId } = company;
  const clienti = [
    { id: uuid(800), company_id: companyId, nome: 'Clinica Completa SRL', piva: '01234567890', sdi: 'ABC1234', via: 'Via Roma 1', cap: '87100', citta: 'Cosenza', prov: 'CS', dest: [] },
    { id: uuid(801), company_id: companyId, nome: 'Cliente Senza SDI', piva: '09876543210', dest: [] },
  ];
  const fatture = [[1, 800], [2, 801]].map(([i, c]) => ({
    id: uuid(10 + i), company_id: companyId, num: `FT/${anno}/800${i}`, data: `${anno}-03-0${i}`, cliente_id: uuid(c),
    righe: [{ cod: 'X', descr: 'riga', qty: 1, prezzo: 100, sconto: '', iva: 22 }], paid: false, pagamenti: [], extra: {},
  }));
  await page.route('**/rest/v1/clienti?*', fakeRoute(clienti));
  await page.route('**/rest/v1/fatture_cliente?*', fakeRoute(fatture));

  await gotoList(page, '/fatture.html');
  await expect(page.locator('#list-area tbody tr')).toHaveCount(2);
  await page.click('#check-all');
  const dialog = page.waitForEvent('dialog').then(async d => { const m = d.message(); await d.accept(); return m; });
  const zip = await exportAs(page, 'xml');
  const nomi = zipNames(zip.buf);
  expect(nomi).toHaveLength(1);
  expect(nomi[0]).toMatch(new RegExp(`_FT${anno}8001\\.xml$`));
  expect(await dialog).toContain(`FT/${anno}/8002: manca il Codice Destinatario o la PEC del cliente`);

  await page.unroute('**/rest/v1/clienti?*');
  await page.unroute('**/rest/v1/fatture_cliente?*');
});
