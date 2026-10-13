// Controlla il token di Meta nel file .env senza mostrarlo (nemmeno quando Meta lo ripete negli errori).
// Uso:  node --env-file=.env check-token.mjs
const clean = (v) => v?.trim().replace(/^["']|["']$/g, '').trim();
const TOKEN = clean(process.env.WA_TOKEN);
const PHONE_ID = clean(process.env.PHONE_ID);
if (!TOKEN || !PHONE_ID) { console.error('Mancano WA_TOKEN o PHONE_ID nel file .env'); process.exit(1); }

const get = async (path) => {
  const res = await fetch(`https://graph.facebook.com/v22.0/${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const nascondi = (t) => String(t ?? '').split(TOKEN).join('[token nascosto]');
const quando = (t) => (t ? new Date(t * 1000).toLocaleString('it-IT') : 'mai');

console.log(`Token: ${TOKEN.length} caratteri, inizia con "${TOKEN.slice(0, 3)}"`);

if (!/^[A-Za-z0-9_-]+$/.test(TOKEN)) {
  console.log('\nATTENZIONE: il token contiene caratteri non validi (spazi, "=", altre righe incollate).');
  console.log('Apri il file .env: WA_TOKEN deve contenere SOLO il token, e ogni variabile va su una riga a parte.');
}

const d = await get(`debug_token?input_token=${encodeURIComponent(TOKEN)}`);
if (d.body.error) {
  console.log(`\n1) Meta NON riconosce il token (codice ${d.body.error.code}): ${nascondi(d.body.error.message)}`);
  console.log(/expired/i.test(d.body.error.message)
    ? '   -> il token è SCADUTO: serve generarne uno nuovo.'
    : '   -> di solito è incompleto (copiato a metà), mescolato con altro testo, o revocato.');
} else {
  const x = d.body.data ?? {};
  console.log('\n1) Stato del token');
  console.log(`   valido: ${x.is_valid ? 'SÌ' : 'NO'}`);
  console.log(`   tipo: ${x.type ?? '?'}   app: ${x.application ?? '?'} (${x.app_id ?? '?'})`);
  console.log(`   scade: ${quando(x.expires_at)}`);
  console.log(`   permessi: ${(x.scopes ?? []).join(', ') || 'nessuno'}`);
  if (x.error) console.log(`   errore: ${nascondi(x.error.message)}`);
}

const p = await get(`${PHONE_ID}?fields=display_phone_number,verified_name`);
console.log('\n2) Accesso al numero di telefono');
if (p.body.error) console.log(`   NON riesce a leggere il numero ${PHONE_ID} (codice ${p.body.error.code}): ${nascondi(p.body.error.message)}`);
else console.log(`   OK: ${p.body.display_phone_number} (${p.body.verified_name})`);
