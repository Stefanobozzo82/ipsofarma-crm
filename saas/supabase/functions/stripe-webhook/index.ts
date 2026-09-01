// ============================================================================
// stripe-webhook — tiene companies.piano sincronizzato con l'abbonamento
// Stripe reale. Non ha un utente che chiama: chiama Stripe stesso, quindi
// l'autenticazione è la verifica della firma (Stripe-Signature), non un
// token utente — e le scritture usano la service role key (bypassa la RLS
// di proposito: nessun utente potrebbe comunque scrivere questi campi).
//
// Collaudata con un abbonamento reale in sandbox Stripe (checkout completo,
// webhook ricevuto e verificato, companies.piano/subscription_status
// aggiornati correttamente). La verifica della firma segue esattamente lo
// schema documentato da Stripe (HMAC-SHA256 su "timestamp.corpo", con Web
// Crypto invece dell'SDK — stesso motivo di stripe-checkout: niente
// dipendenze npm da bundlare).
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOLLERANZA_SECONDI = 300; // Stripe raccomanda di rifiutare eventi più vecchi di 5 minuti (protezione da replay)

async function verificaFirmaStripe(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=') as [string, string]));
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  const eta = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(eta) || eta > TOLLERANZA_SECONDI || eta < -TOLLERANZA_SECONDI) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expectedHex = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (expectedHex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) diff |= expectedHex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('metodo non consentito', { status: 405 });

  const signatureHeader = req.headers.get('Stripe-Signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const rawBody = await req.text();

  if (!signatureHeader || !webhookSecret) return new Response('firma o segreto mancante', { status: 400 });
  if (!(await verificaFirmaStripe(rawBody, signatureHeader, webhookSecret))) {
    return new Response('firma non valida', { status: 400 });
  }

  let event: { type: string; data: { object: Record<string, any> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('corpo non valido', { status: 400 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const companyId = session.client_reference_id;
      if (companyId && session.subscription) {
        await admin.from('companies').update({
          stripe_subscription_id: session.subscription,
          stripe_customer_id: session.customer,
        }).eq('id', companyId);
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const priceId = sub.items?.data?.[0]?.price?.id;
      let pianoId: string | null = null;
      if (priceId) {
        const { data: plan } = await admin.from('plans').select('id').eq('stripe_price_id', priceId).maybeSingle();
        pianoId = plan?.id ?? null;
      }
      // "current_period_end" non esiste più sull'oggetto subscription (API
      // Stripe più recenti l'hanno spostato dentro ogni riga di
      // items.data[]) — scoperto collaudando con un abbonamento reale in
      // sandbox: il campo arrivava sempre vuoto nel database nonostante il
      // webhook girasse correttamente. Un abbonamento con un solo prezzo
      // (l'unico caso che questo SaaS crea, vedi stripe-checkout) ha una
      // sola riga in items, quindi la prima è sempre quella giusta.
      const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
      const update: Record<string, unknown> = {
        subscription_status: sub.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      };
      if (pianoId) update.piano = pianoId; // se il prezzo non è mappato a un piano noto, non tocchiamo companies.piano
      await admin.from('companies').update(update).eq('stripe_subscription_id', sub.id);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      // l'abbonamento è finito: si torna al piano gratuito, non a "nessun piano"
      await admin.from('companies').update({
        subscription_status: 'canceled',
        piano: 'trial',
      }).eq('stripe_subscription_id', sub.id);
      break;
    }

    default:
      // eventi che non ci riguardano: rispondiamo comunque 200, altrimenti
      // Stripe continua a ritentare all'infinito qualcosa che ignoriamo di proposito.
      break;
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
