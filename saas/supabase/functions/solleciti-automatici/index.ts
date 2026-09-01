// ============================================================================
// solleciti-automatici — manda da sola un promemoria di pagamento ai clienti
// con fatture scadute, senza bisogno che qualcuno apra Scadenziario e
// clicchi "Invia sollecito" ogni volta.
//
// Diversa da ai-proxy/send-email/stripe-checkout per un motivo strutturale:
// non la chiama un utente loggato dal browser per la PROPRIA azienda, la
// chiama un job schedulato (Supabase Cron / pg_cron, vedi README) una volta
// al giorno per TUTTE le aziende che hanno attivato l'opzione — quindi non
// c'è nessuna sessione utente da verificare, e usa SUPABASE_SERVICE_ROLE_KEY
// (bypassa la RLS) invece della sessione del chiamante. Al suo posto, la
// protezione è un segreto condiviso a sé (CRON_SECRET, header
// X-Cron-Secret): senza saperlo, nessuno può far scattare un invio reale a
// clienti veri semplicemente conoscendo l'URL della funzione.
//
// L'aritmetica (payTot/ncCreditoFor/payState/dueDate) è una porta 1:1 di
// scadenziario.html — stessa logica già collaudata da test90_scadenziario.py
// — e la scelta "chi è scaduto, di quanto" resta identica a quella che vede
// l'utente aprendo Scadenziario a mano.
//
// Ogni fattura riceve al massimo UN sollecito automatico: appena inviato,
// si segna extra.sollecitoAutoInviato (colonna extra già esistente,
// fatture_cliente ha hasExtra:true — nessuna migrazione necessaria) e non
// viene più riconsiderata da questa funzione. Un admin può comunque mandarne
// uno a mano in più da Scadenziario in qualunque momento: i due percorsi non
// si escludono a vicenda.
//
// Supporta {"dryRun": true} nel corpo: calcola tutto ma non manda nessuna
// email né scrive extra — usato per verificare il comportamento contro dati
// veri senza rischiare di disturbare clienti reali.
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_URL = 'https://api.resend.com/emails';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// ---- stessa aritmetica di scadenziario.html ------------------------------
interface Riga { qty?: number; prezzo?: number; sconto?: string; iva?: number; }
interface Fattura {
  id: string; num: string; data: string; cliente_id: string; righe: Riga[];
  paid?: boolean; pagamenti?: { importo?: number }[]; extra?: Record<string, unknown> | null;
}
interface NotaCredito { righe: Riga[]; extra?: { ftId?: string; ftIds?: string[] } | null; }
interface Cliente { id: string; nome: string; email?: string | null; term?: string | number | null; }

function scParts(s: string | null | undefined): number[] {
  return String(s == null ? '' : s).split('+').map(x => parseFloat(String(x).trim()) || 0);
}
function scFactor(s: string | null | undefined): number {
  return scParts(s).reduce((f, p) => f * (1 - p / 100), 1);
}
function lineNet(x: Riga): number { return (x.qty || 0) * (x.prezzo || 0) * scFactor(x.sconto); }
function imp(righe: Riga[]): number { return (righe || []).reduce((s, x) => s + lineNet(x), 0); }
function ivaT(righe: Riga[]): number { return (righe || []).reduce((s, x) => s + lineNet(x) * (x.iva || 0) / 100, 0); }
function tot(righe: Riga[]): number { return imp(righe) + ivaT(righe); }
function payTot(it: Fattura): number {
  if (it.pagamenti == null || it.pagamenti.length === 0) return it.paid ? tot(it.righe) : 0;
  return it.pagamenti.reduce((s, p) => s + (p.importo || 0), 0);
}
function ncCreditoFor(nc: NotaCredito, ftNum: string, fattureCache: Fattura[]): number {
  const extra = nc.extra || {};
  const ids = extra.ftIds && extra.ftIds.length ? extra.ftIds : (extra.ftId ? [extra.ftId] : []);
  if (!ids.includes(ftNum)) return 0;
  if (ids.length <= 1) return tot(nc.righe);
  let remaining = tot(nc.righe);
  const ordered = ids.map(n => fattureCache.find(f => f.num === n)).filter(Boolean)
    .sort((a, b) => (a!.data || '').localeCompare(b!.data || '')) as Fattura[];
  for (const f of ordered) {
    if (remaining <= 0) break;
    const alloc = Math.min(remaining, tot(f.righe));
    if (f.num === ftNum) return alloc;
    remaining -= alloc;
  }
  return 0;
}
function residuo(it: Fattura, noteCredito: NotaCredito[], fattureCache: Fattura[]): number {
  const totaleRaw = tot(it.righe);
  const sign = totaleRaw < 0 ? -1 : 1;
  const totale = totaleRaw * sign;
  const creditato = it.num ? noteCredito.reduce((s, nc) => s + ncCreditoFor(nc, it.num, fattureCache), 0) : 0;
  const pagato = (payTot(it) + creditato) * sign;
  return Math.max(0, totale - pagato) * sign;
}
function dueDate(cliente: Cliente | undefined, fattura: Fattura, oggi: string): string {
  const days = cliente && cliente.term != null && cliente.term !== '' ? parseInt(String(cliente.term)) : 30;
  const d = new Date((fattura.data || oggi) + 'T00:00:00');
  d.setDate(d.getDate() + (isNaN(days) ? 30 : days));
  return d.toISOString().slice(0, 10);
}
function esc(s: unknown): string {
  return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
function eur(n: number): string {
  return (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}
function fdate(s: string): string {
  return new Date(s).toLocaleDateString('it-IT');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'metodo non consentito, usa POST' }, 405);

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('X-Cron-Secret') !== cronSecret) {
    return json({ error: 'non autorizzato' }, 401);
  }

  let body: { dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* corpo vuoto: va bene, dryRun resta false */ }
  const dryRun = body.dryRun === true;

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromAddress = Deno.env.get('RESEND_FROM') || 'onboarding@resend.dev';
  const platformName = Deno.env.get('PLATFORM_NAME') || 'il gestionale';
  if (!resendKey && !dryRun) return json({ error: 'invio email non configurato sul server' }, 500);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const oggi = new Date().toISOString().slice(0, 10);
  const results: unknown[] = [];

  const { data: companies, error: compErr } = await admin
    .from('companies').select('id, nome, settings')
    .eq('settings->>solleciti_auto', 'true');
  if (compErr) return json({ error: 'errore nel leggere le aziende: ' + compErr.message }, 500);

  for (const company of companies || []) {
    const companyResult: Record<string, unknown> = { company: company.nome, id: company.id };
    try {
      const soglia = Math.max(1, parseInt(String((company.settings || {}).solleciti_giorni)) || 7);
      const replyTo = ((company.settings || {}).email || '').trim();

      const [{ data: clienti, error: cliErr }, { data: fatture, error: ftErr }, { data: noteCredito, error: ncErr }] = await Promise.all([
        admin.from('clienti').select('id, nome, email, term').eq('company_id', company.id),
        admin.from('fatture_cliente').select('id, num, data, cliente_id, righe, paid, pagamenti, extra').eq('company_id', company.id),
        admin.from('note_credito').select('righe, extra').eq('company_id', company.id),
      ]);
      if (cliErr || ftErr || ncErr) throw new Error((cliErr || ftErr || ncErr)!.message);

      const clientiById = new Map<string, Cliente>((clienti || []).map(c => [c.id, c]));
      const fattureCache = (fatture || []) as Fattura[];

      // Per cliente: le fatture scadute da almeno "soglia" giorni, non ancora
      // sollecitate in automatico, con un residuo reale — esattamente lo
      // stesso filtro che vede l'utente in Scadenziario, più la soglia
      // giorni e il "solo una volta per fattura".
      const daInviare = new Map<string, { cliente: Cliente; righe: { num: string; data: string; scadenza: string; importo: number }[]; fattureIds: string[] }>();
      for (const f of fattureCache) {
        const extra = (f.extra || {}) as Record<string, unknown>;
        if (extra.sollecitoAutoInviato) continue;
        const cliente = clientiById.get(f.cliente_id);
        const res = residuo(f, (noteCredito || []) as NotaCredito[], fattureCache);
        if (res <= 0) continue;
        const scad = dueDate(cliente, f, oggi);
        if (scad >= oggi) continue;
        const gg = Math.round((new Date(oggi).getTime() - new Date(scad).getTime()) / 86400000);
        if (gg < soglia) continue;
        if (!cliente || !cliente.email) continue; // nessun indirizzo, nessun invio possibile

        const bucket = daInviare.get(cliente.id) || { cliente, righe: [], fattureIds: [] };
        bucket.righe.push({ num: f.num, data: f.data, scadenza: scad, importo: res });
        bucket.fattureIds.push(f.id);
        daInviare.set(cliente.id, bucket);
      }

      let clientiSollecitati = 0, fattureIncluse = 0;
      const errors: string[] = [];
      for (const { cliente, righe, fattureIds } of daInviare.values()) {
        fattureIncluse += righe.length;
        if (dryRun) { clientiSollecitati++; continue; }
        try {
          const totRaw = righe.reduce((s, r) => s + r.importo, 0);
          const rowsHtml = righe.map(r => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(r.num)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${fdate(r.data)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${fdate(r.scadenza)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right"><b>${eur(r.importo)}</b></td></tr>`).join('');
          const html = `<p>Gentile ${esc(cliente.nome)},</p><p>Risultano scadute e non ancora saldate le seguenti fatture (promemoria automatico):</p>
            <table style="border-collapse:collapse;width:100%"><thead><tr>
              <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #333">Fattura</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #333">Emessa</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #333">Scadenza</th>
              <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #333">Importo</th>
            </tr></thead><tbody>${rowsHtml}</tbody></table>
            <p style="text-align:right;font-weight:700">Totale: ${eur(totRaw)}</p>`;

          const fromName = esc(company.nome).replace(/&amp;/g, '&');
          const from = `${fromName} (tramite ${platformName}) <${fromAddress}>`;
          const payload: Record<string, unknown> = { from, to: [cliente.email], subject: `Sollecito pagamento — ${company.nome}`, html };
          if (replyTo) payload.reply_to = replyTo;

          const upstream = await fetch(RESEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
            body: JSON.stringify(payload),
          });
          if (!upstream.ok) throw new Error(`Resend ${upstream.status}: ${await upstream.text()}`);

          const now = new Date().toISOString();
          for (const id of fattureIds) {
            const { data: row } = await admin.from('fatture_cliente').select('extra').eq('id', id).single();
            const mergedExtra = Object.assign({}, (row || {}).extra || {}, { sollecitoAutoInviato: now });
            await admin.from('fatture_cliente').update({ extra: mergedExtra }).eq('id', id);
          }
          clientiSollecitati++;
        } catch (e) {
          errors.push(`${cliente.nome}: ${String(e)}`);
        }
      }

      companyResult.clientiSollecitati = clientiSollecitati;
      companyResult.fattureIncluse = fattureIncluse;
      if (errors.length) companyResult.errors = errors;
    } catch (e) {
      companyResult.error = String(e);
    }
    results.push(companyResult);
  }

  return json({ dryRun, companiesChecked: (companies || []).length, results });
});
