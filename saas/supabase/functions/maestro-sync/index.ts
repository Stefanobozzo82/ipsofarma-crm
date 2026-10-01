import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createMaestroSyncHandler, type Row } from './handler.ts';

// Service role: l'agente non ha un utente collegato; l'accesso è deciso dalla
// chiave per azienda verificata nel handler, e ogni scrittura porta il
// company_id ricavato da quella chiave, mai uno inviato dal client.
const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});

Deno.serve(createMaestroSyncHandler({
  async companyForKeyHash(hash) {
    const { data, error } = await db.from('maestro_sync_keys').select('company_id').eq('key_hash', hash).is('revocata_at', null).maybeSingle();
    if (error) throw error;
    if (data) await db.from('maestro_sync_keys').update({ usata_at: new Date().toISOString() }).eq('key_hash', hash);
    return data ? data.company_id : null;
  },
  async existingHashes(companyId, tabella) {
    const map = new Map<string, string>();
    let from = 0;
    for (;;) {
      const { data, error } = await db.from('maestro_records').select('chiave,hash')
        .eq('company_id', companyId).eq('tabella', tabella).order('chiave').range(from, from + 999);
      if (error) throw error;
      data.forEach(r => map.set(r.chiave, r.hash));
      if (data.length < 1000) return map;
      from += 1000;
    }
  },
  async upsert(rows: Row[]) {
    const { error } = await db.from('maestro_records').upsert(rows.map(r => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'company_id,tabella,chiave' });
    if (error) throw error;
  },
  async startRun(companyId, tabella, meta) {
    const { data, error } = await db.from('maestro_sync_runs').insert({ company_id: companyId, tabella, stato: 'in_corso', report: meta }).select('id').single();
    if (error) throw error;
    return data.id;
  },
  async finishRun(runId, stato, report) {
    await db.from('maestro_sync_runs').update({ stato, report, finito_at: new Date().toISOString() }).eq('id', runId);
  },
  async importDocuments(companyId) {
    const { data, error } = await db.rpc('maestro_import', { p_company_id: companyId });
    if (error) throw new Error(error.message);
    return data;
  },
}));
