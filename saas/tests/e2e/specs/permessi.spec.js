/* ============================================================================
 * permessi.spec.js — solo un admin può eliminare un documento (vedi le
 * policy "admin cancella ..." nelle migration): un "operatore" può creare e
 * modificare, non cancellare. Il test copre anche l'errore chiaro aggiunto
 * in store.js/removeDoc() — prima di quella correzione il pulsante
 * "Elimina" premuto da un operatore non falliva con un messaggio: non
 * faceva semplicemente nulla, senza alcun avviso.
 * ============================================================================ */
const { test, expect, credentials, signIn, skipTour } = require('../helpers/testCompany');
const { acceptConfirms, captureDialogs, saveAndSeeRow, gotoList } = require('../helpers/docHelpers');

test('un operatore non può eliminare un ordine cliente (un admin sì)', async ({ company, browser }) => {
  const { page, companyId } = company;
  acceptConfirms(page);

  // L'admin crea un cliente e un ordine da provare a cancellare.
  await gotoList(page, '/clienti.html');
  await page.click('#new-cliente');
  await page.fill('#f-nome', 'Cliente Test SRL');
  await saveAndSeeRow(page, 'Cliente Test SRL');

  await gotoList(page, '/ordini.html');
  await page.click('#new-ordine');
  await page.selectOption('#f-cliente', { label: 'Cliente Test SRL' });
  await page.locator('#righe-body .r-descr').fill('Riga di prova');
  await page.locator('#righe-body .r-qty').fill('1');
  await page.locator('#righe-body .r-prezzo').fill('10');
  await page.click('#f-save');
  await expect(page.locator('tbody tr', { hasText: 'Cliente Test SRL' })).toBeVisible();

  // Invita il secondo account di prova come "operatore" (ruolo di default
  // di create_invite) nella STESSA azienda — niente email reale da inviare,
  // il link si costruisce dal token restituito dalla RPC (vedi il commento
  // "niente invio email automatico" in create_invite, 0008_inviti.sql).
  const operator = credentials('operator');
  const invite = await page.evaluate(
    ({ companyId, email }) => window.SaasStore.createInvite(companyId, email, 'operatore'),
    { companyId, email: operator.email }
  );
  expect(invite.token).toBeTruthy();

  const opContext = await browser.newContext();
  const opPage = await opContext.newPage();
  const opDialogs = captureDialogs(opPage);
  // Accesso con ?invite=…: index.html accetta l'invito da solo dopo il
  // login e apre il gestionale dell'azienda che lo ha emesso.
  await signIn(opPage, operator, `?invite=${invite.token}`);
  await opPage.waitForURL('**/dashboard.html', { timeout: 30_000 });
  await skipTour(opPage);

  // L'operatore vede l'ordine (stessa azienda) e prova a eliminarlo: il
  // confirm() viene accettato da captureDialogs come i precedenti, ma
  // removeDoc() fallisce lato RLS — l'errore arriva come un secondo
  // dialog, un alert() nativo (vedi ordini.html, data-del handler).
  await gotoList(opPage, '/ordini.html');
  const opRow = opPage.locator('tbody tr', { hasText: 'Cliente Test SRL' });
  await opRow.locator('.row-check').check();
  await opPage.click('button:has-text("Elimina")');
  await expect.poll(() => opDialogs.some(m => /amministratore/i.test(m)), { timeout: 30_000 })
    .toBe(true);
  await expect(opRow).toBeVisible(); // non cancellato

  // Lo stesso admin, sullo stesso ordine, riesce.
  await page.reload();
  const adminRow = page.locator('tbody tr', { hasText: 'Cliente Test SRL' });
  await adminRow.locator('.row-check').check();
  await page.click('button:has-text("Elimina")');
  await expect(page.locator('text=Nessun ordine ancora')).toBeVisible();

  await opContext.close();
});
