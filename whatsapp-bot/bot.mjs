import http from 'node:http';
import { appendFileSync } from 'node:fs';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// toglie spazi e virgolette che si aggiungono facilmente incollando da telefono
const clean = (v) => v?.trim().replace(/^["']|["']$/g, '').trim();
const PORT = clean(process.env.PORT) || 3000;
const VERIFY_TOKEN = clean(process.env.VERIFY_TOKEN);
const WA_TOKEN = clean(process.env.WA_TOKEN);
const PHONE_ID = clean(process.env.PHONE_ID);
const APP_SECRET = clean(process.env.APP_SECRET);
// facoltativi: se mancano, le prenotazioni restano nel file bookings.jsonl
const SUPABASE_URL = clean(process.env.SUPABASE_URL)?.replace(/\/+$/, '');
const SUPABASE_KEY = clean(process.env.SUPABASE_SERVICE_KEY);
const mancanti = Object.entries({ VERIFY_TOKEN, WA_TOKEN, PHONE_ID, APP_SECRET }).filter(([, v]) => !v).map(([k]) => k);
if (mancanti.length) {
  console.error(`Mancano nel file .env: ${mancanti.join(', ')} (vedi env.example)`);
  process.exit(1);
}

const API = `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`;

// ---------- invio messaggi (Cloud API di Meta) ----------
async function send(to, message) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, ...message }),
  });
  if (res.status === 401) {
    console.error('TOKEN DI META SCADUTO: genera un token nuovo su Meta, mettilo in WA_TOKEN nel file .env e riavvia il bot.');
  } else if (!res.ok) {
    console.error('Errore invio', res.status, await res.text());
  }
}

const text = (to, body) => send(to, { type: 'text', text: { body } });

// max 3 pulsanti, titolo max 20 caratteri
const buttons = (to, body, btns) =>
  send(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: { buttons: btns.map(([id, title]) => ({ type: 'reply', reply: { id, title } })) },
    },
  });

// max 10 voci, titolo voce max 24 caratteri
const list = (to, body, label, rows) =>
  send(to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      action: { button: label, sections: [{ title: 'Servizi', rows: rows.map(([id, title]) => ({ id, title })) }] },
    },
  });

// ---------- contenuti ----------
const SERVICES = {
  par: 'Misurazione pressione',
  inj: 'Iniezione a domicilio',
  blood: 'Prelievo del sangue',
  visit: 'Visita o analisi',
  pick: 'Ritiro referti/farmaci',
};

const URGENT = /(dolore (al )?petto|non respiro|fatica a respirare|svenut|ictus|emorragia|infarto)/i;
const MSG_118 = '⚠️ Questa chat non è adatta alle urgenze.\nSe la situazione è grave, *chiama subito il 118*.';

const prompts = {
  consent: (to, s) => {
    const intro = s.greeted ? '' : "Buongiorno, sono l'assistente di *Ipsofarma*.\nPosso prenotare prestazioni a domicilio.\n\n";
    s.greeted = true;
    return buttons(
      to,
      intro +
        'Per prenotare devo raccogliere nome, indirizzo e tipo di prestazione, anche dati sulla salute.\n' +
        'Li uso solo per organizzare la visita.\n\n' +
        '*Acconsenti al trattamento?*',
      [['yes', '✅ Accetto'], ['no', 'Non accetto']],
    );
  },
  menu: (to, s) => {
    const body = s.greeted
      ? '*Cosa ti serve?*'
      : "Buongiorno, sono l'assistente di *Ipsofarma*.\nPosso prenotare prestazioni a domicilio.\n\n*Cosa ti serve?*";
    s.greeted = true;
    return list(to, body, 'Scegli il servizio', [...Object.entries(SERVICES), ['op', 'Parlare con una persona']]);
  },
  who: (to) => buttons(to, '*Per chi è la prestazione?*', [['me', 'Per me'], ['fam', 'Per un familiare']]),
  name: (to) => text(to, '*Come si chiama* la persona che riceverà la visita?'),
  slot: (to) =>
    buttons(to, '*Quando preferisci?*', [['am', 'Domani mattina'], ['pm', 'Domani pomeriggio'], ['other', 'Altro giorno']]),
  slot_text: (to) => text(to, 'Scrivimi *il giorno* e *la fascia oraria* che preferisci.'),
  addr: (to) => text(to, 'Mi scrivi *l’indirizzo completo*?\n(via, numero civico, città)'),
  confirm: (to, s) =>
    buttons(
      to,
      `*Riepilogo*\n\n*Servizio:* ${s.data.service}\n*Per:* ${s.data.patient}\n*Quando:* ${s.data.slot}\n*Dove:* ${s.data.addr}\n\n*Confermi?*`,
      [['yes', '✅ Confermo'], ['edit', 'Modifica']],
    ),
};

// ---------- salvataggio prenotazioni ----------
// Scrive su Supabase tramite la funzione public.bot_salva_prenotazione (solo chiave service_role).
// Se Supabase non è configurato o non risponde, ripiega sul file locale: la prenotazione non si perde.
// Nei log non finisce mai nulla di ciò che ha scritto l'utente.
async function saveBooking({ phone, consentAt, service, patient, slot, addr }) {
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
      if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`; // chiave vecchio tipo (JWT)
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bot_salva_prenotazione`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          p_telefono: phone,
          p_consenso_il: consentAt ?? null,
          p_servizio: service,
          p_paziente: patient,
          p_fascia: slot,
          p_indirizzo: addr,
        }),
      });
      if (res.ok) return 'database';
      console.error('Salvataggio su Supabase non riuscito, stato', res.status);
    } catch {
      console.error('Salvataggio su Supabase non riuscito: errore di rete');
    }
  }
  appendFileSync(
    'bookings.jsonl',
    JSON.stringify({ ts: new Date().toISOString(), phone, consentAt, service, patient, slot, addr }) + '\n',
  );
  return 'file';
}

// ---------- logica della conversazione ----------
const sessions = new Map();

async function go(to, s, step) {
  s.step = step;
  await prompts[step](to, s);
}

async function handle(from, input) {
  let s = sessions.get(from);
  if (!s) sessions.set(from, (s = { step: 'start', data: {}, consent: false }));
  const raw = input.value ?? '';
  const t = raw.toLowerCase();
  const isText = input.kind === 'text';

  if (isText && URGENT.test(t)) return text(from, MSG_118);

  if (input.value === 'op' || (isText && /\boperatore\b/.test(t))) {
    return text(from, 'Va bene, ti passo a una persona del team.\nTi chiamiamo entro 15 minuti, in orario di servizio.');
  }

  // i pulsanti di avvio di WhatsApp arrivano come testo identico al nome del servizio
  const byTitle = isText && Object.values(SERVICES).find((v) => v.toLowerCase() === t);
  if (byTitle && (s.step === 'start' || s.step === 'menu')) {
    s.data = { service: byTitle };
    return go(from, s, s.consent ? 'who' : 'consent');
  }

  if (s.step === 'start' || (isText && /^(menu|ciao|salve|buongiorno|buonasera|altri servizi)$/.test(t))) {
    s.data = {};
    return go(from, s, 'menu');
  }

  switch (s.step) {
    case 'consent':
      if (raw === 'yes') { s.consent = true; s.consentAt = new Date().toISOString(); return go(from, s, 'who'); }
      if (raw === 'no') return text(from, 'Capito.\nSenza consenso non posso prenotare da qui.\nPuoi chiamarci al numero del servizio.');
      break;
    case 'menu':
      if (SERVICES[raw]) { s.data.service = SERVICES[raw]; return go(from, s, s.consent ? 'who' : 'consent'); }
      break;
    case 'who':
      if (raw === 'me') { s.data.patient = 'Il richiedente'; return go(from, s, 'slot'); }
      if (raw === 'fam') return go(from, s, 'name');
      break;
    case 'name':
      if (isText && raw) { s.data.patient = raw; return go(from, s, 'slot'); }
      break;
    case 'slot':
      if (raw === 'am') { s.data.slot = 'Domani mattina (9-12)'; return go(from, s, 'addr'); }
      if (raw === 'pm') { s.data.slot = 'Domani pomeriggio (15-18)'; return go(from, s, 'addr'); }
      if (raw === 'other') return go(from, s, 'slot_text');
      break;
    case 'slot_text':
      if (isText && raw) { s.data.slot = raw; return go(from, s, 'addr'); }
      break;
    case 'addr':
      if (isText && raw) { s.data.addr = raw; return go(from, s, 'confirm'); }
      break;
    case 'confirm':
      if (raw === 'yes') {
        await saveBooking({ phone: from, consentAt: s.consentAt, ...s.data });
        s.step = 'menu';
        s.data = {};
        return text(
          from,
          '✅ *Prenotazione registrata.*\nTi scriviamo il giorno prima con un promemoria.\n\n' +
            'Per una nuova richiesta scrivi *menu*.\nPer sintomi urgenti chiama il *118*.',
        );
      }
      if (raw === 'edit') return go(from, s, 'slot');
      break;
  }

  // risposta non prevista: ripeto la domanda
  await text(from, 'Non ho capito, riproviamo.\nPuoi scrivere *menu* per ricominciare.');
  await go(from, s, s.step);
}

// ---------- server webhook ----------
// legge il corpo come byte esatti: la firma di Meta si calcola su quelli
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

// Meta firma ogni richiesta con HMAC-SHA256 (chiave = App Secret) nell'header X-Hub-Signature-256
function signatureOk(rawBody, header) {
  const expected = Buffer.from('sha256=' + createHmac('sha256', APP_SECRET).update(rawBody).digest('hex'));
  const received = Buffer.from(header ?? '');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/webhook') { res.writeHead(404).end(); return; }

    if (req.method === 'GET') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN;
      res.writeHead(ok ? 200 : 403).end(ok ? url.searchParams.get('hub.challenge') : '');
      return;
    }

    if (req.method === 'POST') {
      const raw = await readBody(req);
      if (!signatureOk(raw, req.headers['x-hub-signature-256'])) {
        console.warn('Richiesta scartata: firma non valida');
        res.writeHead(401).end();
        return;
      }
      res.writeHead(200).end();
      try {
        const msg = JSON.parse(raw.toString('utf8')).entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!msg) return;
        let input;
        if (msg.type === 'text') input = { kind: 'text', value: msg.text.body.trim() };
        else if (msg.type === 'interactive') {
          const r = msg.interactive.button_reply ?? msg.interactive.list_reply;
          input = { kind: 'reply', value: r.id };
        } else {
          await text(msg.from, 'Per ora capisco solo messaggi scritti e pulsanti. Scrivimi o scrivi "operatore" per parlare con una persona.');
          return;
        }
        await handle(msg.from, input);
      } catch (e) {
        console.error('Errore', e);
      }
      return;
    }
    res.writeHead(405).end();
  })
  .listen(PORT, () => {
    console.log(`Bot in ascolto su http://localhost:${PORT}/webhook`);
    const fp = createHash('sha256').update(WA_TOKEN).digest('hex').slice(0, 8);
    console.log(`Prenotazioni salvate su: ${SUPABASE_URL && SUPABASE_KEY ? 'Supabase (con ripiego su file)' : 'file locale bookings.jsonl'}`);
    console.log(`Controllo config: WA_TOKEN ${WA_TOKEN.length} caratteri (impronta ${fp}), PHONE_ID ${PHONE_ID.length} cifre, finisce con ${PHONE_ID.slice(-4)}`);
  });
