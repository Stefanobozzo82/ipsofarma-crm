// Imposta (o legge) il profilo dell'attività che la persona vede aprendo i dati del contatto su WhatsApp.
// Uso:  node --env-file=.env profile.mjs          -> imposta il profilo
//       node --env-file=.env profile.mjs leggi    -> mostra il profilo attuale
// Limiti di Meta: "about" 1-139 caratteri, "description" max 512, "address" max 256, "email" max 128.
// ATTENZIONE: tutto quello che scrivi qui è PUBBLICO. Indirizzo, email e sito sono facoltativi e restano
// vuoti se non li imposti nel .env con PROFILE_ADDRESS, PROFILE_EMAIL, PROFILE_WEBSITE.
const clean = (v) => v?.trim().replace(/^["']|["']$/g, '').trim();
const WA_TOKEN = clean(process.env.WA_TOKEN);
const PHONE_ID = clean(process.env.PHONE_ID);
if (!WA_TOKEN || !PHONE_ID) {
  console.error('Mancano WA_TOKEN e PHONE_ID nel file .env');
  process.exit(1);
}

// ---- modifica qui i testi ----
const ABOUT = 'Prenotazioni a domicilio: pressione, iniezioni, prelievi, visite e ritiro referti. Non diamo consigli medici.';
const DESCRIPTION =
  'Ipsofarma porta a casa tua la misurazione della pressione, le iniezioni, i prelievi del sangue, ' +
  'le visite e le analisi, il ritiro di referti e farmaci.\n' +
  'Scrivici qui per prenotare: ti guidiamo passo passo.\n' +
  'Questo servizio serve solo a prenotare e non fornisce consigli medici.';
// ------------------------------

const profilo = { messaging_product: 'whatsapp', about: ABOUT, description: DESCRIPTION, vertical: 'HEALTH' };
if (clean(process.env.PROFILE_ADDRESS)) profilo.address = clean(process.env.PROFILE_ADDRESS);
if (clean(process.env.PROFILE_EMAIL)) profilo.email = clean(process.env.PROFILE_EMAIL);
if (clean(process.env.PROFILE_WEBSITE)) profilo.websites = [clean(process.env.PROFILE_WEBSITE)];

const limiti = { about: [1, 139], description: [0, 512], address: [0, 256], email: [0, 128] };
for (const [campo, [min, max]] of Object.entries(limiti)) {
  const n = profilo[campo]?.length;
  if (n === undefined) continue;
  if (n < min || n > max) {
    console.error(`Il campo "${campo}" è lungo ${n} caratteri: deve stare tra ${min} e ${max}.`);
    process.exit(1);
  }
}

const base = `https://graph.facebook.com/v22.0/${PHONE_ID}/whatsapp_business_profile`;
const headers = { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' };
const nascondi = (t) => String(t).split(WA_TOKEN).join('[token nascosto]');

const leggi = process.argv[2] === 'leggi';
const res = leggi
  ? await fetch(`${base}?fields=about,address,description,email,websites,vertical`, { headers })
  : await fetch(base, { method: 'POST', headers, body: JSON.stringify(profilo) });
console.log(res.status, nascondi(await res.text()));
if (!leggi && res.ok) console.log('Fatto. Per controllare: node --env-file=.env profile.mjs leggi');
