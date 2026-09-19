import { corsForRequest } from '../_shared/cors.ts';

interface Dependencies {
  env: (name: string) => string | undefined;
  // Injected client allows offline tests without accessing any tenant.
  client: (authorization: string) => any;
  fetch: typeof fetch;
}
const headerName = (value: string) => value.replace(/[\r\n"<>]/g, '').trim().slice(0, 120);
const validEmail = (value: string) => /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);

export function createEmailHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const cors = corsForRequest(req);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json', ...cors.headers },
    });
    if (!cors.allowed) return json({ error: 'origine non consentita' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers });
    if (req.method !== 'POST') return json({ error: 'metodo non consentito, usa POST' }, 405);
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ error: 'accesso richiesto' }, 401);
    const supabase = deps.client(authorization);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'sessione non valida o scaduta' }, 401);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid body');
    } catch {
      return json({ error: 'corpo della richiesta non valido (JSON atteso)' }, 400);
    }
    if (typeof body.company_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.company_id)) {
      return json({ error: 'company_id mancante o non valido' }, 400);
    }
    const { data: membership, error: membershipError } = await supabase.from('my_memberships')
      .select('company_id, role').eq('company_id', body.company_id).maybeSingle();
    if (membershipError) return json({ error: 'verifica autorizzazione non disponibile' }, 503);
    if (!membership || !['admin', 'operatore'].includes(membership.role)) return json({ error: 'invio email non consentito per questa azienda' }, 403);
    const { data: company, error: companyError } = await supabase.from('companies')
      .select('nome, settings').eq('id', body.company_id).maybeSingle();
    if (companyError) return json({ error: 'identità azienda non disponibile' }, 503);
    if (!company) return json({ error: 'azienda non disponibile' }, 403);
    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    if (!validEmail(to)) return json({ error: 'destinatario mancante o non valido' }, 400);
    if (!subject || /[\r\n]/.test(subject)) return json({ error: 'oggetto mancante o non valido' }, 400);
    if (typeof body.html !== 'string' || !body.html.trim()) return json({ error: 'corpo del messaggio mancante' }, 400);
    const hasAttachment = body.attachmentBase64 !== undefined || body.attachmentFilename !== undefined;
    if (hasAttachment && (typeof body.attachmentBase64 !== 'string' || !body.attachmentBase64 || typeof body.attachmentFilename !== 'string' || !body.attachmentFilename || /[\r\n]/.test(body.attachmentFilename))) {
      return json({ error: 'allegato non valido' }, 400);
    }
    const resendKey = deps.env('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'invio email non configurato sul server' }, 500);
    const fromAddress = deps.env('RESEND_FROM') || 'onboarding@resend.dev';
    const platform = headerName(deps.env('PLATFORM_NAME') || 'il gestionale');
    const name = headerName(typeof company.nome === 'string' ? company.nome : '');
    const payload: Record<string, unknown> = { from: name ? `${name} (tramite ${platform}) <${fromAddress}>` : fromAddress, to: [to], subject, html: body.html };
    // Legacy browser identity fields are ignored. Use only this tenant's database row.
    const replyTo = typeof company.settings?.email === 'string' ? company.settings.email.trim() : '';
    if (validEmail(replyTo)) payload.reply_to = replyTo;
    if (hasAttachment) payload.attachments = [{ filename: body.attachmentFilename, content: body.attachmentBase64 }];
    try {
      const upstream = await deps.fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` }, body: JSON.stringify(payload) });
      return new Response(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': 'application/json', ...cors.headers } });
    } catch {
      return json({ error: 'errore di rete verso il provider email' }, 502);
    }
  };
}
