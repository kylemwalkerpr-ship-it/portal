// Offline verifier scaffolding, deliberately absent from the account route.
// A valid signature is evidence only; it cannot authorize any data use/link.
import { verifyIntent } from './attestation.mjs'
const deny = () => { throw new Error('Privacy authorization denied') }
const encode = bytes => Buffer.from(bytes).toString('base64url')
function decode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) deny()
  const bytes = Buffer.from(value, 'base64url')
  if (encode(bytes) !== value) deny()
  return bytes
}
const fields = ['v','iss','aud','support_sub','portal_sub','support_site','portal_site','tenant','support_epoch','portal_epoch','support_consent_version','portal_consent_version','scopes','challenge','support_jti','support_digest','jti','iat','nbf','exp','purpose']
const exact = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).sort().join() === [...keys].sort().join()
/** Verify a proposed portal receipt against separately pinned public key and the
 * original support proof. All config/context values are server-selected.
 * No online epoch authority, replay ledger, or consumption is implemented here.
 */
export async function inspectReciprocalReceipt({ receipt, supportProof, supportConfig, portalConfig: c, challenge, portalSubject, now = Math.floor(Date.now()/1000) }) {
  try {
    if (!c || c.issuer === supportConfig.issuer || c.audience !== supportConfig.issuer || c.issuer !== supportConfig.audience ||
        c.site === supportConfig.site || !/^[A-Za-z0-9_-]{1,128}$/.test(c.site) || !c.kid ||
        !c.publicJwk || (c.publicJwk.x === supportConfig.publicJwk?.x && c.publicJwk.y === supportConfig.publicJwk?.y) || 'd' in c.publicJwk || c.publicJwk.kty !== 'EC' || c.publicJwk.crv !== 'P-256' ||
        typeof receipt !== 'string' || receipt.length > 8192 || !/^user_[A-Za-z0-9_-]{1,123}$/.test(portalSubject)) deny()
    const support = await verifyIntent(supportProof, { config: supportConfig, nonce: challenge, now })
    const parts = receipt.split('.')
    if (parts.length !== 3) deny()
    const [a,b,s] = parts
    const h = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(a)))
    const p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(b)))
    if (!exact(h,['alg','typ','kid']) || h.alg !== 'ES256' || h.typ !== 'q02-portal-reciprocal+jwt' || h.kid !== c.kid ||
        encode(JSON.stringify(h)) !== a || encode(JSON.stringify(p)) !== b || !exact(p,fields)) deny()
    const key = await crypto.subtle.importKey('jwk',c.publicJwk,{ name:'ECDSA',namedCurve:'P-256' },true,['verify'])
    const supportKey = await crypto.subtle.importKey('jwk',supportConfig.publicJwk,{ name:'ECDSA',namedCurve:'P-256' },true,['verify'])
    if (encode(await crypto.subtle.exportKey('raw',key)) === encode(await crypto.subtle.exportKey('raw',supportKey))) deny()
    const sig = decode(s)
    if (sig.length !== 64 || !await crypto.subtle.verify({ name:'ECDSA',hash:'SHA-256' },key,sig,new TextEncoder().encode(`${a}.${b}`))) deny()
    const digest = encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(supportProof)))
    if (p.v !== 1 || p.iss !== c.issuer || p.aud !== c.audience || p.purpose !== 'account-memory-link-reciprocal' ||
        p.support_sub !== support.sub || p.portal_sub !== portalSubject || p.support_site !== support.site || p.portal_site !== c.site ||
        p.tenant !== support.tenant || p.support_epoch !== support.epoch || p.support_consent_version !== support.consent_version ||
        c.consentVersion !== 'portal-v7-1' || p.portal_consent_version !== c.consentVersion || typeof c.consentVersion !== 'string' || !c.consentVersion ||
        JSON.stringify(support.scopes) !== JSON.stringify(['derived_summary','preferences']) || p.scopes?.join() !== support.scopes.join() || !Array.isArray(p.scopes) || p.challenge !== challenge ||
        p.support_jti !== support.jti || p.support_digest !== digest || !/^[A-Za-z0-9_-]{43}$/.test(p.jti) || decode(p.jti).length !== 32 || p.jti === support.jti || p.jti === challenge ||
        ![now,p.iat,p.nbf,p.exp,p.portal_epoch].every(Number.isSafeInteger) || p.portal_epoch < 1 || p.iat !== p.nbf ||
        p.exp <= p.iat || p.exp > support.exp || p.exp-p.iat > 120 || now < p.nbf || now >= p.exp) deny()
    return Object.freeze({ signatureVerified: true, redemption: 'DENY', reason: 'Trusted portal online epochs and atomic replay consumption are not provisioned' })
  } catch { deny() }
}
export async function redeemReciprocal() { deny() }
