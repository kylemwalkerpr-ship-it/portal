// Server-only locked authority. Public routes construct pinned adapters; no caller
// can substitute enrollment, a session verifier, or a checkpoint readiness flag.
import { inspectSingleDbCandidate } from './single-db-candidate.mjs'
const deny = () => { throw Error('Privacy authorization denied') }
const enc = new TextEncoder()
const b64 = x => Buffer.from(x).toString('base64url')
export const authorityDigest = async x => b64(await crypto.subtle.digest('SHA-256', enc.encode(x)))
const exact = (x, keys) => x && Object.getPrototypeOf(x) === Object.prototype && Object.keys(x).sort().join() === [...keys].sort().join()
const origin = x => { try { return new URL(x).origin === x && new URL(x).protocol === 'https:' } catch { return false } }
const id = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x)
const hash = x => typeof x === 'string' && /^[A-Za-z0-9_-]{43}$/.test(x) && b64(Buffer.from(x,'base64url')) === x
const decode = x => {
  if (typeof x !== 'string' || !/^[A-Za-z0-9_-]+$/.test(x)) deny()
  const bytes = Buffer.from(x,'base64url')
  if (b64(bytes) !== x) deny()
  return bytes
}
const parse = x => {
  const p = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(x)))
  if (b64(JSON.stringify(p)) !== x) deny()
  return p
}

/** Local JWT signature verification AND a fresh pinned Clerk backend session
 * lookup. Never accepts JSON claims, request URLs, discovery URLs or redirects.
 * verifyToken must be the server SDK, fetchImpl a server transport. Tests inject
 * synthetic implementations. No successful response cache is permitted.
 */
export function createOnlineSessionVerifier({ issuer, party, jwtKey, backendKey, verifyToken, fetchImpl = fetch }) {
  return async token => {
    try {
      if (!origin(issuer) || !origin(party) || !jwtKey || !backendKey || typeof verifyToken !== 'function' || typeof token !== 'string' || token.length > 16384) deny()
      const c = await verifyToken(token,{jwtKey,authorizedParties:[party],clockSkewInMs:0})
      const now = Math.floor(Date.now()/1000)
      if (c?.iss !== issuer || c.azp !== party || !/^user_[A-Za-z0-9_-]{1,123}$/.test(c.sub) ||
          !/^sess_[A-Za-z0-9_-]{1,123}$/.test(c.sid) || ![c.exp,c.iat,c.nbf].every(Number.isSafeInteger) ||
          c.exp <= now || c.nbf > now || c.iat > now) deny()
      const response = await fetchImpl(`https://api.clerk.com/v1/sessions/${encodeURIComponent(c.sid)}`,{
        method:'GET',headers:{Authorization:`Bearer ${backendKey}`,Accept:'application/json'},
        cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000),
      })
      if (!response.ok) deny()
      const s = await response.json()
      const checked = Math.floor(Date.now()/1000)
      const expiry = Number.isSafeInteger(s?.expire_at) ? (s.expire_at >= 1_000_000_000_000 ? Math.floor(s.expire_at/1000) : s.expire_at) : 0
      if (s?.id !== c.sid || s.user_id !== c.sub || s.status !== 'active' ||
          expiry <= checked || c.exp <= checked) deny()
      return Object.freeze({issuer,party,sub:c.sub,sid:c.sid,exp:Math.min(c.exp,expiry),active:true})
    } catch { deny() }
  }
}

/** Service envelope binds original proof bytes, challenge and BOTH opaque
 * credentials by digest. Signing is performed by the separately enrolled service,
 * never this verifier. Public manifests and enrollment come from locked storage.
 */
export async function serviceEnvelope(token, manifest, requestDigest, now, scope = 'q02:link') {
  if (typeof token !== 'string' || token.length > 4096) deny()
  const parts = token.split('.')
  if (parts.length !== 3) deny()
  const [a,b,s] = parts, h = parse(a), p = parse(b)
  if (!exact(h,['alg','typ','kid']) || h.alg !== 'ES256' || h.typ !== 'q02-service+jwt' ||
      !exact(p,['v','iss','aud','sub','scope','tenant','request_digest','jti','iat','nbf','exp']) ||
      p.v !== 1 || p.scope !== scope || p.request_digest !== requestDigest || !hash(p.jti) ||
      ![now,p.iat,p.nbf,p.exp].every(Number.isSafeInteger) || p.iat !== p.nbf || p.nbf > now || p.exp <= now || p.exp <= p.iat || p.exp-p.iat > 30 ||
      !origin(manifest?.issuer) || !origin(manifest?.audience) || !id(manifest?.principal) || !id(manifest?.tenant) ||
      manifest.active !== true || manifest.scope !== scope || p.iss !== manifest.issuer || p.aud !== manifest.audience ||
      p.sub !== manifest.principal || p.tenant !== manifest.tenant || !Array.isArray(manifest.keys) || !manifest.keys.length || manifest.keys.length > 4) deny()
  const kids = new Set()
  let selected
  for (const k of manifest.keys) {
    if (!id(k.kid) || kids.has(k.kid) || typeof k.revoked !== 'boolean' || ![k.notBefore,k.notAfter].every(Number.isSafeInteger) ||
        k.notAfter <= k.notBefore || k.publicJwk?.kty !== 'EC' || k.publicJwk.crv !== 'P-256' || 'd' in k.publicJwk) deny()
    kids.add(k.kid)
    if (k.kid === h.kid) selected = k
  }
  if (!selected || selected.revoked || selected.notBefore > now || selected.notAfter <= now) deny()
  const key = await crypto.subtle.importKey('jwk',selected.publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
  if (decode(s).length !== 64 || !await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode(s),enc.encode(`${a}.${b}`))) deny()
  return p
}

export async function liveRequestDigest(input) {
  return authorityDigest(JSON.stringify([input.supportProof,input.receipt,input.challenge,
    await authorityDigest(input.supportCredential),await authorityDigest(input.portalCredential)]))
}

/** POSITIVE only through a separately implemented transactional authority port.
 * withLockedAuthority MUST hold both consent/enrollment/challenge/service locks
 * through online verification and atomic consumption; commit before returning.
 * No sequential RPC substitution, in-memory fallback or generic service_role.
 */
async function runLiveLink(input, adapter, prepare = false) {
  try {
    if (!exact(input,['supportProof','receipt','challenge','supportCredential','portalCredential','serviceProof']) ||
        Object.values(input).some(x => typeof x !== 'string' || !x || x.length > 16384) || !hash(input.challenge) ||
        adapter?.protocol !== 'q02-locked-authority-v8' || typeof adapter.withLockedAuthority !== 'function') deny()
    // Snapshot before awaits; caller mutation cannot change the authenticated bytes.
    const request = Object.freeze({...input}), requestDigest = await liveRequestDigest(request)
    return await adapter.withLockedAuthority(requestDigest, async tx => {
      const now = Math.floor(Date.now()/1000)
      const service = await serviceEnvelope(request.serviceProof,tx.service,requestDigest,now)
      if (tx.reconciliation?.ready !== true || !hash(tx.reconciliation.generation) ||
          !Number.isSafeInteger(tx.reconciliation.highWater) || tx.reconciliation.highWater < 1 ||
          (!prepare && (tx.reconciliation.local !== tx.reconciliation.highWater || tx.reconciliation.portal !== tx.reconciliation.highWater ||
          tx.outbox?.pending !== 0 || tx.outbox?.acknowledged !== true))) deny()
      const a = tx.authorities
      if (!a || a.support?.proof?.tenant !== service.tenant || a.portal?.proof?.tenant !== service.tenant) deny()
      // Existing strict ES256 + disjoint key manifests + independent sessions.
      // Its DENY result is evidence only; this engine adds the missing locks.
      const sessions = {}
      const authorities = Object.fromEntries(['support','portal'].map(site => [site,{...a[site],
        verify: async credential => { const session = await a[site].verify(credential); sessions[site] = session; return session },
      }]))
      if (a.support.verify === a.portal.verify) deny()
      // The service signing identity must not share either site's proof key.
      for (const k of tx.service.keys) for (const site of ['support','portal']) for (const proofKey of a[site].proofKeys ?? []) {
        const algorithm = {name:'ECDSA',namedCurve:'P-256'}
        const serviceKey = await crypto.subtle.importKey('jwk',k.publicJwk,algorithm,true,['verify'])
        const siteKey = await crypto.subtle.importKey('jwk',proofKey.publicJwk,algorithm,true,['verify'])
        if (b64(await crypto.subtle.exportKey('raw',serviceKey)) === b64(await crypto.subtle.exportKey('raw',siteKey))) deny()
      }
      const evidence = await inspectSingleDbCandidate(request,authorities)
      const support = parse(request.supportProof.split('.')[1]), portal = parse(request.receipt.split('.')[1])
      if (typeof tx.assertCurrent !== 'function' || typeof tx.consume !== 'function') deny()
      for (const [site,subject,epoch,version] of [
        ['support',support.sub,support.epoch,'q02-support-v1'],
        ['portal',portal.portal_sub,portal.portal_epoch,'portal-v7-1'],
      ]) {
        const row = tx.current?.[site], session = sessions[site]
        if (!row || row.site !== site || row.tenant !== service.tenant || row.subject !== subject ||
            row.issuer !== a[site].issuer || row.party !== a[site].party || row.membership !== 'active' ||
            row.enrolledSid !== session.sid || row.credentialStatus !== 'active' || row.issuance !== true ||
            row.state !== 'active' || row.epoch !== epoch || row.version !== version ||
            JSON.stringify(row.scopes) !== JSON.stringify(['derived_summary','preferences'])) deny()
      }
      const challenge = tx.current?.challenge
      if (!challenge || challenge.value !== request.challenge || challenge.subject !== sessions.portal.sub ||
          challenge.sessionDigest !== await authorityDigest(sessions.portal.sid) || challenge.state !== 'pending' ||
          challenge.epoch !== portal.portal_epoch || challenge.expiresAt <= now || !Number.isSafeInteger(challenge.expiresAt)) deny()
      // Adapter rechecks enrolled issuer/sub/sid, credential enrollment, consent,
      // proof-key/service revocation, challenge owner/session digest and DB clock.
      const binding = Object.freeze({requestDigest,supportDigest:evidence.supportDigest,receiptDigest:evidence.receiptDigest,
        supportSubject:support.sub,portalSubject:portal.portal_sub,supportEpoch:support.epoch,portalEpoch:portal.portal_epoch,
        supportJti:support.jti,portalJti:portal.jti,serviceJti:service.jti,challenge:request.challenge,
        supportSessionDigest:await authorityDigest(sessions.support.sid),portalSessionDigest:await authorityDigest(sessions.portal.sid),
        expiresAt:Math.min(support.exp,portal.exp,service.exp,sessions.support.exp,sessions.portal.exp),generation:tx.reconciliation.generation,highWater:tx.reconciliation.highWater})
      if (new Set([binding.supportJti,binding.portalJti,binding.serviceJti,request.challenge]).size !== 4 ||
          await tx.assertCurrent(binding) !== true || binding.expiresAt <= Math.floor(Date.now()/1000)) deny()
      if (prepare) {
        if (typeof tx.stage !== 'function') deny()
        const staged = await tx.stage(binding)
        if (staged?.staged !== true || staged.requestDigest !== requestDigest || !hash(staged.eventDigest)) deny()
        return Object.freeze({decision:'STAGED',requestDigest,eventDigest:staged.eventDigest,sequence:staged.sequence,derivedUse:false})
      }
      const result = await tx.consume(binding)
      if (!exact(result,['committed','requestDigest','eventDigest','bothAcknowledged']) || result.committed !== true ||
          result.requestDigest !== requestDigest || !hash(result.eventDigest) || result.bothAcknowledged !== true) deny()
      // Link receipt is not a data-use bearer capability. Every derived read
      // needs a new locked online check; no data access path exists in S8.
      return Object.freeze({decision:'LINKED',requestDigest,eventDigest:result.eventDigest,derivedUse:false})
    })
  } catch { deny() }
}

export const authorizeLiveLink = (input, adapter) => runLiveLink(input, adapter)
export const prepareLiveLink = (input, adapter) => runLiveLink(input, adapter, true)
