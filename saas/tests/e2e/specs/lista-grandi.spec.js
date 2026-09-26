/* ============================================================================
 * lista-grandi.spec.js — app/list-cap.js: un elenco con più di 300 righe
 * disegna solo le prime 300 (con un avviso), invece di ricostruire
 * un'intera tabella enorme ad ogni tasto premuto nella ricerca — il fix di
 * prestazioni nato dall'import storico Maestro Gold (fatture cliente/ddt/
 * ordini fornitore passati da poche centinaia a migliaia di righe).
 *
 * I 305 ordini NON vengono scritti nel database: il piano di prova di
 * un'azienda nuova consente 50 documenti al mese (limite applicato lato
 * server, migration 0027_document_quota.sql), e lo scopo qui è collaudare
 * il RENDERING dell'elenco, non la scrittura. La risposta di PostgREST per
 * ordini_fornitore viene quindi sostituita con 305 righe finte: il resto
 * della pagina (store.js, filtri, list-cap.js) gira esattamente com'è.
 * ============================================================================ */
const { test, expect } = require('../helpers/testCompany');
const { saveAndSeeRow, gotoList } = require('../helpers/docHelpers');

const RENDER_CAP = 300;
const TOTALE_RIGHE = RENDER_CAP + 5;

test('un elenco con più di 300 documenti mostra solo le prime 300 righe, con avviso', async ({ company }) => {
  const { page, companyId } = company;

  await gotoList(page, '/fornitori.html');
  await page.click('#new-fornitore');
  await page.fill('#f-nome', 'Fornitore Test SRL');
  await saveAndSeeRow(page, 'Fornitore Test SRL');
  const fornitoreId = await page.evaluate(async (companyId) => {
    const [f] = await window.SaasStore.loadCollection('fornitori', companyId);
    return f.id;
  }, companyId);

  // L'elenco si apre filtrato sull'anno corrente: le date finte stanno lì.
  const anno = new Date().getFullYear();
  const righe = Array.from({ length: TOTALE_RIGHE }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    company_id: companyId,
    num: 'OF/TEST/' + String(i).padStart(4, '0'),
    data: `${anno}-01-01`,
    fornitore_id: fornitoreId,
    righe: [{ cod: 'X', descr: 'riga ' + i, qty: 1, prezzo: 1, sconto: '', iva: 22 }],
    ftf_ids: [],
    extra: {},
  }));
  await page.route('**/rest/v1/ordini_fornitore?*', route => {
    if (route.request().method() !== 'GET') return route.continue();
    // store.loadCollection() pagina per cursore (id=gt.<ultimo id>): la
    // prima pagina porta tutte le righe finte, la successiva è vuota.
    const body = /[?&]id=gt\./.test(route.request().url()) ? [] : righe;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await gotoList(page, '/ordini-fornitore.html');
  await expect(page.locator('.list-cap-notice')).toContainText(`prime ${RENDER_CAP}`);
  await expect(page.locator('#list-area tbody tr')).toHaveCount(RENDER_CAP);
});
