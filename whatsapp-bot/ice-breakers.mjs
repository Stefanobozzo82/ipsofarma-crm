// Imposta (o legge) i pulsanti di avvio che WhatsApp mostra la prima volta che si apre la chat.
// Uso:  node --env-file=.env ice-breakers.mjs          -> imposta i pulsanti
//       node --env-file=.env ice-breakers.mjs leggi    -> mostra quelli attuali
// Regole di Meta: massimo 4 pulsanti, massimo 80 caratteri ciascuno, niente emoji.
// Le frasi devono coincidere con i nomi dei servizi in bot.mjs (e "Altri servizi" apre il menu).
const clean = (v) => v?.trim().replace(/^["']|["']$/g, '').trim();
const WA_TOKEN = clean(process.env.WA_TOKEN);
const PHONE_ID = clean(process.env.PHONE_ID);
if (!WA_TOKEN || !PHONE_ID) {
  console.error('Mancano WA_TOKEN e PHONE_ID nel file .env');
  process.exit(1);
}

const PROMPTS = ['Misurazione pressione', 'Iniezione a domicilio', 'Prelievo del sangue', 'Altri servizi'];
const base = `https://graph.facebook.com/v22.0/${PHONE_ID}`;
const headers = { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' };

const leggi = process.argv[2] === 'leggi';
const res = leggi
  ? await fetch(`${base}?fields=conversational_automation`, { headers })
  : await fetch(`${base}/conversational_automation`, { method: 'POST', headers, body: JSON.stringify({ prompts: PROMPTS }) });
console.log(res.status, await res.text());
if (!leggi && res.ok) console.log('Fatto. Per controllare: node --env-file=.env ice-breakers.mjs leggi');
