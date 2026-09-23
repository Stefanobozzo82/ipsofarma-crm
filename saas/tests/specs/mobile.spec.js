/* ============================================================================
 * mobile.spec.js — la dashboard a larghezza da telefono non deve MAI
 * scorrere in orizzontale, e il cassetto di navigazione non deve mai
 * nascondere "Esci" dietro la barra in basso. Sono i due bug reali trovati
 * (e corretti in app/theme.css) quando lo storico Maestro Gold ha portato
 * la fila degli anni da 2-3 voci a 19: prima di allora nessuno dei due si
 * era mai manifestato, perché non c'era mai stato abbastanza contenuto da
 * farli emergere — motivo in più per tenerli sotto test invece che fidarsi
 * che "tanto funzionava".
 * ============================================================================ */
const { test, expect } = require('../helpers/testCompany');

test.use({ viewport: { width: 390, height: 844 } });

test('la dashboard non scorre in orizzontale su schermo da telefono', async ({ company }) => {
  const { page } = company;
  await page.goto('/dashboard.html');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('"Esci" nel cassetto non finisce sotto la barra di navigazione in basso', async ({ company }) => {
  const { page } = company;
  await page.goto('/dashboard.html');
  await page.click('#nav-more-btn');
  await page.locator('#sidebar').evaluate(el => { el.scrollTop = el.scrollHeight; });

  const logoutBox = await page.locator('#nav-logout').boundingBox();
  const bottombarBox = await page.locator('.mobile-bottombar').boundingBox();
  expect(logoutBox).not.toBeNull();
  expect(bottombarBox).not.toBeNull();
  expect(logoutBox.y + logoutBox.height).toBeLessThanOrEqual(bottombarBox.y);
});
