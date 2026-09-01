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
// Distribuita e collaudata con un invio reale (vedi README). Resta in
// modalità sandbox finché RESEND_FROM non punta a un dominio verificato:
// fino ad allora Resend accetta solo invii verso l'indirizzo del titolare
// dell'account.
//
// Un solo RESEND_API_KEY/RESEND_FROM per TUTTO il SaaS, non uno per
// azienda cliente: sarebbe scomodo chiedere a ogni farmacia cliente di
// crearsi un account Resend e verificare un proprio dominio solo per
// mandare un ordine a un fornitore. La soluzione qui è quella che usa la
// maggior parte dei gestionali in cloud: un mittente unico della
// piattaforma, ma con nome visualizzato e "Rispondi a" personalizzati
// sull'azienda che sta scrivendo (fromName/replyTo nel corpo, letti dal
// chiamante da companies.nome/companies.settings.email) — il destinatario
// vede "Farmacia Rossi (tramite Ipsofarma) <notifiche@dominio>" come
// mittente, e se risponde la mail arriva davvero alla farmacia Rossi, non
// alla piattaforma. Un'azienda che ha già un proprio dominio potrà in
// futuro verificarlo separatamente su Resend (un account Resend può
// avere più domini) e passare a un from dedicato — non ancora costruito,
// perché nessun cliente reale ne ha bisogno oggi.
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
  fromName?: string;   // nome dell'azienda cliente da mostrare come mittente
  replyTo?: string;    // email dell'azienda cliente: le risposte arrivano a lei, non alla piattaforma
}

// Un nome mittente finisce dentro l'header "From: NOME <indirizzo>" —
// niente virgolette o ritorni a capo, altrimenti si potrebbe spezzare
// l'header o iniettarne altri.
function sanitizeHeaderName(s: string): string {
  return s.replace(/[\r\n"<>]/g, '').trim().slice(0, 120);
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
  const fromAddress = Deno.env.get('RESEND_FROM') || 'onboarding@resend.dev';

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

  // "Farmacia Rossi (tramite <PLATFORM_NAME>) <notifiche@dominio>" invece
  // del solo indirizzo nudo — vedi la nota in testa al file. Il nome della
  // piattaforma è un secret/env a sé (non "Ipsofarma": quella è solo LA
  // PRIMA azienda cliente, non il nome del prodotto SaaS) così cambia in
  // un punto solo il giorno in cui si sceglie un nome definitivo. Senza
  // fromName il comportamento resta quello di prima (solo l'indirizzo).
  const platformName = Deno.env.get('PLATFORM_NAME') || 'il gestionale';
  const fromName = body.fromName ? sanitizeHeaderName(body.fromName) : '';
  const from = fromName ? `${fromName} (tramite ${platformName}) <${fromAddress}>` : fromAddress;

  const payload: Record<string, unknown> = { from, to: [to], subject, html };
  const replyTo = (body.replyTo || '').trim();
  if (replyTo && replyTo.indexOf('@') > 0) payload.reply_to = replyTo;
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
