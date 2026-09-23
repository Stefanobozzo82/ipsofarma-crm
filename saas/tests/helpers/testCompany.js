/* ============================================================================
 * testCompany.js — fixture Playwright: un'azienda usa-e-getta per test.
 *
 * Ogni test che usa la fixture `company` riceve un'azienda vera (creata con
 * lo stesso percorso di registrazione che userebbe un cliente reale — niente
 * scorciatoie SQL dirette) su cui l'account di test è admin, isolata da
 * qualunque altra azienda del progetto (Ipsofarma inclusa): nessun test qui
 * dentro tocca MAI dati diversi da quelli appena creati per lui.
 *
 * Pulizia — vedi "Un limite onesto" in tests/README.md: la fixture cancella
 * tutto ciò che l'admin di un'azienda PUÒ cancellare via RLS (documenti,
 * clienti, fornitori, prodotti — vedi cleanupCompanyData sotto). La riga
 * dell'azienda stessa, la membership e l'utente restano: cancellarle
 * richiede la service_role key, che questa suite non usa mai per non
 * doverla tenere in giro. cleanup-orphans.js (privilegiato, va eseguito a
 * parte con una service_role key propria) le spazza via periodicamente
 * grazie a ON DELETE CASCADE su company_id.
 * ============================================================================ */

const base = require('@playwright/test');

// Tutte le collection cancellabili da un admin (vedi COLLECTIONS in
// app/store.js) — nell'ordine che rispetta i vincoli di chiave esterna:
// prima i documenti (che referenziano clienti/fornitori/prodotti), poi le
// anagrafiche. Le tabelle "*_id ... on delete set null" reggerebbero anche
// un ordine diverso, ma "cliente_id"/"fornitore_id" NOT NULL su alcuni
// documenti no — cancellare un cliente ancora referenziato fallirebbe.
const CLEANUP_ORDER = [
  'noteCredito', 'noteCreditoFornitore',
  'fattureCliente', 'fattureFornitore',
  'ddt', 'ddtFornitore',
  'ordiniCliente', 'ordiniFornitore',
  'preventivi',
  'prodotti', 'clienti', 'fornitori',
];

function randomSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// esposta a parte (non solo dentro la fixture) perché cleanup-orphans.js
// e i test stessi possono volerla richiamare a metà di uno scenario, non
// solo alla fine.
async function cleanupCompanyData(page, companyId) {
  await page.goto('/dashboard.html');
  await page.waitForFunction(() => !!window.SaasStore, null, { timeout: 10_000 }).catch(() => {});
  await page.evaluate(async ({ companyId, order }) => {
    const store = window.SaasStore;
    if (!store) return; // sessione già scaduta/pagina non caricata: niente da fare
    for (const coll of order) {
      let rows;
      try { rows = await store.loadCollection(coll, companyId); } catch (e) { continue; }
      for (const row of rows) {
        try { await store.removeDoc(coll, row.id); } catch (e) { /* riprova al giro di cleanup-orphans.js */ }
      }
    }
  }, { companyId, order: CLEANUP_ORDER });
}

const test = base.test.extend({
  // { page, email, password, companyId, companyName } — vedi sopra.
  company: async ({ page }, use, testInfo) => {
    const email = `qa-${randomSuffix()}@example.com`;
    const password = 'TestPass1234!QA';
    // Nome riconoscibile da cleanup-orphans.js (prefisso "QA Test") e dal
    // titolo del test che l'ha creata, utile leggendo l'elenco aziende a
    // mano durante lo sviluppo di un test.
    const companyName = `QA Test — ${testInfo.title}`.slice(0, 60);

    await page.goto('/index.html');
    await page.waitForSelector('#auth-box:not([hidden])', { timeout: 10_000 });
    await page.click('#switch-link'); // "Non hai un account? Registrati"
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('#auth-submit');
    await page.waitForSelector('#register-box:not([hidden])', { timeout: 10_000 });
    await page.fill('#company-nome', companyName);
    await page.click('#register-submit');
    await page.waitForSelector('#dashboard-box:not([hidden])', { timeout: 10_000 });
    await page.click('.company-open');
    await page.waitForURL('**/dashboard.html', { timeout: 10_000 });
    const companyId = await page.evaluate(() => localStorage.getItem('saas_company_id'));
    if (!companyId) throw new Error('Azienda di test non creata correttamente: saas_company_id assente.');

    // Il tour guidato al primo accesso (app/tour.js) intercetterebbe i
    // click dei test dietro il suo overlay — saltarlo subito se compare.
    const skipTour = page.getByText('Salta il tour');
    if (await skipTour.isVisible({ timeout: 2_000 }).catch(() => false)) await skipTour.click();

    await use({ page, email, password, companyId, companyName });

    await cleanupCompanyData(page, companyId);
  },
});

module.exports = { test, expect: base.expect, cleanupCompanyData, CLEANUP_ORDER };
