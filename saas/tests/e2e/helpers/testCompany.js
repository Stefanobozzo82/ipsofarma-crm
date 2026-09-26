/* ============================================================================
 * testCompany.js — fixture Playwright: un'azienda usa-e-getta per test.
 *
 * Ogni test che usa la fixture `company` riceve un'azienda vera, creata con
 * la stessa RPC (register_company) che usa la pagina di registrazione — su
 * cui l'account di prova è admin, isolata da qualunque altra azienda del
 * progetto: nessun test qui dentro tocca MAI dati diversi da quelli appena
 * creati per lui.
 *
 * L'ACCOUNT invece è uno solo, creato una volta a mano (vedi "Account di
 * prova" in tests/e2e/README.md) e passato con E2E_EMAIL/E2E_PASSWORD:
 * Supabase Auth manda un'email di conferma a ogni registrazione e ne
 * consente pochissime all'ora — registrare un utente nuovo per ogni test
 * (com'era in origine) si fermava dopo la prima con "email rate limit
 * exceeded". Un login non manda nulla.
 *
 * Pulizia — vedi "Un limite onesto" in tests/e2e/README.md: la fixture
 * cancella tutto ciò che l'admin di un'azienda PUÒ cancellare via RLS
 * (documenti, clienti, fornitori, prodotti — vedi cleanupCompanyData
 * sotto). La riga dell'azienda e la membership restano: cancellarle
 * richiede la service_role key, che questa suite non usa mai.
 * cleanup-orphans.js (privilegiato, a parte) le spazza via periodicamente
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

// Credenziali degli account di prova (vedi README, "Account di prova").
// `operator` serve solo a permessi.spec.js: un secondo utente, non admin.
function credentials(role = 'admin') {
  const prefix = role === 'operator' ? 'E2E_OPERATOR' : 'E2E';
  const email = process.env[`${prefix}_EMAIL`], password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`Servono ${prefix}_EMAIL e ${prefix}_PASSWORD: un account già registrato e confermato sul progetto di test — vedi tests/e2e/README.md, "Account di prova".`);
  }
  return { email, password };
}

// Accesso dalla pagina di login vera; torna con la sessione attiva e la
// pagina index.html aperta. `query` permette di arrivarci con ?invite=…
async function signIn(page, { email, password }, query = '') {
  await page.goto('/index.html' + query);
  await page.waitForSelector('#auth-box:not([hidden])', { timeout: 30_000 });
  // Con ?invite=… la pagina parte in modalità "Crea account": passare ad
  // "Accedi", altrimenti signUp su un utente esistente "riesce" senza sessione.
  if ((await page.locator('#auth-submit').textContent()).trim() !== 'Accedi') await page.click('#switch-link');
  if (!(await page.locator('#email').evaluate(el => el.readOnly))) await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#auth-submit');
  // Finito quando: la pagina è cambiata (un invito accettato porta dritti
  // alla dashboard), il riquadro di accesso è sparito, o c'è un messaggio.
  await page.waitForFunction(() => {
    const box = document.querySelector('#auth-box');
    if (!box) return true;
    const loading = document.querySelector('#loading');
    if (loading && !loading.hidden) return false;
    const msg = document.querySelector('#auth-msg');
    return box.hidden || !!(msg && !msg.hidden && msg.textContent.trim());
  }, null, { timeout: 30_000 }).catch(e => { if (!/navigat|destroyed/i.test(e.message)) throw e; });
  await page.waitForLoadState();
  if (await page.locator('#auth-box').isVisible().catch(() => false)) {
    throw new Error(`Accesso fallito per ${email}: ${await page.locator('#auth-msg').textContent()}`);
  }
}

// Il tour guidato al primo accesso (app/tour.js) intercetterebbe i click
// dei test dietro il suo overlay — saltarlo subito se compare.
async function skipTour(page) {
  const skip = page.getByText('Salta il tour');
  if (await skip.isVisible({ timeout: 2_000 }).catch(() => false)) await skip.click();
}

// esposta a parte (non solo dentro la fixture) perché cleanup-orphans.js
// e i test stessi possono volerla richiamare a metà di uno scenario, non
// solo alla fine.
async function cleanupCompanyData(page, companyId) {
  await page.goto('/dashboard.html');
  await page.waitForFunction(() => !!window.SaasStore, null, { timeout: 30_000 }).catch(() => {});
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
    const { email, password } = credentials();
    // Nome riconoscibile da cleanup-orphans.js (prefisso "QA Test") e dal
    // titolo del test che l'ha creata, utile leggendo l'elenco aziende a
    // mano durante lo sviluppo di un test.
    const companyName = `QA Test — ${testInfo.title}`.slice(0, 60);
    const slug = `qa-${randomSuffix()}`;

    await signIn(page, { email, password });
    // index.html non carica app/store.js: usa il suo client Supabase (`sb`,
    // dichiarato a livello di script) per la stessa RPC del pulsante
    // "Crea azienda".
    const companyId = await page.evaluate(async ({ companyName, slug }) => {
      // eslint-disable-next-line no-undef
      const { data, error } = await sb.rpc('register_company', { p_nome: companyName, p_slug: slug });
      if (error) throw new Error(error.message);
      return data && data[0] && data[0].company_id;
    }, { companyName, slug });
    if (!companyId) throw new Error('Azienda di test non creata: register_company non ha restituito company_id.');
    // Stesso effetto del pulsante "Apri gestionale →" in index.html.
    await page.evaluate(({ companyId, companyName }) => {
      localStorage.setItem('saas_company_id', companyId);
      localStorage.setItem('saas_company_nome', companyName);
    }, { companyId, companyName });
    await page.goto('/dashboard.html');
    await page.waitForFunction(() => !!window.SaasStore, null, { timeout: 30_000 });
    await skipTour(page);

    await use({ page, email, password, companyId, companyName });

    await cleanupCompanyData(page, companyId);
  },
});

module.exports = { test, expect: base.expect, cleanupCompanyData, CLEANUP_ORDER, credentials, signIn, skipTour };
