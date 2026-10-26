// No network discovery, runtime signing, or positive redemption authorization.
export const VERSION = 'portal-v7-1'
export const SCOPES = Object.freeze(['derived_summary', 'preferences'])
export const PURPOSE = 'account-memory-link-reciprocal'
const enc = new TextEncoder()
export function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '') }
export function unb64(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) throw Error('Invalid encoding')
  const bytes = Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0))
  if (b64(bytes) !== s) throw Error('Noncanonical encoding')
  return bytes
}
export async function digest(value) { return b64(await crypto.subtle.digest('SHA-256', enc.encode(value))) }
export function randomToken() { return b64(crypto.getRandomValues(new Uint8Array(32))) }
function randomId(value) { try { return typeof value === 'string' && value.length === 43 && unb64(value).length === 32 } catch { return false } }
export function exactScopes(value) { return Array.isArray(value) && JSON.stringify(value) === JSON.stringify(SCOPES) }
export function origin(value) { try { return new URL(value).origin === value && value.startsWith('https://') } catch { return false } }
function keys(value, expected) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...expected].sort().join(',') }
function parse(segment) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(unb64(segment))
  const value = JSON.parse(text)
  // Canonical JSON also rejects duplicate keys and ambiguous serialized claims.
  if (JSON.stringify(value) !== text) throw Error('Noncanonical JSON')
  return value
}
export async function verifyJws(token, trust, typ) {
  if (!trust || !origin(trust.issuer) || !origin(trust.audience) || !trust.kid || !trust.key || typeof token !== 'string' || token.length > 8192) throw Error('Trust unavailable')
  const parts = token.split('.')
  if (parts.length !== 3) throw Error('Invalid JWS')
  const header = parse(parts[0]), payload = parse(parts[1])
  if (!keys(header, ['alg','typ','kid']) || header.alg !== 'ES256' || header.typ !== typ || header.kid !== trust.kid || trust.key.type !== 'public' || trust.key.algorithm.name !== 'ECDSA' || trust.key.algorithm.namedCurve !== 'P-256') throw Error('Invalid header')
  const signature = unb64(parts[2])
  if (signature.length !== 64 || !await crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, trust.key, signature, enc.encode(parts.slice(0,2).join('.')))) throw Error('Invalid signature')
  if (trust.issuer === trust.audience || payload.iss !== trust.issuer || payload.aud !== trust.audience) throw Error('Invalid audience')
  return payload
}
export function times(p, now) {
  if (!Number.isSafeInteger(now) || ![p.iat,p.nbf,p.exp].every(Number.isSafeInteger) || p.iat > now || p.nbf > now || p.nbf < p.iat || p.exp <= now || p.exp <= p.nbf || p.exp-p.iat > 120) throw Error('Invalid time')
}
const supportFields = ['v','purpose','iss','aud','sub','site','tenant','epoch','consent_version','scopes','nonce','jti','iat','nbf','exp']
export const receiptFields = ['v','iss','aud','support_sub','portal_sub','support_site','portal_site','tenant','support_epoch','portal_epoch','support_consent_version','portal_consent_version','scopes','challenge','support_jti','support_digest','jti','iat','nbf','exp','purpose']
export async function inspectSupport(token, trust, expected, now = Math.floor(Date.now()/1000)) {
  const p = await verifyJws(token, trust, 'q02-support-intent+jwt')
  if (!keys(p,supportFields)) throw Error('Invalid support fields')
  times(p,now)
  if (p.v !== 1 || p.purpose !== 'account-memory-link-intent' || p.consent_version !== 'q02-support-v1' || p.nbf !== p.iat || !/^user_[A-Za-z0-9_-]{1,123}$/.test(p.sub) || !randomId(p.jti) || !exactScopes(p.scopes) || !Number.isSafeInteger(p.epoch) || p.epoch < 1 || !p.sub || !p.consent_version || !randomId(p.nonce) || typeof p.jti !== 'string' || !p.jti.length) throw Error('Invalid support claims')
  for (const k of ['site','tenant','nonce','sub','epoch','consent_version']) if (p[k] !== expected[k]) throw Error('Support binding mismatch')
  return p
}
export async function inspectReceipt(receipt, supportToken, trusts, expected, now = Math.floor(Date.now()/1000)) {
  if (!trusts?.support?.key || !trusts?.portal?.key || trusts.support.key === trusts.portal.key || trusts.support.issuer === trusts.portal.issuer) throw Error('Distinct trust required')
  // Reject the same mathematical public key even if separately imported. These
  // offline trust handles must be exportable; non-exportable handles fail closed.
  if (b64(await crypto.subtle.exportKey('raw',trusts.support.key)) === b64(await crypto.subtle.exportKey('raw',trusts.portal.key))) throw Error('Distinct keys required')
  if (trusts.support.audience !== trusts.portal.issuer || trusts.portal.audience !== trusts.support.issuer || !/^user_[A-Za-z0-9_-]{1,123}$/.test(expected.portalSub) || expected.portalSite === expected.support.site) throw Error('Invalid reciprocal trust')
  const s = await inspectSupport(supportToken, trusts.support, expected.support, now)
  const p = await verifyJws(receipt, trusts.portal, 'q02-portal-reciprocal+jwt')
  if (!keys(p, receiptFields)) throw Error('Invalid receipt fields')
  times(p,now)
  const binding = {v:1,purpose:PURPOSE,support_sub:s.sub,portal_sub:expected.portalSub,support_site:s.site,portal_site:expected.portalSite,tenant:s.tenant,support_epoch:s.epoch,portal_epoch:expected.portalEpoch,support_consent_version:s.consent_version,portal_consent_version:VERSION,challenge:s.nonce,support_jti:s.jti,support_digest:await digest(supportToken)}
  for (const [k,v] of Object.entries(binding)) if (p[k] !== v) throw Error('Receipt binding mismatch')
  if (!Number.isSafeInteger(p.portal_epoch) || p.portal_epoch < 1 || !exactScopes(p.scopes) || !randomId(p.jti) || p.nbf !== p.iat || p.exp > s.exp) throw Error('Invalid receipt')
  // Signature validity never establishes online epochs or atomic consumption.
  return { signatureValid:true, redemption:'DENIED', reason:'Online authority and atomic two-site coordinator unavailable' }
}
export function redeem() { throw Error('Reciprocal redemption disabled') }

// A separate, pinned portal Clerk RS256 session verification path. No profile lookup.
export async function verifyPortalSession(token, config, now = Math.floor(Date.now()/1000)) {
  if (!config?.jwtKey || !origin(config.party) || !config.issuer?.startsWith('https://')) throw Error('Portal authentication unavailable')
  if (typeof token !== 'string' || token.length > 8192) throw Error('Invalid session')
  const parts = token.split('.')
  if (parts.length !== 3) throw Error('Invalid session')
  // Clerk JWT JSON is not required to be canonically serialized. Reject duplicate
  // keys by requiring the decoded token to contain exactly one authoritative claim.
  const decode = s => new TextDecoder('utf-8',{fatal:true}).decode(unb64(s))
  const headerText=decode(parts[0]), claimText=decode(parts[1])
  const h=JSON.parse(headerText), p=JSON.parse(claimText)
  // Require canonical serialization for this restricted candidate; unsupported
  // Clerk serialization denies instead of silently accepting ambiguous claims.
  if (JSON.stringify(h)!==headerText || JSON.stringify(p)!==claimText || h.alg !== 'RS256' || h.jku || h.x5u || h.jwk || h.crit) throw Error('Invalid session header')
  const pem = config.jwtKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'')
  const key = await crypto.subtle.importKey('spki', Uint8Array.from(atob(pem),c=>c.charCodeAt(0)), {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify'])
  if (key.algorithm.modulusLength < 2048) throw Error('Weak session trust')
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,unb64(parts[2]),enc.encode(parts.slice(0,2).join('.')))) throw Error('Invalid session signature')
  if (p.iss!==config.issuer || p.azp!==config.party || !/^user_[A-Za-z0-9_-]{1,123}$/.test(p.sub) || typeof p.sid!=='string' || !/^sess_[A-Za-z0-9_-]{1,123}$/.test(p.sid) || !Number.isSafeInteger(p.exp) || p.exp<=now || !Number.isSafeInteger(p.nbf) || p.nbf>now || !Number.isSafeInteger(p.iat) || p.iat>now || (p.sts !== undefined && p.sts !== 'active')) throw Error('Invalid portal session claims')
  return { subject:p.sub, session:p.sid }
}
