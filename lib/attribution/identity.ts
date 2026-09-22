/**
 * P10 identity + handoff cryptography.
 *
 * Two separate secrets-free/secret-bound concerns live here:
 *  1. The anonymous attribution token: 32 random bytes, base64url encoded. Only
 *     its SHA-256 is persisted, so the database cannot replay an identity.
 *  2. The cross-domain handoff token: HMAC-SHA-256 over a small JSON payload.
 *     It is short-lived and single-use, and it can only LINK sessions (never
 *     merge or re-point identities). If the signing secret is absent, handoff
 *     is DISABLED and fails closed — there is deliberately no fallback key,
 *     because a guessable key would let anyone mint attribution for a stranger.
 */
import { ATTRIBUTION_HANDOFF_TTL_SECONDS } from './contract'

const HANDOFF_PREFIX = 'v1'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/
const MIN_SECRET_LENGTH = 32

export type HandoffPayload = {
  sessionId: string
  nonce: string
  expiresAt: number
  host?: string | null
}

/**
 * Discriminated by a STRING status (not a boolean): this repo compiles with
 * `strict: false`, where boolean-discriminant narrowing is not reliable.
 */
export type HandoffVerification =
  | { status: 'valid'; payload: HandoffPayload }
  | { status: 'invalid'; reason: 'malformed' | 'expired' | 'signature' | 'secret_unavailable' }

/** Env var that enables cross-domain handoff. Must be a strong random string. */
export const HANDOFF_SECRET_ENV = 'ATTRIBUTION_HANDOFF_SECRET'

export function resolveHandoffSecret(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env?.[HANDOFF_SECRET_ENV] ?? '').trim()
  return raw.length >= MIN_SECRET_LENGTH ? raw : null
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  try {
    const binary = atob(padded + pad)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return base64UrlEncode(buffer)
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hmacBase64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return base64UrlEncode(new Uint8Array(mac))
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function mintHandoffToken(
  secret: string,
  payload: { sessionId: string; host?: string | null; now?: number; ttlSeconds?: number; nonce?: string },
): Promise<string> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) throw new Error('Handoff secret unavailable.')
  if (!UUID_RE.test(payload.sessionId)) throw new Error('Handoff session id must be a uuid.')
  const now = payload.now ?? Date.now()
  const ttl = payload.ttlSeconds ?? ATTRIBUTION_HANDOFF_TTL_SECONDS
  const body = JSON.stringify({
    sid: payload.sessionId,
    nonce: payload.nonce ?? randomToken(18),
    exp: Math.floor(now / 1000) + ttl,
    host: payload.host ? String(payload.host).toLowerCase().slice(0, 253) : null,
  })
  const encoded = base64UrlEncode(new TextEncoder().encode(body))
  const signature = await hmacBase64Url(secret, `${HANDOFF_PREFIX}.${encoded}`)
  return `${HANDOFF_PREFIX}.${encoded}.${signature}`
}

export async function verifyHandoffToken(
  secret: string | null,
  token: string | null | undefined,
  now: number = Date.now(),
): Promise<HandoffVerification> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return { status: 'invalid', reason: 'secret_unavailable' }
  if (typeof token !== 'string') return { status: 'invalid', reason: 'malformed' }
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== HANDOFF_PREFIX) return { status: 'invalid', reason: 'malformed' }
  const [, encoded, signature] = parts
  const expected = await hmacBase64Url(secret, `${HANDOFF_PREFIX}.${encoded}`)
  if (!constantTimeEqual(expected, signature)) return { status: 'invalid', reason: 'signature' }

  const decoded = base64UrlDecode(encoded)
  if (!decoded) return { status: 'invalid', reason: 'malformed' }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(new TextDecoder().decode(decoded)) as Record<string, unknown>
  } catch {
    return { status: 'invalid', reason: 'malformed' }
  }
  const sessionId = typeof parsed.sid === 'string' ? parsed.sid : ''
  const nonce = typeof parsed.nonce === 'string' ? parsed.nonce : ''
  const expiresAt = typeof parsed.exp === 'number' ? parsed.exp : NaN
  const host = typeof parsed.host === 'string' ? parsed.host : null
  if (!UUID_RE.test(sessionId) || !NONCE_RE.test(nonce) || !Number.isFinite(expiresAt)) {
    return { status: 'invalid', reason: 'malformed' }
  }
  if (expiresAt * 1000 <= now) return { status: 'invalid', reason: 'expired' }
  return { status: 'valid', payload: { sessionId, nonce, expiresAt, host } }
}

export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value)
}
