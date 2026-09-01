// ============================================================================
// send-email — invia un'email per conto di un'azienda del SaaS (ordine al
// fornitore, sollecito di pagamento a un cliente...).
//
// Nel gestionale attuale (index.html) l'invio passa da uno script Google
// Apps Script il cui URL è salvato per ogni azienda in Impostazioni: un
// espediente ragionevole per un gestionale a singolo tenant, ma scomodo da
// chiedere a un cliente del SaaS (dovrebbe crearsi e collegare un proprio
// script Google). Qui, come ai-proxy per l'IA e stripe-checkout per i
// pagamenti, la chiave del provider (Resend) vive SOLO come secret del
// server: il browser non la vede mai, e ogni chiamata richiede una sessione
// utente autenticata appartenente ad almeno un'azienda.
//
// NOTA IMPORTANTE PER CHI RIPRENDE QUESTO LAVORO: come stripe-checkout, non
// ancora collaudata con un account Resend reale — non ne esisteva uno al
// momento di scriverla. Finché RESEND_FROM non è impostato su un dominio
// verificato dall'azienda su Resend, le email partono dal loro indirizzo
// sandbox (onboarding@resend.dev) — funziona per il collaudo, ma un
// destinatario vede quel mittente, non quello dell'azienda.
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_URL = 'https://api.resend.com/emails';

// Vedi la stessa nota in ai-proxy/index.ts: senza questi header il
// preflight OPTIONS che il browser manda prima del POST (Content-Type
// json + Authorization) riceveva 405 e la richiesta vera non partiva mai.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

interface SendEmailBody {
  to?: string;
  subject?: string;
  html?: string;
  attachmentBase64?: string;
  attachmentFilename?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'metodo non consentito, usa POST' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'accesso richiesto' }, 401);
  }

  // Stessa verifica di ai-proxy: la sessione deve essere vera (non basta la
  // chiave anon pubblica) e appartenere a un utente con almeno un'azienda,
  // altrimenti un account creato ma mai registrato potrebbe consumare la
  // quota email condivisa.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: 'sessione non valida o scaduta' }, 401);
  }

  const { data: memberships, error: memErr } = await supabase
    .from('my_memberships')
    .select('company_id')
    .limit(1);
  if (memErr || !memberships || memberships.length === 0) {
    return json({ error: 'nessuna azienda associata a questo utente' }, 403);
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    return json({ error: 'invio email non configurato sul server' }, 500);
  }
  const from = Deno.env.get('RESEND_FROM') || 'onboarding@resend.dev';

  let body: SendEmailBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'corpo della richiesta non valido (JSON atteso)' }, 400);
  }

  const to = (body.to || '').trim();
  const subject = (body.subject || '').trim();
  const html = body.html || '';
  if (!to || to.indexOf('@') < 0) return json({ error: 'destinatario mancante o non valido' }, 400);
  if (!subject) return json({ error: 'oggetto mancante' }, 400);
  if (!html) return json({ error: 'corpo del messaggio mancante' }, 400);

  const payload: Record<string, unknown> = { from, to: [to], subject, html };
  if (body.attachmentBase64 && body.attachmentFilename) {
    payload.attachments = [{ filename: body.attachmentFilename, content: body.attachmentBase64 }];
  }

  let upstream: Response;
  try {
    upstream = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: 'errore di rete verso il provider email: ' + String(e) }, 502);
  }

  // Passata così com'è, come ai-proxy: un errore di Resend (es. dominio non
  // verificato) arriva al client con lo stesso messaggio che darebbe Resend
  // stesso, senza doverlo tradurre qui.
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});
