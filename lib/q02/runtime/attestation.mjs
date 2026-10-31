// Offline-testable contract only. No route imports this module. No account link
// is created by a support proof; the portal must prove its own logged-in owner.
export const DISCLOSURE = Object.freeze({
  version: 'q02-support-v1',
  text: 'Optional: request linking your signed-in support account to a separately authenticated portal account. Choose each data class explicitly. The signed request expires within 120 seconds. Withdrawal stops future derived memory use; support transcripts and commercial/legal audit records have separate retention and are not deleted. Linking requires both sites to verify your accounts. Derived memory use, correction and forget remain unavailable.',
  scopes: Object.freeze(['preferences', 'derived_summary']),
})
const enc = new TextEncoder()
const fail = () => { throw new Error('Privacy authorization denied') }
const exact = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).sort().join(',') === [...keys].sort().join(',')
const id = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s)
const randomId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s) && unb64(s).length === 32
const origin = (s) => { try { return typeof s === 'string' && new URL(s).origin === s && new URL(s).protocol === 'https:' } catch { return false } }
function b64(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function unb64(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s) || s.length > 8192) fail()
  const bytes = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0))
  if (b64(bytes) !== s) fail()
  return bytes
}
export function newChallenge() { return b64(crypto.getRandomValues(new Uint8Array(32))) }
function config(c) {
  if (c?.enabled !== true || !origin(c.issuer) || !origin(c.audience) || c.issuer === c.audience || !id(c.site) || !id(c.tenant) || !id(c.kid)) fail()
}
function scopes(s) {
  return Array.isArray(s) && s.length > 0 && s.length <= 2 && s.every(x => DISCLOSURE.scopes.includes(x)) && [...new Set(s)].sort().join(',') === s.join(',')
}
const fields = ['v','iss','aud','sub','site','tenant','purpose','scopes','nonce','jti','iat','nbf','exp','epoch','consent_version']
function validate(p, c, now) {
  config(c)
  if (!Number.isSafeInteger(now) || !exact(p, fields) || p.v !== 1 || p.iss !== c.issuer || p.aud !== c.audience || p.site !== c.site || p.tenant !== c.tenant || p.purpose !== 'account-memory-link-intent' || !/^user_[A-Za-z0-9_-]+$/.test(p.sub) || p.sub.length > 128 || !scopes(p.scopes) || !randomId(p.nonce) || !randomId(p.jti) || p.consent_version !== DISCLOSURE.version) fail()
  if (![p.iat,p.nbf,p.exp,p.epoch].every(Number.isSafeInteger) || p.epoch < 1 || p.iat !== p.nbf || p.exp <= p.iat || p.exp - p.iat > 120 || now < p.nbf || now >= p.exp) fail()
}
function keyShape(jwk, privateKey) {
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y || (privateKey ? !jwk.d : 'd' in jwk)) fail()
}
/**
 * session and membership are trusted server results, NEVER request JSON.
 * store.reserve atomically checks live subject/site/tenant/scopes/epoch and
 * reserves unique jti before signing. No in-memory fallback is permitted.
 */
export async function issueIntent({ config: c, session, membership, consent, nonce, store, now = Math.floor(Date.now()/1000) }) {
  config(c)
  if (!session?.sub || !session.sid || membership?.subject !== session.sub || membership?.site !== c.site || membership?.tenant !== c.tenant || consent?.accepted !== true || consent.disclosure !== DISCLOSURE.version || !scopes(consent.scopes) || !store?.reserve) fail()
  const p = { v: 1, iss: c.issuer, aud: c.audience, sub: session.sub, site: c.site, tenant: c.tenant, purpose: 'account-memory-link-intent', scopes: [...consent.scopes], nonce, jti: newChallenge(), iat: now, nbf: now, exp: now + 120, epoch: consent.epoch, consent_version: DISCLOSURE.version }
  validate(p, c, now)
  keyShape(c.privateJwk, true)
  const key = await crypto.subtle.importKey('jwk', c.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  if (await store.reserve(p) !== true) fail()
  const h = { alg: 'ES256', typ: 'q02-support-intent+jwt', kid: c.kid }
  const input = `${b64(enc.encode(JSON.stringify(h)))}.${b64(enc.encode(JSON.stringify(p)))}`
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input))
  return `${input}.${b64(new Uint8Array(signature))}`
}
/** Verification alone never authorizes linking. Portal needs its own session,
 * nonce binding and atomic online redemption with current support epoch. */
export async function verifyIntent(token, { config: c, nonce, now = Math.floor(Date.now()/1000) }) {
  try {
    config(c)
    if (typeof token !== 'string' || token.length > 8192) fail()
    const parts = token.split('.')
    if (parts.length !== 3) fail()
    const [a,b,s] = parts
    const h = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(unb64(a)))
    const p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(unb64(b)))
    if (!exact(h, ['alg','typ','kid']) || h.alg !== 'ES256' || h.typ !== 'q02-support-intent+jwt' || h.kid !== c.kid || b64(enc.encode(JSON.stringify(h))) !== a || b64(enc.encode(JSON.stringify(p))) !== b) fail()
    validate(p, c, now)
    if (!randomId(nonce) || p.nonce !== nonce) fail()
    keyShape(c.publicJwk, false)
    const key = await crypto.subtle.importKey('jwk', c.publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const sig = unb64(s)
    if (sig.length !== 64 || !await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, enc.encode(`${a}.${b}`))) fail()
    return p
  } catch { fail() }
}
