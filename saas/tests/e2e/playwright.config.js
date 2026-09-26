// Configurazione della suite — vedi tests/e2e/README.md per come eseguirla e
// per cosa NON verifica ancora (Supabase resta quello vero, non uno
// locale: i motivi sono spiegati nel README, punto "Un limite onesto").
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const PORT = process.env.TEST_PORT || 8934;
const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${PORT}`;

// L'ambiente di sviluppo di questo progetto ha Chromium già scaricato in
// /opt/pw-browsers (vedi le note dell'ambiente) e i download automatici
// disattivati (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1) — quando esiste,
// puntarci esplicitamente invece di lasciare che Playwright provi a
// scaricare la sua build attesa (fallirebbe, o scaricherebbe inutilmente
// un secondo Chromium). Su una macchina diversa (CI, un altro sviluppatore)
// questa cartella semplicemente non esiste: si torna al comportamento
// normale di Playwright.
const fs = require('fs');
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = fs.existsSync(localChromium) ? localChromium : undefined;

module.exports = defineConfig({
  testDir: './specs',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false, // ogni test crea/elimina una propria azienda usa-e-getta contro lo stesso Supabase: file in parallelo va bene, worker multipli sullo stesso file no
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath,
      // Vedi la nota in tests/e2e/README.md ("TLS nell'ambiente di sviluppo"):
      // l'ambiente instrada l'HTTPS in uscita attraverso un proxy con una
      // CA propria che Chromium non ha nel suo trust store di default —
      // senza questo flag ogni chiamata a Supabase (un dominio esterno
      // vero, cdn.jsdelivr.net incluso) fallisce con
      // ERR_CERT_AUTHORITY_INVALID prima ancora di poter accedere.
      // Innocuo qui: il traffico passa comunque dal proxy configurato
      // dall'ambiente, non si sta disattivando un controllo che altrimenti
      // bloccherebbe qualcosa di reale.
      args: process.env.PW_IGNORE_CERT_ERRORS === '0' ? [] : ['--ignore-certificate-errors'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Serve saas/web con un semplice server statico invece di puntare
  // direttamente al sito in produzione — stessi identici file (le pagine
  // leggono comunque Supabase vero, vedi README), ma senza dipendere dalla
  // rete/latenza del deploy né dal fatto che l'ultimo deploy sia aggiornato:
  // la suite testa sempre il codice ESATTO presente sul disco in quel
  // momento, prima ancora che venga pubblicato.
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    cwd: path.join(__dirname, '..', '..', 'web'),
    url: BASE_URL + '/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
