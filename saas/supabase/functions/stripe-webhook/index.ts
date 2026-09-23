import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createStripeWebhookHandler } from './handler.ts';
Deno.serve(createStripeWebhookHandler({
  env: name => Deno.env.get(name),
  apply: async event => {
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    return admin.rpc('apply_stripe_event', { p_event: event });
  },
}));
