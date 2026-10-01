// Riceve dall'agente sul PC di Maestro Gold un file della sua cartella dati
// (.DBF, più l'eventuale .DBT dei memo), compresso gzip, e ne salva i record
// in maestro_records (area di appoggio, una riga per record del file). Da lì
// l'import nei documenti del gestionale lavora senza più dipendere dal PC.
//
// Autenticazione: chiave dedicata per azienda (header x-maestro-key), creata
// dal gestionale con create_maestro_sync_key(); qui se ne confronta solo
// l'hash SHA-256. Nessun JWT utente: l'agente gira senza nessuno collegato.
import { readDbf } from './dbf.ts';

export const TABELLE_AMMESSE = new Set([
  'VENDITE', 'BOLLE', 'ORDINICL', 'ORDINI', 'ACQUISTI', 'PREVENTI',
  'CLIENTI', 'FORNITOR', 'ARTICOLI', 'DDTINFATT',
  'ARCART_V', 'ARCART_B', 'ARCART_L', 'ARCART_O', 'ARCART_A', 'ARCART_P',
]);
const MAX_BYTES = 80 * 1024 * 1024;
const BATCH = 500;

export type Row = { company_id: string; tabella: string; chiave: string; hash: string; deleted: boolean; dati: Record<string, unknown>; run_id: string };
export type Deps = {
  companyForKeyHash: (hash: string) => Promise<string | null>;
  existingHashes: (companyId: string, tabella: string) => Promise<Map<string, string>>;
  upsert: (rows: Row[]) => Promise<void>;
  startRun: (companyId: string, tabella: string, meta: Record<string, unknown>) => Promise<string>;
  finishRun: (runId: string, stato: 'ok' | 'errore', report: Record<string, unknown>) => Promise<void>;
  // Porta nei documenti del gestionale ciò che è cambiato (maestro_import).
  importDocuments?: (companyId: string) => Promise<Record<string, unknown>>;
};

export async function sha256hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function gunzip(file: File): Promise<Uint8Array> {
  const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  if (out.length > MAX_BYTES) throw new Error('file troppo grande');
  return out;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

// Impronta per riconoscere un record cambiato tra un invio e l'altro: non
// serve che sia crittografica, serve che sia veloce (decine di migliaia di
// record per file, dentro il limite di CPU della Edge Function).
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + text.length.toString(16);
}

export function createMaestroSyncHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: 'metodo non ammesso' }, 405);
    const key = req.headers.get('x-maestro-key') || '';
    if (!/^msk_[0-9a-f]{48}$/.test(key)) return json({ error: 'chiave mancante o non valida' }, 401);
    const companyId = await deps.companyForKeyHash(await sha256hex(key));
    if (!companyId) return json({ error: 'chiave non riconosciuta' }, 401);

    let form: FormData;
    try { form = await req.formData(); } catch { return json({ error: 'richiesta non leggibile' }, 400); }
    const tabella = String(form.get('tabella') || '').toUpperCase();
    if (!TABELLE_AMMESSE.has(tabella)) return json({ error: `tabella non gestita: ${tabella}` }, 400);
    const dbfFile = form.get('dbf'), dbtFile = form.get('dbt');
    if (!(dbfFile instanceof File)) return json({ error: 'file DBF mancante' }, 400);

    const runId = await deps.startRun(companyId, tabella, {
      modificato: String(form.get('modificato') || ''), agente: String(form.get('agente') || ''),
    });
    try {
      const dbf = await gunzip(dbfFile);
      const dbt = dbtFile instanceof File ? await gunzip(dbtFile) : null;
      const { records } = readDbf(dbf, dbt);
      const before = await deps.existingHashes(companyId, tabella);
      const rows: Row[] = [];
      let nuovi = 0, modificati = 0;
      for (const r of records) {
        const chiave = String(r.index);
        const hash = fingerprint([r.deleted, r.values]);
        const prev = before.get(chiave);
        if (prev === hash) continue;
        if (prev === undefined) nuovi++; else modificati++;
        rows.push({ company_id: companyId, tabella, chiave, hash, deleted: r.deleted, dati: r.values, run_id: runId });
      }
      for (let i = 0; i < rows.length; i += BATCH) await deps.upsert(rows.slice(i, i + BATCH));
      const report = { tabella, record: records.length, nuovi, modificati, invariati: records.length - nuovi - modificati };
      await deps.finishRun(runId, 'ok', report);
      // L'import gira solo se il file ha portato novità; un suo errore non fa
      // fallire l'invio: i record restano salvati e il giro dopo riprova.
      let importReport: Record<string, unknown> | undefined;
      if (deps.importDocuments && rows.length) {
        try { importReport = await deps.importDocuments(companyId); }
        catch (err) { importReport = { errore: err instanceof Error ? err.message : String(err) }; }
      }
      return json({ ok: true, ...report, ...(importReport ? { import: importReport } : {}) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deps.finishRun(runId, 'errore', { tabella, errore: message });
      return json({ error: message }, 422);
    }
  };
}
