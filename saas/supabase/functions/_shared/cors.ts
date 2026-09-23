// Exact browser-origin allowlist. CORS is not authentication: callers without
// Origin still must pass the endpoint's authentication and tenant checks.
export function corsForRequest(
  req: Request,
  configuredOrigins: string = Deno.env.get('EDGE_ALLOWED_ORIGINS') ?? '',
): { headers: Record<string, string>; allowed: boolean } {
  const headers: Record<string, string> = { Vary: 'Origin' };
  const origin = req.headers.get('Origin');
  if (origin === null) return { headers, allowed: true };

  const allowedOrigins = configuredOrigins.split(',').map(value => value.trim()).filter(value => {
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value;
    } catch {
      return false;
    }
  });
  if (!allowedOrigins.includes(origin)) return { headers, allowed: false };
  headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  return { headers, allowed: true };
}
