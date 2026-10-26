// Evidence inspector only. No DB client or positive request path is accepted.
// Signature checks never attest current epochs. Session verifiers/configuration
// must be constructed by a server, independently for each literal site.
import { inspectReciprocalReceipt } from './reciprocal.mjs'
const deny = () => { throw Error('Privacy authorization denied') }
const httpsOrigin = value => {
  try { return typeof value === 'string' && new URL(value).protocol === 'https:' && new URL(value).origin === value }
  catch { return false }
}
const digest = async x => Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))).toString('base64url')
export async function inspectSingleDbCandidate(input, authorities) {
  try {
    if (!authorities || authorities.support === authorities.portal ||
        typeof authorities.support?.verify !== 'function' || typeof authorities.portal?.verify !== 'function' ||
        authorities.support.party === authorities.portal.party) deny()
    if (authorities.support.verify===authorities.portal.verify) deny()
    const now = Math.floor(Date.now()/1000)
    const material = new Set()
    for (const [site,a] of [['support',authorities.support],['portal',authorities.portal]]) {
      // A shared Clerk instance is supported only with independently verified
      // site parties, credentials and enrolled subjects. Issuer equality alone
      // neither grants membership nor replaces the opposite site's proof.
      if(!httpsOrigin(a.issuer) || !httpsOrigin(a.party) || a.proof?.site!==site || !/^[A-Za-z0-9_-]{1,128}$/.test(a.proof?.tenant ?? '') || a.proof.tenant!==authorities.support.proof?.tenant ||
         !Array.isArray(a.proofKeys) || !a.proofKeys.length || a.proofKeys.length>4) deny()
      let selected=false
      const kids=new Set()
      for(const entry of a.proofKeys) {
        if(!entry || kids.has(entry.kid) || typeof entry.revoked!=='boolean' ||
           !Number.isSafeInteger(entry.notBefore) || !Number.isSafeInteger(entry.notAfter) || entry.notAfter<=entry.notBefore ||
           entry.publicJwk?.kty!=='EC' || entry.publicJwk?.crv!=='P-256' || 'd' in entry.publicJwk) deny()
        kids.add(entry.kid)
        const key=await crypto.subtle.importKey('jwk',entry.publicJwk,{name:'ECDSA',namedCurve:'P-256'},true,['verify'])
        const raw=Buffer.from(await crypto.subtle.exportKey('raw',key)).toString('hex')
        if(material.has(raw)) deny()
        material.add(raw)
        if(entry.kid===a.proof.kid) {
          if(entry.revoked || now<entry.notBefore || now>=entry.notAfter ||
             entry.publicJwk.x!==a.proof.publicJwk?.x || entry.publicJwk.y!==a.proof.publicJwk?.y) deny()
          selected=true
        }
      }
      if(!selected) deny()
    }
    // Credentials are opaque inputs to independent pinned verifiers, never JSON claims.
    const [s,p] = await Promise.all([
      authorities.support.verify(input.supportCredential), authorities.portal.verify(input.portalCredential),
    ])
    for (const [session,authority] of [[s,authorities.support],[p,authorities.portal]]) {
      if (session?.issuer !== authority.issuer || session?.party !== authority.party || session?.active !== true ||
          !/^user_[A-Za-z0-9_-]{1,123}$/.test(session?.sub) || !/^sess_[A-Za-z0-9_-]{1,123}$/.test(session?.sid) ||
          !Number.isSafeInteger(session.exp) || session.exp<=now) deny()
    }
    // Trust is selected only from server authority objects, not the input.
    await inspectReciprocalReceipt({receipt:input.receipt,supportProof:input.supportProof,
      supportConfig:authorities.support.proof,portalConfig:authorities.portal.proof,
      challenge:input.challenge,portalSubject:p.sub,now})
    const support = JSON.parse(Buffer.from(input.supportProof.split('.')[1],'base64url').toString('utf8'))
    if (support.sub!==s.sub) deny()
    return Object.freeze({decision:'DENY',derivedUse:false,signatureVerified:true,
      supportDigest:await digest(input.supportProof),receiptDigest:await digest(input.receipt),
      reason:'DEDICATED_DATABASE_AUTHORITY_UNPROVISIONED'})
  } catch { deny() }
}
