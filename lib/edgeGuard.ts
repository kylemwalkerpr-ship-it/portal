/**
 * Edge guard for the shared portal/market Worker (Sanitization Brief Phases 5-6).
 *
 * Runs in `edge-worker.mjs` BEFORE the OpenNext handler, with direct access to
 * the Worker env. It does exactly two cheap things:
 *
 * 1. Rate limiting (Phase 5). Mutating requests to sensitive endpoints are
 *    counted with the native Workers Rate Limiting bindings declared in
 *    wrangler.toml (`[[ratelimits]]`). A binding call is answered from a
 *    machine-local cache, so this adds no network round trip and ~no CPU.
 *    Missing bindings (local dev, tests) fail open.
 *
 * 2. Error-body redaction (Phase 6). For `/api/*` responses with status >= 400
 *    and a small JSON/text body, any string that looks like an internal
 *    diagnostic (Postgres/PostgREST errors, JS runtime errors, stack frames,
 *    internal paths) is replaced with a generic message before it leaves the
 *    Worker. The original is logged for Workers observability. Successful
 *    responses and streams are never read.
 */

export type RateLimitBinding = { limit(options: { key: string }): Promise<{ success: boolean }> }

export type EdgeGuardEnv = {
  RL_FORMS?: RateLimitBinding
  RL_MESSAGES?: RateLimitBinding
  RL_AI?: RateLimitBinding
  RL_TRANSLATE?: RateLimitBinding
}

type BindingName = keyof EdgeGuardEnv

type RateRule = { binding: BindingName; bucket: string; test: (pathname: string) => boolean }

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const exact = (...paths: string[]) => {
  const set = new Set(paths)
  return (p: string) => set.has(p)
}

// Order matters: first match wins.
export const RATE_RULES: RateRule[] = [
  {
    // Public/onboarding forms: contact + intake, provider applications,
    // onboarding role choice, password change, lead unsubscribe.
    binding: 'RL_FORMS',
    bucket: 'forms',
    test: exact(
      '/api/inquiries',
      '/api/provider/apply',
      '/api/attorney/apply',
      '/api/consultant/intake/submit',
      '/api/onboarding/role',
      '/api/account/password',
      '/api/marketplace/lead-unsubscribe',
      '/api/client/attorney-message',
      '/api/messages/start',
    ),
  },
  {
    // AI-backed endpoints (provider cost).
    binding: 'RL_AI',
    bucket: 'ai',
    test: exact(
      '/api/chat',
      '/api/inquiry/suggest',
      '/api/templates/fill/suggest',
      '/api/templates/fill/autofill',
      '/api/profile/suggest',
      '/api/seo-suggest',
      '/api/compliance/guide',
    ),
  },
  {
    binding: 'RL_TRANSLATE',
    bucket: 'translate',
    test: (p) => p === '/api/translate' || p === '/api/translate/batch',
  },
  {
    // Message send / reactions / attachments and generic uploads.
    binding: 'RL_MESSAGES',
    bucket: 'messages',
    test: (p) =>
      p.startsWith('/api/messages/') ||
      p.startsWith('/api/mobile/messages/') ||
      p === '/api/uploads' ||
      p === '/api/consultant/messages' ||
      p === '/api/student/messages' ||
      /^\/api\/(client|attorney)\/(inquiries|chats|attorney-chats|orders)\/[^/]+\/messages$/.test(p) ||
      /^\/api\/client\/attorney-chats\/[^/]+\/messages$/.test(p),
  },
]

export function matchRateRule(method: string, pathname: string): RateRule | null {
  if (!MUTATING.has(method.toUpperCase())) return null
  if (!pathname.startsWith('/api/')) return null
  const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  for (const rule of RATE_RULES) if (rule.test(p)) return rule
  return null
}

const YOUSAFE_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*yousafeconsultancy\.com$/

function corsFor(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || ''
  return YOUSAFE_ORIGIN.test(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}
}

export const TOO_MANY_MESSAGE = 'Too many requests. Please wait a minute and try again.'

export async function rateLimitRequest(request: Request, env: EdgeGuardEnv): Promise<Response | null> {
  let rule: RateRule | null = null
  try {
    rule = matchRateRule(request.method, new URL(request.url).pathname)
  } catch {
    return null
  }
  if (!rule) return null
  const binding = env?.[rule.binding]
  if (!binding || typeof binding.limit !== 'function') return null
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown'
  try {
    const { success } = await binding.limit({ key: `${rule.bucket}:${ip}` })
    if (success) return null
  } catch {
    return null // fail open: never take the site down because the limiter errored
  }
  return new Response(JSON.stringify({ error: TOO_MANY_MESSAGE, data: null, meta: { retryAfter: 60 } }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Retry-After': '60',
      ...corsFor(request),
    },
  })
}

// ── Phase 6: redact internal diagnostics from public error bodies ─────────

export const GENERIC_ERROR = 'Something went wrong. Please try again.'

const INTERNAL_PATTERNS: RegExp[] = [
  /invalid input syntax for/i,
  /violates (foreign key|unique|check|not-null|exclusion|row-level security)/i,
  /duplicate key value/i,
  /\brelation "[^"]+" does not exist/i,
  /\bcolumn "?[\w.]+"? (of relation "[^"]+" )?does not exist/i,
  /could not find the .+ in the schema cache/i,
  /syntax error at or near/i,
  /permission denied for (table|schema|relation|function|sequence)/i,
  /\bPGRST\d{3}\b/,
  /JSON object requested, multiple \(or no\) rows returned/i,
  /Cannot coerce the result to a single JSON object/i,
  /\bfunction [\w.]+\(.*\) does not exist/i,
  /\bnull value in column\b/i,
  /value too long for type/i,
  /\b(TypeError|ReferenceError|SyntaxError|RangeError|EvalError)\b/,
  /Cannot read propert(y|ies) of/i,
  /\bis not a function\b/i,
  /\bis not defined\b/i,
  /Unexpected (token|end of JSON input)/i,
  /is not valid JSON/i,
  /\n\s+at\s+\S.*:\d+:\d+/,
  /\bat\s+[\w$.<>]+\s+\((?:file:|\/|[A-Za-z]:\\|webpack|node:)/,
  /\/var\/task\/|\/home\/runner\/|node_modules\/|\.open-next\/|webpack-internal:|\.next\/server\//i,
  /\bfetch failed\b/i,
  /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b/,
  /\bD1_(ERROR|EXEC_ERROR|TYPE_ERROR)\b|\bSQLITE_[A-Z]+\b/,
  /\b[a-z0-9]{20}\.supabase\.co\b/i,
  /\bservice[_ ]role\b/i,
  /\bjwt (expired|malformed)\b|\binvalid signature\b/i,
  /Network connection lost|Worker exceeded|exceeded (CPU|resource) limits?/i,
]

export function looksInternal(text: string): boolean {
  if (!text) return false
  return INTERNAL_PATTERNS.some((re) => re.test(text))
}

const PG_CODE = /^(PGRST\d{3}|[0-9]{2}[0-9A-Z]{3})$/
const DROP_KEYS = new Set(['stack', 'stacktrace', 'hint', 'sql', 'query', 'trace'])

/** Deep-copy `value`, replacing internal diagnostics. Returns [value, changed]. */
export function redactValue(value: unknown, depth = 0): [unknown, boolean] {
  if (depth > 8) return [value, false]
  if (typeof value === 'string') return looksInternal(value) ? [GENERIC_ERROR, true] : [value, false]
  if (Array.isArray(value)) {
    let changed = false
    const out = value.map((v) => {
      const [nv, c] = redactValue(v, depth + 1)
      changed ||= c
      return nv
    })
    return [out, changed]
  }
  if (value && typeof value === 'object') {
    let changed = false
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase()
      if (DROP_KEYS.has(key) && v != null && v !== '') {
        changed = true
        continue
      }
      if (key === 'code' && typeof v === 'string' && PG_CODE.test(v)) {
        changed = true
        continue
      }
      if ((key === 'details' || key === 'detail') && typeof v === 'string' && looksInternal(v)) {
        changed = true
        continue
      }
      const [nv, c] = redactValue(v, depth + 1)
      changed ||= c
      out[k] = nv
    }
    return [out, changed]
  }
  return [value, false]
}

const MAX_INSPECT_BYTES = 64 * 1024

export async function redactErrorResponse(request: Request, response: Response): Promise<Response> {
  if (response.status < 400) return response
  let pathname = ''
  try {
    pathname = new URL(request.url).pathname
  } catch {
    return response
  }
  if (!pathname.startsWith('/api/')) return response
  const ct = (response.headers.get('content-type') || '').toLowerCase()
  const isJson = ct.includes('json')
  const isText = ct.startsWith('text/plain') || ct === ''
  if (!isJson && !isText) return response
  if (ct.includes('event-stream')) return response
  const len = Number(response.headers.get('content-length') || '0')
  if (len > MAX_INSPECT_BYTES) return response
  if (!response.body) return response

  let text: string
  try {
    text = await response.text()
  } catch {
    return new Response(JSON.stringify({ error: GENERIC_ERROR }), {
      status: response.status,
      headers: response.headers,
    })
  }

  let out = text
  if (text.length <= MAX_INSPECT_BYTES) {
    if (isJson) {
      try {
        const [redacted, changed] = redactValue(JSON.parse(text))
        if (changed) out = JSON.stringify(redacted)
      } catch {
        if (looksInternal(text)) out = JSON.stringify({ error: GENERIC_ERROR })
      }
    } else if (looksInternal(text)) {
      out = GENERIC_ERROR
    }
  }

  const headers = new Headers(response.headers)
  if (out !== text) {
    console.error('[edge-guard] redacted internal error detail', response.status, pathname, text.slice(0, 500))
    headers.delete('content-length')
  }
  return new Response(out, { status: response.status, statusText: response.statusText, headers })
}

// ── Phase 5: baseline transport headers on Worker-generated responses ─────
// next.config headers() only decorate responses rendered by Next routes.
// Middleware redirects (portal -> Market sign-in, legacy lanes) and early
// 401/429 JSON left the Worker without HSTS/nosniff. Add the transport
// baseline to any response that lacks HSTS. Header-only; the body streams
// through untouched.
export const BASELINE_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
}

export function ensureBaselineHeaders(response: Response): Response {
  if (response.status === 101 || response.headers.has('strict-transport-security')) return response
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(BASELINE_HEADERS)) if (!headers.has(k)) headers.set(k, v)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
