// ============================================================================
// ai-proxy — la chiave IA non è più nel browser di nessuno.
//
// Nel gestionale attuale (index.html) la chiave dell'IA vive nelle
// impostazioni di ogni azienda (DB.azienda.aiKey / aiOkey), quindi nel
// browser di chi la usa — è la causa profonda del bug "la chiave sparisce"
// (un merge tra dispositivi la trattava come un campo qualunque) e, più in
// generale, non è accettabile per un prodotto venduto a terzi: la chiave di
// un cliente pagante non deve mai poter finire negli strumenti sviluppatore
// di un altro dipendente della stessa azienda, né di nessun altro.
//
// Questa funzione gira lato server (Supabase Edge Function, Deno) e fa da
// unico punto di passaggio verso Gemini: il browser non vede mai la chiave,
// il server non esegue mai una richiesta per conto di qualcuno che non sia
// un utente autenticato e appartenente ad almeno un'azienda.
//
// Il corpo della richiesta accettato è VOLUTAMENTE identico a quello che
// aiComplete() in index.html già costruisce per il provider 'openai'
// (l'endpoint compatibile OpenAI di Gemini): {model, temperature,
// max_tokens, messages}. Così, quando arriverà il momento di collegare
// l'assistente IA anche al prodotto multi-azienda, il codice che COSTRUISCE
// la richiesta non cambierà — cambierà solo a chi viene mandata (qui,
// invece che direttamente a Gemini).
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const GEMINI_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

// Chiamata dal browser (fatture-fornitore.html, fatture.html,
// assistente-ai.html) verso un'origine diversa (*.github.io qui,
// *.supabase.co la funzione): il POST con Content-Type: application/json e
// un header Authorization personalizzato non è una "simple request" CORS,
// quindi il browser manda prima un preflight OPTIONS. Senza questi header
// il preflight riceveva 405 (vedi il controllo "solo POST" più sotto) e il
// browser bloccava la richiesta vera e propria PRIMA che arrivasse qui —
// il bug reale dietro "l'importazione da PDF restituisce un errore".
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
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

  // Verifica CHI sta chiamando: non basta la chiave pubblica anon (quella la
  // legge chiunque apra la pagina), serve una sessione utente autenticata
  // vera. Creiamo un client Supabase che usa il token del chiamante, non
  // credenziali del server, così supabase.auth.getUser() risponde per
  // l'utente reale dietro questa richiesta.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: 'sessione non valida o scaduta' }, 401);
  }

  // Un account senza nessuna azienda associata (creato ma non ancora
  // registrato/collegato a una company) non deve poter consumare la quota
  // IA condivisa: verifichiamo che appartenga ad almeno un'azienda.
  const { data: memberships, error: memErr } = await supabase
    .from('my_memberships')
    .select('company_id')
    .limit(1);
  if (memErr || !memberships || memberships.length === 0) {
    return json({ error: 'nessuna azienda associata a questo utente' }, 403);
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return json({ error: 'chiave IA non configurata sul server' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'corpo della richiesta non valido (JSON atteso)' }, 400);
  }

  // Punto 4 del piano di miglioramento IA: il client sceglie il modello
  // (store.aiComplete({model}) — 'gemini-2.5-flash' per la chat,
  // 'gemini-2.5-pro' per leggere un allegato, dove un errore di lettura ha
  // conseguenze economiche reali), ma qui, lato server, un elenco chiuso:
  // un valore non previsto (bug del client, o richiesta forgiata a mano
  // con la sessione di un utente vero) non deve poter far girare la chiave
  // condivisa su un modello arbitrario — ricade sul default economico
  // invece di essere passato a Gemini così com'è.
  const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-pro']);
  if (typeof body.model !== 'string' || !ALLOWED_MODELS.has(body.model)) {
    body.model = 'gemini-2.5-flash';
  }

  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${geminiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return json({ error: 'errore di rete verso il provider IA: ' + String(e) }, 502);
  }

  // La risposta (compreso un eventuale errore di Gemini: modello sbagliato,
  // richiesta malformata...) viene restituita così com'è: il client la
  // interpreta esattamente come farebbe con la chiamata diretta di oggi,
  // solo che qui non ha mai visto la chiave.
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});
