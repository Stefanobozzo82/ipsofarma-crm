// Sostituisce fetch durante i test: nessuna chiamata di rete vera.
// Scrive quello che il bot avrebbe inviato a Meta, a Supabase e a Resend in file .jsonl nella cartella corrente.
import { appendFileSync } from 'node:fs';

const salva = (file, obj) => appendFileSync(file, JSON.stringify(obj) + '\n');

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : null;

  if (u.includes('api.resend.com')) {
    salva('mail.jsonl', body);
    return new Response('{"id":"finto"}', { status: process.env.FAKE_MAIL === '500' ? 500 : 200 });
  }
  if (u.includes('/rpc/bot_salva_prenotazione')) {
    salva('db.jsonl', { url: u, headers: Object.keys(opts.headers ?? {}), body });
    return new Response('"id-finto"', { status: process.env.FAKE_DB === 'giu' ? 500 : 200 });
  }
  if (u.includes('graph.facebook.com')) {
    salva('meta-out.jsonl', body);
    return new Response('{}', { status: 200 });
  }
  throw new Error(`Chiamata di rete inattesa durante il test: ${u}`);
};
