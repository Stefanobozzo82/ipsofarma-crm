import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createEmailHandler } from './handler.ts';
Deno.serve(createEmailHandler({
  env: (name) => Deno.env.get(name),
  client: (authorization) => createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authorization } } }),
  fetch: globalThis.fetch,
}));
