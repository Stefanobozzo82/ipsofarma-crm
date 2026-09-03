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
// Il corpo della richiesta è quasi identico a quello che aiComplete() in
// index.html già costruisce per il provider 'openai' (l'endpoint compatibile
// OpenAI di Gemini): {model, temperature, max_tokens, messages}, con
// l'aggiunta di companyId (0011_limite_ai.sql) — necessario per sapere per
// quale azienda contare la chiamata contro il limite mensile, tolto dal
// corpo prima di inoltrarlo a Gemini (che non lo conosce).
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'corpo della richiesta non valido (JSON atteso)' }, 400);
  }

  // companyId identifica PER QUALE azienda contare questa chiamata contro
  // il limite mensile (0011_limite_ai.sql) — store.aiComplete() lo manda
  // sempre ora. Verifichiamo che l'utente appartenga davvero a quella
  // azienda specifica (non "ad almeno una qualunque", come prima di avere
  // un limite per-azienda: senza questo controllo, chi appartiene a più
  // aziende potrebbe far consumare la quota di un'azienda a cui non
  // appartiene passandone semplicemente l'id).
  const companyId = typeof body.companyId === 'string' ? body.companyId : '';
  if (!companyId) {
    return json({ error: 'companyId mancante' }, 400);
  }
  const { data: memberships, error: memErr } = await supabase
    .from('my_memberships')
    .select('company_id');
  if (memErr || !memberships || !memberships.some((m) => m.company_id === companyId)) {
    return json({ error: 'non fai parte di questa azienda' }, 403);
  }

  // Limite mensile di chiamate IA per azienda (0011_limite_ai.sql): un
  // freno sul costo, non sui documenti — la chiave Gemini è UNA sola,
  // condivisa da tutte le aziende del SaaS, quindi un uso molto intenso da
  // parte di una sola azienda costerebbe uguale a nessun uso, a parità di
  // abbonamento, se non ci fosse questo controllo.
  const { data: company, error: companyErr } = await supabase
    .from('companies').select('piano').eq('id', companyId).single();
  if (companyErr || !company) {
    return json({ error: 'azienda non trovata' }, 404);
  }
  const { data: plan } = await supabase
    .from('plans').select('nome, limite_ai_mese').eq('id', company.piano).maybeSingle();
  if (plan && plan.limite_ai_mese != null) {
    const { data: count, error: countErr } = await supabase
      .rpc('count_ai_usage_this_month', { p_company_id: companyId });
    if (countErr) {
      return json({ error: 'errore nel controllo del limite IA: ' + countErr.message }, 500);
    }
    if ((count ?? 0) >= plan.limite_ai_mese) {
      return json({
        error: `Hai raggiunto il limite mensile di ${plan.limite_ai_mese} richieste IA del piano "${plan.nome}". Riprova dal mese prossimo, oppure passa a un piano superiore in Impostazioni → Abbonamento.`,
      }, 429);
    }
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return json({ error: 'chiave IA non configurata sul server' }, 500);
  }

  // Punto 4 del piano di miglioramento IA: il client sceglie il modello
  // (store.aiComplete({model}) — 'gemini-2.5-flash' per la chat,
  // 'gemini-3.5-flash' per leggere un allegato o interpretare
  // un'istruzione, dove un errore ha conseguenze economiche reali), ma
  // qui, lato server, un elenco chiuso: un valore non previsto (bug del
  // client, o richiesta forgiata a mano con la sessione di un utente
  // vero) non deve poter far girare la chiave condivisa su un modello
  // arbitrario — ricade sul default economico invece di essere passato
  // a Gemini così com'è.
  //
  // 'gemini-2.5-pro' ritirato da qui (era l'unico modello "pro"
  // consentito): Google lo ha spento per questa chiave — "This model
  // models/gemini-2.5-pro is no longer available to new users" (404,
  // scoperto indagando "Lettura non riuscita: errore HTTP 404" su un
  // import PDF reale). Il rimpiazzo che Google stessa indica in
  // quell'errore ('gemini-3.1-pro-preview') si è rivelato IRRAGGIUNGIBILE
  // su questa chiave — verificato con una chiamata reale: 429
  // "RESOURCE_EXHAUSTED", limit 0, per ogni modello della famiglia "pro"
  // (gemini-3.1-pro-preview, gemini-pro-latest...). Non è un limite
  // temporaneo: sul livello gratuito di Gemini i modelli "pro" hanno
  // quota ZERO, serve fatturazione abilitata sul progetto Google — mai
  // fatto qui. Sostituito quindi con 'gemini-3.5-flash': non "pro", ma il
  // modello "flash" (quindi gratuito) più recente e capace verificato
  // davvero raggiungibile con questa chiave — con una chiamata reale
  // sulla fattura del cliente che aveva segnalato il bug, risposta
  // corretta (fornitore/numero/righe/lotti tutti riconosciuti).
  const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-3.5-flash']);
  if (typeof body.model !== 'string' || !ALLOWED_MODELS.has(body.model)) {
    body.model = 'gemini-2.5-flash';
  }
  // companyId non fa parte dello schema che Gemini si aspetta (era solo
  // per il controllo qui sopra): non lo inoltriamo.
  delete body.companyId;

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

  // Registrata DOPO la chiamata (non prima di provare a fare la richiesta,
  // né solo sui successi): rispecchia meglio "quante volte abbiamo
  // effettivamente occupato la chiave condivisa", indipendentemente da come
  // Gemini ha risposto. Un fallimento qui non deve far sembrare fallita una
  // risposta IA che invece è arrivata bene — vedi la stessa scelta altrove
  // in questo progetto (un errore di bookkeeping non blocca l'operazione
  // principale già riuscita).
  try {
    await supabase.from('ai_usage').insert({ company_id: companyId });
  } catch (_e) { /* non blocca la risposta */ }

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
