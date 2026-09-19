type Dependencies = { env: (name: string) => string | undefined; apply: (event: unknown) => PromiseLike<{error: unknown; data?: unknown}>; now?: () => number };
export async function validStripeSignature(payload: string, header: string, secret: string, now = Date.now()): Promise<boolean> {
 const parts = header.split(',').map(p => p.trim().split('='));
 const times = parts.filter(p => p[0] === 't');
 if (times.length !== 1 || !/^\d+$/.test(times[0][1] || '')) return false;
 const t = times[0][1]; if (Math.abs(Math.floor(now / 1000) - Number(t)) > 300) return false;
 const signatures = parts.filter(p => p[0] === 'v1' && /^[0-9a-f]{64}$/.test(p[1] || '')).map(p => p[1]);
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
 const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
 const expected = Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2,'0')).join('');
 return signatures.some(sig => {let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^sig.charCodeAt(i);return diff===0;});
}
export function createStripeWebhookHandler(deps: Dependencies) {
 return async (req: Request): Promise<Response> => {
  if(req.method!=='POST')return new Response('method not allowed',{status:405});
  const secret=deps.env('STRIPE_WEBHOOK_SECRET');if(!secret)return new Response('webhook not configured',{status:503});
  const raw=await req.text();
  if(!(await validStripeSignature(raw,req.headers.get('Stripe-Signature')||'',secret,deps.now?.()??Date.now())))return new Response('invalid signature',{status:400});
  let event;try{event=JSON.parse(raw);}catch{return new Response('invalid JSON',{status:400});}
  if(!event||typeof event.id!=='string'||!event.id||typeof event.type!=='string'||!Number.isSafeInteger(event.created)||!event.data?.object)return new Response('invalid event',{status:400});
  try{const result=await deps.apply(event);if(result.error)return new Response('event processing failed; retry required',{status:503});return Response.json({received:true});}
  catch{return new Response('event processing unavailable',{status:503});}
 };
}
