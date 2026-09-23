// ============================================================================
// stripe-checkout — avvia un abbonamento a pagamento.
//
// Come ai-proxy (Fase 3): un utente autenticato chiama questa funzione, mai
// direttamente Stripe. La chiave segreta Stripe resta un secret del server,
// mai vista dal browser. Chiamata Stripe fatta con fetch diretto verso la
// loro API REST (niente SDK npm: meno cose che possono non bundlare bene con
// "supabase functions deploy --use-api", e per due chiamate non serve).
//
// Collaudata con un checkout reale in sandbox Stripe (carta di test,
// abbonamento creato, companies aggiornata dal webhook — vedi
// stripe-webhook/index.ts).
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsForRequest } from '../_shared/cors.ts';

function allowedReturnUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const origins = (Deno.env.get('EDGE_ALLOWED_ORIGINS') ?? '').split(',').map(x => x.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && origins.includes(url.origin);
  } catch { return false; }
}

async function stripeRequest(path: string, params: Record<string, string>, secretKey: string, idempotencyKey?: string) {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ha risposto HTTP ${res.status}`);
  return data;
}

Deno.serve(async (req: Request) => {
  const { headers: corsHeaders, allowed } = corsForRequest(req);
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
  if (!allowed) return json({ error: 'origine non consentita' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'metodo non consentito, usa POST' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'accesso richiesto' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'sessione non valida o scaduta' }, 401);

  let body: { action?: string; company_id?: string; plan_id?: string; success_url?: string; cancel_url?: string; return_url?: string };
  try {
    body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid body');
  } catch {
    return json({ error: 'corpo della richiesta non valido (JSON atteso)' }, 400);
  }
  const { company_id, plan_id, success_url, cancel_url, return_url } = body;
  const action = body.action ?? 'checkout';
  if (!['checkout', 'portal'].includes(action)) return json({error:'azione non valida'},400);
  if (typeof company_id !== 'string' || !company_id || (action === 'portal'
    ? !allowedReturnUrl(return_url)
    : (typeof plan_id !== 'string' || !plan_id || !allowedReturnUrl(success_url) || !allowedReturnUrl(cancel_url)))) {
    return json({ error: 'company_id, plan_id, success_url e cancel_url sono tutti obbligatori' }, 400);
  }

  // Solo un admin dell'azienda può avviare o cambiare l'abbonamento — non un
  // operatore qualunque. La query è già filtrata da RLS: se la riga non
  // torna, o l'utente non è membro di quest'azienda, o non è admin.
  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('role')
    .eq('company_id', company_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError) return json({ error: 'verifica autorizzazione non disponibile' }, 503);
  if (!membership || membership.role !== 'admin') {
    return json({ error: 'solo un amministratore dell\'azienda può gestire l\'abbonamento' }, 403);
  }

  if(action === 'portal'){
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if(!secretKey) return json({error:'gestione abbonamento non disponibile'},503);
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const {data: company, error} = await admin.from('companies').select('stripe_customer_id').eq('id',company_id).maybeSingle();
    if(error) return json({error:'azienda non disponibile'},503);
    if(!company?.stripe_customer_id) return json({error:'nessun profilo di fatturazione collegato'},409);
    try{
      const session = await stripeRequest('billing_portal/sessions', {customer:company.stripe_customer_id,return_url:return_url!,locale:'it'},secretKey);
      if(typeof session.url !== 'string' || !session.url.startsWith('https://billing.stripe.com/')) throw Error('invalid portal URL');
      return json({url:session.url});
    }catch{ return json({error:'portale di fatturazione non disponibile; riprova più tardi'},502); }
  }

  // New sales remain closed until seller information, prices and provider checks are approved.
  if(Deno.env.get('COMMERCIAL_CHECKOUT_ENABLED') !== 'true') return json({error:'Le nuove sottoscrizioni non sono ancora disponibili. I prezzi sono in definizione.'},503);

  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('id, nome, stripe_price_id')
    .eq('id', plan_id)
    .maybeSingle();
  if (planError) return json({ error: 'catalogo piani non disponibile' }, 503);
  if (!plan) return json({ error: 'piano sconosciuto' }, 404);
  if (!plan.stripe_price_id) {
    return json({ error: `il piano "${plan.nome}" non ha ancora un prezzo Stripe configurato` }, 400);
  }

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) return json({ error: 'Stripe non configurato sul server (manca STRIPE_SECRET_KEY)' }, 500);

  // service role: qui serve leggere/scrivere companies senza i limiti che
  // l'RLS impone a un membership qualunque (stripe_customer_id non è
  // leggibile/scrivibile dal client per policy — corretto, deve passare
  // sempre da qui).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: company, error: companyError } = await admin
    .from('companies')
    .select('id, nome, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', company_id)
    .maybeSingle();
  if (companyError) return json({ error: 'azienda non disponibile' }, 503);
  if (!company) return json({ error: 'azienda non trovata' }, 404);
  if (company.stripe_subscription_id && company.subscription_status !== 'canceled') return json({ error: 'abbonamento già collegato: gestire quello esistente prima di avviare un nuovo checkout' }, 409);

  try {
    let customerId = company.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeRequest('customers', {
        name: company.nome,
        email: user.email ?? '',
        'metadata[company_id]': company_id,
      }, secretKey, `customer:${company_id}`);
      customerId = customer.id;
      if (typeof customerId !== 'string') throw new Error('risposta customer non valida');
      const { data: saved, error: saveError } = await admin.from('companies').update({ stripe_customer_id: customerId }).eq('id', company_id).select('id').single();
      if (saveError || !saved) throw new Error('customer non registrato nel database; riprovare');
    }

    const session = await stripeRequest('checkout/sessions', {
      mode: 'subscription',
      customer: customerId,
      'line_items[0][price]': plan.stripe_price_id,
      'line_items[0][quantity]': '1',
      success_url,
      cancel_url,
      client_reference_id: company_id,
      'subscription_data[metadata][company_id]': company_id,
    }, secretKey, `checkout:${company_id}:${plan_id}`);

    if (typeof session.url !== 'string' || !session.url.startsWith('https://checkout.stripe.com/')) throw new Error('URL checkout non valido');
    return json({ url: session.url });
  } catch (e) {
    return json({ error: 'errore da Stripe: ' + (e instanceof Error ? e.message : String(e)) }, 502);
  }
});
