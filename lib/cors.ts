// Allow specific external sites (caseworks legal subdomain) to POST inquiries.
// Same-origin portal requests do not need to set Origin and are unaffected.

// Phase 5: the localhost dev origin is only allowed outside production.
const ALLOWED_ORIGINS = new Set([
  'https://legal.yousafeconsultancy.com',
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000']),
])

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function handleOptions(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export function jsonWithCors(req: Request, payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(req.headers.get('origin')),
    },
  })
}
