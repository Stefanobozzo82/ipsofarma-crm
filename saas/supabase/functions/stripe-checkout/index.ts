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

async function stripeRequest(path: string, params: Record<string, string>, secretKey: string) {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ha risposto HTTP ${res.status}`);
  return data;
}

Deno.serve(async (req: Request) => {
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

  let body: { company_id?: string; plan_id?: string; success_url?: string; cancel_url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'corpo della richiesta non valido (JSON atteso)' }, 400);
  }
  const { company_id, plan_id, success_url, cancel_url } = body;
  if (!company_id || !plan_id || !success_url || !cancel_url) {
    return json({ error: 'company_id, plan_id, success_url e cancel_url sono tutti obbligatori' }, 400);
  }

  // Solo un admin dell'azienda può avviare o cambiare l'abbonamento — non un
  // operatore qualunque. La query è già filtrata da RLS: se la riga non
  // torna, o l'utente non è membro di quest'azienda, o non è admin.
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('company_id', company_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership || membership.role !== 'admin') {
    return json({ error: 'solo un amministratore dell\'azienda può gestire l\'abbonamento' }, 403);
  }

  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('id, nome, stripe_price_id')
    .eq('id', plan_id)
    .maybeSingle();
  if (planError || !plan) return json({ error: 'piano sconosciuto' }, 404);
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
    .select('id, nome, stripe_customer_id')
    .eq('id', company_id)
    .maybeSingle();
  if (companyError || !company) return json({ error: 'azienda non trovata' }, 404);

  try {
    let customerId = company.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeRequest('customers', {
        name: company.nome,
        email: user.email ?? '',
        'metadata[company_id]': company_id,
      }, secretKey);
      customerId = customer.id;
      await admin.from('companies').update({ stripe_customer_id: customerId }).eq('id', company_id);
    }

    const session = await stripeRequest('checkout/sessions', {
      mode: 'subscription',
      customer: customerId,
      'line_items[0][price]': plan.stripe_price_id,
      'line_items[0][quantity]': '1',
      success_url,
      cancel_url,
      client_reference_id: company_id,
    }, secretKey);

    return json({ url: session.url });
  } catch (e) {
    return json({ error: 'errore da Stripe: ' + (e instanceof Error ? e.message : String(e)) }, 502);
  }
});
