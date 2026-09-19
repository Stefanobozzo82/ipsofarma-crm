import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsForRequest } from '../_shared/cors.ts';

const GEMINI_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function boundedText(stream: ReadableStream<Uint8Array> | null, maximum: number): Promise<string> {
  if (!stream) return '';
  const reader = stream.getReader();
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Error('payload_too_large'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return new TextDecoder().decode(bytes);
}

Deno.serve(async (req: Request) => {
  const { headers: corsHeaders, allowed } = corsForRequest(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
  if (!allowed) return json({ error: 'origine non consentita' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'metodo non consentito, usa POST' }, 405);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'accesso richiesto' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'sessione non valida o scaduta' }, 401);
  if (Number(req.headers.get('Content-Length')) > MAX_BODY_BYTES) return json({ error: 'allegato o richiesta troppo grande (massimo 20 MB)' }, 413);
  let body: Record<string, any>;
  try { body = JSON.parse(await boundedText(req.body, MAX_BODY_BYTES)); }
  catch (error) { return json({ error: error instanceof Error && error.message === 'payload_too_large' ? 'richiesta troppo grande (massimo 20 MB)' : 'richiesta JSON non valida' }, error instanceof Error && error.message === 'payload_too_large' ? 413 : 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'richiesta non valida' }, 400);
  if (typeof body.companyId !== 'string' || !UUID.test(body.companyId) || typeof body.request_id !== 'string' || !UUID.test(body.request_id)) return json({ error: 'azienda o identificativo richiesta mancante/non valido' }, 400);
  const models = new Set(['gemini-2.5-flash', 'gemini-3.5-flash']);
  const model = body.model ?? 'gemini-2.5-flash';
  const maxTokens = body.max_tokens ?? 900;
  const temperature = body.temperature ?? 0.3;
  if (!models.has(model) || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192 || typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) return json({ error: 'modello o parametri IA non consentiti' }, 400);
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 60) return json({ error: 'numero messaggi non valido (massimo 60)' }, 400);
  let textSize = 0, images = 0;
  const messages = [];
  for (const message of body.messages) {
    if (!message || !['system', 'user', 'assistant'].includes(message.role)) return json({ error: 'messaggio IA non valido' }, 400);
    let content;
    if (typeof message.content === 'string') { textSize += message.content.length; content = message.content; }
    else if (Array.isArray(message.content) && message.content.length <= 16) {
      content = [];
      for (const part of message.content) {
        if (part?.type === 'text' && typeof part.text === 'string') { textSize += part.text.length; content.push({ type: 'text', text: part.text }); }
        else if (part?.type === 'image_url' && typeof part.image_url?.url === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(part.image_url.url)) { images++; content.push({ type: 'image_url', image_url: { url: part.image_url.url } }); }
        else return json({ error: 'contenuto messaggio non supportato' }, 400);
      }
    } else return json({ error: 'contenuto messaggio non valido' }, 400);
    messages.push({ role: message.role, content });
  }
  if (textSize > 200000 || images > 8) return json({ error: 'richiesta troppo grande: massimo 200000 caratteri e 8 immagini' }, 413);
  const payload: Record<string, unknown> = { model, max_tokens: maxTokens, temperature, messages };
  if (body.reasoning_effort !== undefined) {
    if (!['none', 'low', 'medium', 'high'].includes(body.reasoning_effort)) return json({ error: 'parametro ragionamento non valido' }, 400);
    payload.reasoning_effort = body.reasoning_effort;
  }
  const { data: membership, error: membershipError } = await supabase.from('my_memberships').select('company_id').eq('company_id', body.companyId).maybeSingle();
  if (membershipError) return json({ error: 'verifica autorizzazione non disponibile' }, 503);
  if (!membership) return json({ error: 'non fai parte di questa azienda' }, 403);
  const geminiKey = Deno.env.get('GEMINI_API_KEY'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!geminiKey || !serviceKey) return json({ error: 'servizio IA non configurato sul server' }, 503);
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
  const serialized = JSON.stringify(payload);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const identity = { p_company_id: body.companyId, p_actor_id: user.id, p_request_id: body.request_id };
  const { data: reservation, error: reserveError } = await admin.rpc('reserve_ai_attempt', { ...identity, p_request_hash: hash, p_model: model });
  if (reserveError || !reservation) return json({ error: 'controllo quota IA non disponibile' }, 503);
  if (!reservation.allowed) {
    const status = ({ quota: 429, forbidden: 403, conflict: 409 } as Record<string, number>)[reservation.reason] || 503;
    return json({ error: reservation.reason === 'quota' ? 'Limite mensile IA raggiunto. I tentativi già inoltrati, anche falliti, consumano quota.' : 'richiesta IA non autorizzata o non disponibile' }, status);
  }
  // No prompt/provider result is persisted. A repeat never calls the provider:
  // a lost successful response cannot be replayed from this metadata-only ledger.
  if (!reservation.reserved) return json({ error: 'richiesta già inoltrata; nessun nuovo tentativo eseguito', status: reservation.status }, 409);
  const finish = async (status: string, providerStatus: number | null) => {
    try {
      const { error } = await admin.rpc('finish_ai_attempt', { ...identity, p_status: status, p_provider_status: providerStatus });
      return !error;
    } catch { return false; }
  };
  const configuredTimeout = Number(Deno.env.get('AI_PROVIDER_TIMEOUT_MS') || 60000);
  const timeoutMs = Number.isFinite(configuredTimeout) ? Math.max(1000, Math.min(120000, configuredTimeout)) : 60000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(GEMINI_CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${geminiKey}` }, body: serialized, signal: controller.signal });
    const text = await boundedText(upstream.body, MAX_RESPONSE_BYTES);
    if (!await finish(upstream.ok ? 'succeeded' : 'failed', upstream.status)) return json({ error: 'esito IA non registrabile; il tentativo resta conteggiato' }, 503);
    if (!upstream.ok) return json({ error: 'il provider IA non ha completato la richiesta; tentativo conteggiato' }, 502);
    return new Response(text, { status: upstream.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch {
    await finish('unknown', null);
    return json({ error: 'esito provider IA incerto o timeout; tentativo conteggiato, nessuna ripetizione automatica' }, controller.signal.aborted ? 504 : 502);
  } finally { clearTimeout(timeout); }
});
