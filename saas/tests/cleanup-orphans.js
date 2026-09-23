#!/usr/bin/env node
/* ============================================================================
 * cleanup-orphans.js — spazza via le aziende di prova rimaste indietro.
 *
 * La fixture `company` (helpers/testCompany.js) cancella già tutto ciò che
 * un admin PUÒ cancellare via RLS a fine test (documenti, clienti,
 * fornitori, prodotti — vedi cleanupCompanyData lì dentro). Quello che non
 * può toccare è la riga dell'azienda stessa, la membership e l'utente
 * Supabase Auth: cancellarle richiede la service_role key, che la suite
 * dei test non usa mai (non è pensata per starci in giro).
 *
 * Questo script sì — va lanciato A PARTE, di tanto in tanto (a mano, o da
 * una pipeline dedicata), MAI come parte della suite stessa:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node cleanup-orphans.js [--dry-run]
 *
 * Riconosce le aziende di prova dal nome (prefisso "QA Test — ", assegnato
 * da testCompany.js) E da un'età minima (default 1 ora, per non incrociare
 * un test ancora in corso su un'altra macchina) — mai da altro: non tocca
 * MAI aziende senza quel prefisso esatto nel nome, quindi mai i dati veri
 * di un cliente.
 * ============================================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rixvgmzedwdzgavjewbm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MIN_AGE_MINUTES = Number(process.env.CLEANUP_MIN_AGE_MINUTES || 60);
const DRY_RUN = process.argv.includes('--dry-run');

if (!SERVICE_KEY) {
  console.error('Manca SUPABASE_SERVICE_ROLE_KEY nell\'ambiente — vedi il commento in testa a questo file.');
  console.error('Questa chiave NON va mai messa in un file committato: solo come variabile d\'ambiente al momento di lanciare lo script.');
  process.exit(1);
}

async function sb(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: init.prefer || 'return=representation',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60_000).toISOString();
  const orphans = await sb(
    `/rest/v1/companies?select=id,nome,created_at&nome=ilike.${encodeURIComponent('QA Test*')}&created_at=lt.${encodeURIComponent(cutoff)}`
  );

  if (!orphans.length) {
    console.log('Nessuna azienda di prova da ripulire.');
    return;
  }

  console.log(`${orphans.length} aziende di prova trovate (più vecchie di ${MIN_AGE_MINUTES} minuti):`);
  orphans.forEach(o => console.log(`  - ${o.nome} (${o.id}, creata ${o.created_at})`));

  if (DRY_RUN) {
    console.log('\n--dry-run: nessuna cancellazione eseguita.');
    return;
  }

  for (const o of orphans) {
    // ON DELETE CASCADE su company_id (vedi migrations/0003_documenti.sql e
    // 0001_aziende_e_utenti.sql) si porta via da solo memberships e ogni
    // riga documento/anagrafica di quell'azienda — un'unica DELETE basta.
    await sb(`/rest/v1/companies?id=eq.${o.id}`, { method: 'DELETE', prefer: 'return=minimal' });
    console.log(`  cancellata: ${o.nome}`);
  }

  // Gli utenti Auth restano finché non li si cancella esplicitamente (non
  // sono legati da una FK cancellabile a cascata): via l'endpoint admin,
  // solo per le email col prefisso di prova usato da testCompany.js/
  // permessi.spec.js — mai per altre email.
  const users = await sb('/auth/v1/admin/users?per_page=1000');
  const testUsers = (users.users || []).filter(u => /^qa-(op-)?[a-z0-9]+@example\.com$/.test(u.email));
  for (const u of testUsers) {
    await sb(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE', prefer: 'return=minimal' });
    console.log(`  utente di prova cancellato: ${u.email}`);
  }

  console.log(`\nFatto: ${orphans.length} aziende e ${testUsers.length} utenti di prova rimossi.`);
}

main().catch(err => { console.error(err); process.exit(1); });
