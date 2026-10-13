// Test automatico del bot WhatsApp: simula intere conversazioni senza usare Meta, Supabase né Resend.
// Si lancia con:  npm test      (oppure: node --test test.mjs)
// Serve Node.js 20.6 o superiore. Non servono librerie né un file .env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BOT = process.env.BOT_FILE ?? fileURLToPath(new URL('./bot.mjs', import.meta.url));
const FAKE = pathToFileURL(fileURLToPath(new URL('./test-support/fake-meta.mjs', import.meta.url))).href;
const APP_SECRET = 'segreto-test';
const VERIFY = 'verifica-test';
const UTENTE = '393331234567';
const DATI_PERSONALI = ['Mario Rossi', 'Via Test 99', 'Torino', '3331234567'];

const CON_DB_E_MAIL = {
  SUPABASE_URL: 'https://progetto-finto.supabase.co',
  SUPABASE_SERVICE_KEY: 'sb_secret_finta',
  RESEND_API_KEY: 're_finta',
  ALERT_EMAIL_TO: 'operatore@esempio.test',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ignora una riga ancora a metà (il bot potrebbe starla scrivendo proprio ora)
const leggiJsonl = (f) => {
  if (!existsSync(f)) return [];
  const righe = [];
  for (const l of readFileSync(f, 'utf8').split('\n')) {
    if (!l) continue;
    try { righe.push(JSON.parse(l)); } catch { /* riga incompleta */ }
  }
  return righe;
};

const vista = (m) =>
  m.type === 'text'
    ? { body: m.text.body, buttons: [], rows: [], label: null }
    : {
        body: m.interactive.body.text,
        buttons: m.interactive.action.buttons?.map((b) => b.reply.title) ?? [],
        rows: m.interactive.action.sections?.[0].rows.map((r) => r.title) ?? [],
        label: m.interactive.action.button ?? null,
      };

// Avvia il bot vero in una cartella temporanea, con un finto Meta, e lo spegne alla fine.
async function conBot(envExtra, prova) {
  const dir = mkdtempSync(join(tmpdir(), 'bot-test-'));
  const porta = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(WA_TOKEN|PHONE_ID|VERIFY_TOKEN|APP_SECRET|SUPABASE_|RESEND_|ALERT_|SESSION_|FAKE_)/.test(k)) delete env[k];
  Object.assign(env, { PORT: String(porta), VERIFY_TOKEN: VERIFY, WA_TOKEN: 'tokenfinto123', PHONE_ID: '123', APP_SECRET }, envExtra);

  const figlio = spawn(process.execPath, ['--import', FAKE, BOT], { cwd: dir, env });
  let log = '';
  figlio.stdout.on('data', (d) => (log += d));
  figlio.stderr.on('data', (d) => (log += d));
  const pronto = Date.now();
  while (!log.includes('Bot in ascolto')) {
    if (Date.now() - pronto > 5000) throw new Error('Il bot non è partito:\n' + log);
    await sleep(25);
  }

  const url = `http://localhost:${porta}/webhook`;
  const firma = (corpo) => 'sha256=' + createHmac('sha256', APP_SECRET).update(corpo).digest('hex');
  const b = {
    url,
    log: () => log,
    inviate: (a) => leggiJsonl(join(dir, 'meta-out.jsonl')).filter((m) => !a || m.to === a),
    db: () => leggiJsonl(join(dir, 'db.jsonl')),
    mail: () => leggiJsonl(join(dir, 'mail.jsonl')),
    file: () => leggiJsonl(join(dir, 'bookings.jsonl')),
    ultimo: (a) => vista(b.inviate(a).at(-1)),
    async attendi(cond, ms = 3000) {
      const t = Date.now();
      while (!cond()) {
        if (Date.now() - t > ms) throw new Error('Tempo scaduto in attesa di un evento atteso');
        await sleep(25);
      }
    },
    async posta(corpo, header = {}) {
      const r = await fetch(url, { method: 'POST', headers: header, body: corpo });
      return r.status;
    },
    async dici(a, msg, { risposta = true } = {}) {
      const prima = b.inviate(a).length;
      const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: a, ...msg }] } }] }] });
      const stato = await b.posta(corpo, { 'x-hub-signature-256': firma(corpo) });
      assert.equal(stato, 200, 'il bot dovrebbe accettare un messaggio firmato bene');
      if (risposta) {
        await b.attendi(() => b.inviate(a).length > prima).catch(() => assert.fail(`Nessuna risposta del bot a: ${JSON.stringify(msg)}`));
        // il bot a volte risponde con più messaggi di fila: aspetto che finisca
        for (let n = b.inviate(a).length; ; ) {
          await sleep(70);
          const ora = b.inviate(a).length;
          if (ora === n) break;
          n = ora;
        }
      }
    },
    testo: (a, t, o) => b.dici(a, { type: 'text', text: { body: t } }, o),
    scegli: (a, id, o) => b.dici(a, { type: 'interactive', interactive: { button_reply: { id } } }, o),
    firma,
  };
  try {
    await prova(b);
  } finally {
    figlio.kill();
    await sleep(80);
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* su Windows può essere ancora in uso */ }
  }
}

async function finoAlIndirizzo(b, a = UTENTE) {
  await b.testo(a, 'ciao');
  await b.scegli(a, 'blood');
  await b.scegli(a, 'yes');
  await b.scegli(a, 'fam');
  await b.testo(a, 'Mario Rossi');
  await b.scegli(a, 'am');
}

// ---------------------------------------------------------------------------------------------

test('collegamento con Meta: verifica del webhook', async () => {
  await conBot({}, async (b) => {
    const ok = await fetch(`${b.url}?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=abc123`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'abc123');
    const no = await fetch(`${b.url}?hub.mode=subscribe&hub.verify_token=sbagliato&hub.challenge=abc123`);
    assert.equal(no.status, 403);
    assert.equal((await fetch(b.url.replace('/webhook', '/altro'))).status, 404);
    const salute = await fetch(b.url.replace('/webhook', '/health'));
    assert.equal(salute.status, 200);
    assert.equal(await salute.text(), 'ok');
  });
});

test('sicurezza: le richieste senza firma valida di Meta vengono scartate', async () => {
  await conBot({}, async (b) => {
    const corpo = JSON.stringify({ entry: [] });
    assert.equal(await b.posta(corpo), 401, 'senza firma');
    assert.equal(await b.posta(corpo, { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) }), 401, 'firma sbagliata');
    assert.equal(await b.posta(corpo, { 'x-hub-signature-256': 'sha256=ab' }), 401, 'firma troppo corta');
    assert.equal(await b.posta(corpo + ' ', { 'x-hub-signature-256': b.firma(corpo) }), 401, 'corpo modificato dopo la firma');
    assert.equal(await b.posta(corpo, { 'x-hub-signature-256': b.firma(corpo) }), 200, 'firma corretta');
    assert.equal(b.inviate().length, 0);
  });
});

test('prenotazione completa: conversazione, Supabase, email e privacy', async () => {
  await conBot(CON_DB_E_MAIL, async (b) => {
    await b.testo(UTENTE, 'buongiorno'); // basta un messaggio qualsiasi, senza "ciao"
    let m = b.ultimo(UTENTE);
    assert.match(m.body, /Ipsofarma/);
    assert.ok(m.rows.includes('Prelievo del sangue') && m.rows.includes('Parlare con una persona'), 'il menu mostra i servizi');

    await b.scegli(UTENTE, 'blood');
    m = b.ultimo(UTENTE);
    assert.match(m.body, /Acconsenti al trattamento/, 'il consenso si chiede alla scelta del servizio');
    assert.deepEqual(m.buttons, ['✅ Accetto', 'Non accetto']);

    await b.scegli(UTENTE, 'yes');
    assert.match(b.ultimo(UTENTE).body, /Per chi è la prestazione/);
    await b.scegli(UTENTE, 'fam');
    assert.match(b.ultimo(UTENTE).body, /Come si chiama/);
    await b.testo(UTENTE, 'Mario Rossi');
    assert.match(b.ultimo(UTENTE).body, /Quando preferisci/);
    await b.scegli(UTENTE, 'am');
    assert.match(b.ultimo(UTENTE).body, /indirizzo completo/);
    await b.testo(UTENTE, 'Via Test 99, Torino');
    m = b.ultimo(UTENTE);
    for (const pezzo of ['Riepilogo', 'Prelievo del sangue', 'Mario Rossi', 'Domani mattina', 'Via Test 99, Torino']) {
      assert.ok(m.body.includes(pezzo), `il riepilogo contiene "${pezzo}"`);
    }
    assert.deepEqual(m.buttons, ['✅ Confermo', 'Modifica']);

    await b.scegli(UTENTE, 'yes');
    m = b.ultimo(UTENTE);
    assert.match(m.body, /Prenotazione registrata/);
    assert.doesNotMatch(m.body, /118/, 'la frase sul 118 non è nel messaggio finale');

    // salvata su Supabase, con i campi giusti e senza ripiego sul file
    assert.equal(b.db().length, 1);
    const r = b.db()[0];
    assert.match(r.url, /\/rest\/v1\/rpc\/bot_salva_prenotazione$/);
    assert.ok(r.headers.includes('apikey'));
    assert.equal(r.body.p_telefono, UTENTE);
    assert.equal(r.body.p_servizio, 'Prelievo del sangue');
    assert.equal(r.body.p_paziente, 'Mario Rossi');
    assert.equal(r.body.p_fascia, 'Domani mattina (9-12)');
    assert.equal(r.body.p_indirizzo, 'Via Test 99, Torino');
    assert.ok(!Number.isNaN(Date.parse(r.body.p_consenso_il)), 'la data del consenso è registrata');
    assert.equal(b.file().length, 0);

    // avviso email all'operatore, senza dati del paziente
    await b.attendi(() => b.mail().length === 1);
    const mail = b.mail()[0];
    assert.deepEqual(mail.to, ['operatore@esempio.test']);
    assert.equal(mail.subject, 'Nuova prenotazione: Prelievo del sangue');
    for (const d of DATI_PERSONALI) assert.ok(!mail.text.includes(d) && !mail.subject.includes(d), `l'email non contiene "${d}"`);

    // nei registri del bot non finisce nulla di ciò che ha scritto l'utente
    for (const d of DATI_PERSONALI) assert.ok(!b.log().includes(d), `il registro non contiene "${d}"`);
  });
});

test('limiti di WhatsApp rispettati in tutti i messaggi', async () => {
  await conBot({}, async (b) => {
    await finoAlIndirizzo(b);
    await b.testo(UTENTE, 'Via Test 99, Torino');
    await b.scegli(UTENTE, 'yes');
    await b.testo(UTENTE, 'menu');
    assert.ok(b.inviate().length >= 8);
    for (const m of b.inviate()) {
      if (m.type === 'text') { assert.ok(m.text.body.length <= 4096); continue; }
      const i = m.interactive;
      assert.ok(i.body.text.length <= 1024, 'corpo troppo lungo');
      if (i.type === 'button') {
        assert.ok(i.action.buttons.length <= 3, 'più di 3 pulsanti');
        for (const bt of i.action.buttons) assert.ok(bt.reply.title.length <= 20, `pulsante troppo lungo: ${bt.reply.title}`);
      } else {
        assert.ok(i.action.button.length <= 20, 'etichetta della lista troppo lunga');
        assert.ok(i.action.sections[0].rows.length <= 10, 'più di 10 voci');
        for (const r of i.action.sections[0].rows) assert.ok(r.title.length <= 24, `voce troppo lunga: ${r.title}`);
      }
    }
  });
});

test('pulsanti di avvio di WhatsApp: portano subito alla richiesta giusta', async () => {
  await conBot({}, async (b) => {
    await b.testo('390000000001', 'Prelievo del sangue');
    let m = b.ultimo('390000000001');
    assert.match(m.body, /Ipsofarma/, 'si presenta anche se non ha mai scritto prima');
    assert.match(m.body, /Acconsenti al trattamento/);
    await b.scegli('390000000001', 'yes');
    assert.match(b.ultimo('390000000001').body, /Per chi è la prestazione/);

    await b.testo('390000000002', 'Altri servizi');
    m = b.ultimo('390000000002');
    assert.ok(m.rows.includes('Visita o analisi') && m.rows.includes('Ritiro referti/farmaci'));
  });
});

test('consenso rifiutato: niente prenotazione', async () => {
  await conBot(CON_DB_E_MAIL, async (b) => {
    await b.testo(UTENTE, 'ciao');
    await b.scegli(UTENTE, 'par');
    await b.scegli(UTENTE, 'no');
    assert.match(b.ultimo(UTENTE).body, /Senza consenso/);
    assert.equal(b.db().length + b.file().length + b.mail().length, 0);
  });
});

test('urgenze: rimanda al 118 e non salva né avvisa', async () => {
  await conBot(CON_DB_E_MAIL, async (b) => {
    for (const frase of ['ho dolore al petto', 'non respiro bene', 'mio padre è svenuto']) {
      await b.testo(UTENTE, frase);
      assert.match(b.ultimo(UTENTE).body, /chiama subito il 118/, frase);
    }
    await finoAlIndirizzo(b); // anche a metà prenotazione
    await b.testo(UTENTE, 'adesso ho dolore al petto');
    assert.match(b.ultimo(UTENTE).body, /118/);
    await sleep(150);
    assert.equal(b.db().length + b.file().length + b.mail().length, 0);
  });
});

test('"Parlare con una persona": una sola email anche se la persona insiste', async () => {
  await conBot(CON_DB_E_MAIL, async (b) => {
    await b.testo(UTENTE, 'operatore');
    assert.match(b.ultimo(UTENTE).body, /Ti chiamiamo entro 15 minuti/);
    await b.testo(UTENTE, 'operatore');
    await b.scegli(UTENTE, 'op');
    await b.attendi(() => b.mail().length >= 1);
    await sleep(250);
    assert.equal(b.mail().length, 1, 'una sola email di richiamo');
    assert.equal(b.mail()[0].subject, 'Richiesta di essere richiamati');
    assert.ok(b.mail()[0].text.includes(`+${UTENTE}`), 'c\'è il numero da richiamare');
  });
});

test('Supabase non risponde: la prenotazione finisce nel file e l\'email avvisa', async () => {
  await conBot({ ...CON_DB_E_MAIL, FAKE_DB: 'giu' }, async (b) => {
    await finoAlIndirizzo(b);
    await b.testo(UTENTE, 'Via Test 99, Torino');
    await b.scegli(UTENTE, 'yes');
    assert.match(b.ultimo(UTENTE).body, /Prenotazione registrata/, 'la persona non si accorge del problema');
    assert.equal(b.file().length, 1, 'copia di sicurezza nel file');
    assert.equal(b.file()[0].patient, 'Mario Rossi');
    await b.attendi(() => b.mail().length === 1);
    assert.match(b.mail()[0].text, /ATTENZIONE: solo nel file/);
    assert.match(b.log(), /Salvataggio su Supabase non riuscito/);
    for (const d of DATI_PERSONALI) assert.ok(!b.log().includes(d), `il registro non contiene "${d}"`);
  });
});

test('l\'email non parte: la conversazione prosegue lo stesso', async () => {
  await conBot({ ...CON_DB_E_MAIL, FAKE_MAIL: '500' }, async (b) => {
    await finoAlIndirizzo(b);
    await b.testo(UTENTE, 'Via Test 99, Torino');
    await b.scegli(UTENTE, 'yes');
    assert.match(b.ultimo(UTENTE).body, /Prenotazione registrata/);
    await b.attendi(() => b.log().includes('Avviso email non inviato'));
    assert.equal(b.db().length, 1);
  });
});

test('senza Supabase né email: salva nel file e funziona', async () => {
  await conBot({}, async (b) => {
    assert.match(b.log(), /file locale bookings\.jsonl/);
    assert.match(b.log(), /non attivi/);
    await finoAlIndirizzo(b);
    await b.testo(UTENTE, 'Via Test 99, Torino');
    await b.scegli(UTENTE, 'yes');
    assert.match(b.ultimo(UTENTE).body, /Prenotazione registrata/);
    assert.equal(b.file().length, 1);
    assert.equal(b.db().length + b.mail().length, 0);
  });
});

test('messaggi non previsti: il bot non si blocca', async () => {
  await conBot({}, async (b) => {
    await b.dici(UTENTE, { type: 'audio', audio: { id: 'x' } });
    assert.match(b.ultimo(UTENTE).body, /solo messaggi scritti e pulsanti/);
    await b.testo(UTENTE, 'ciao');
    await b.scegli(UTENTE, 'blood');
    await b.scegli(UTENTE, 'yes');
    await b.testo(UTENTE, 'parole a caso'); // risposta non prevista alla domanda "Per chi è…?"
    assert.match(b.ultimo(UTENTE).body, /Per chi è la prestazione/, 'ripete la domanda');
    assert.ok(b.inviate(UTENTE).some((m) => /Non ho capito/.test(vista(m).body)));
  });
});

test('sessioni: scadono dopo il silenzio e il consenso si richiede di nuovo', async () => {
  await conBot({ SESSION_TTL_MINUTES: '0.02' }, async (b) => { // ~1,2 secondi
    await finoAlIndirizzo(b, 'A1');
    await sleep(500);
    await b.testo('A1', 'Via Test 99, Torino'); // ancora dentro i tempi: la conversazione continua
    assert.match(b.ultimo('A1').body, /Riepilogo/);

    await finoAlIndirizzo(b, 'B1');
    await sleep(1700);
    await b.testo('B1', 'Via Test 99, Torino'); // troppo tardi: si riparte
    assert.match(b.ultimo('B1').body, /Ipsofarma/);
    assert.doesNotMatch(b.ultimo('B1').body, /Riepilogo/);
    await b.scegli('B1', 'blood');
    assert.match(b.ultimo('B1').body, /Acconsenti al trattamento/, 'il consenso viene richiesto di nuovo');
  });
});

test('sessioni: il tetto massimo scarta le meno recenti', async () => {
  await conBot({ SESSION_MAX: '3' }, async (b) => {
    await finoAlIndirizzo(b, 'C1');
    for (const n of ['D1', 'D2', 'D3', 'D4']) await b.testo(n, 'ciao');
    await b.testo('C1', 'Via Test 99, Torino');
    assert.match(b.ultimo('C1').body, /Ipsofarma/, 'C1 è stata scartata e riparte dal menu');
  });
});
