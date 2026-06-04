/**
 * Pure helpers for sniffing the visitor's country from inbound request
 * headers. We deliberately do NOT call out to any third-party geo-IP API —
 * this Worker sits behind Cloudflare, which decorates every request with a
 * trustworthy `cf-ipcountry` value. `x-vercel-ip-country` is a fallback for
 * local dev / preview deploys that happen to terminate on Vercel.
 *
 * Detection is best-effort: if no header is present, or the value isn't a
 * recognised ISO-3166-1 alpha-2 code, we return null and let the caller
 * decide how to degrade (signup flow → leave the row null and try again on
 * the next authed request).
 */
import { normalizeCountryCode } from './countryList'

const HEADERS_BY_PRIORITY = [
  'cf-ipcountry',          // Cloudflare (authoritative for our prod Worker)
  'x-vercel-ip-country',   // Vercel edge fallback
  'x-country-code',        // generic infra fallback, rarely set
] as const

type HeadersLike =
  | Headers
  | { get: (name: string) => string | null }
  | Record<string, string | string[] | undefined>

function readHeader(source: HeadersLike, name: string): string | null {
  if (!source) return null
  if (typeof (source as any).get === 'function') {
    const v = (source as any).get(name)
    return typeof v === 'string' ? v : null
  }
  const lower = name.toLowerCase()
  const rec = source as Record<string, string | string[] | undefined>
  const direct = rec[name] ?? rec[lower]
  if (Array.isArray(direct)) return direct[0] ?? null
  return typeof direct === 'string' ? direct : null
}

/**
 * Extract a normalised ISO-3166-1 alpha-2 country code from the given
 * request-like value. Accepts a Web `Request`, a Next.js `headers()` result,
 * or any object exposing a `get(name)` method. Returns null when nothing
 * usable is present (the Cloudflare-recognised "XX" placeholder for
 * unknown/anonymised callers also resolves to null because it isn't in our
 * allowlist).
 */
export function extractCountryFromRequest(
  req: Request | { headers: HeadersLike } | HeadersLike | null | undefined,
): string | null {
  if (!req) return null

  // Normalise to a HeadersLike object.
  let headers: HeadersLike
  if (req instanceof Request) {
    headers = req.headers
  } else if ('headers' in (req as any) && (req as any).headers) {
    headers = (req as any).headers
  } else {
    headers = req as HeadersLike
  }

  for (const name of HEADERS_BY_PRIORITY) {
    const raw = readHeader(headers, name)
    if (!raw) continue
    const normalised = normalizeCountryCode(raw)
    if (normalised) return normalised
  }
  return null
}
