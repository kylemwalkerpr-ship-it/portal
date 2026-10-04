// Input guards for the public intake endpoint (/api/inquiries).
// Phase 4 sanitization: bound payload sizes, validate ids, and provide the
// privacy-preserving client key used for per-IP rate limiting.

export const MAX_INQUIRY_BODY_BYTES = 64 * 1024
export const MAX_ANSWERS_BYTES = 16 * 1024
export const MAX_META_BYTES = 4 * 1024
export const INQUIRY_EMAIL_LIMIT_PER_HOUR = 3
export const INQUIRY_IP_LIMIT_PER_HOUR = 10

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

/** Returns the object when it serializes within maxBytes, otherwise null. */
export function boundedObject(v: unknown, maxBytes: number): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  try {
    const json = JSON.stringify(v)
    return byteLength(json) <= maxBytes ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Strips CR/LF and other control characters (for email subjects/headers). */
export function singleLine(v: string): string {
  return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

export function clientIp(req: Request): string | null {
  const ip =
    req.headers.get('cf-connecting-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    ''
  return ip ? ip.slice(0, 64) : null
}

/** SHA-256 of the client IP (salted) so raw IPs are never stored. */
export async function hashClientKey(ip: string, salt = process.env.INQUIRY_IP_SALT || 'yousafe-inquiry-v1'): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
