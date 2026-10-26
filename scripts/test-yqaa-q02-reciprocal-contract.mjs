// Offline only. Reads pinned S3 source; never instantiates a DB/network adapter.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import {b64,digest,randomToken,SCOPES,VERSION,PURPOSE,inspectReceipt} from '../lib/q02/protocol.mjs'
const source=process.argv[2]
if (!source) throw Error('Pass the approved support S3 source directory (read-only)')
const {issueIntent}=await import(pathToFileURL(`${source}/lib/privacy/attestation.mjs`))
const {inspectReciprocalReceipt}=await import(pathToFileURL(`${source}/lib/privacy/reciprocal.mjs`))
const pair=()=>crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
const support=await pair(), portal=await pair(), now=Math.floor(Date.now()/1000), challenge=randomToken()
const supportConfig={enabled:true,issuer:'https://support.test',audience:'https://portal.test',site:'support',tenant:'tenant',kid:'s3-vector',publicJwk:await crypto.subtle.exportKey('jwk',support.publicKey),privateJwk:await crypto.subtle.exportKey('jwk',support.privateKey)}
const portalConfig={issuer:'https://portal.test',audience:'https://support.test',site:'portal',kid:'v7-vector',consentVersion:VERSION,publicJwk:await crypto.subtle.exportKey('jwk',portal.publicKey)}
const supportProof=await issueIntent({config:supportConfig,session:{sub:'user_support',sid:'sess_support'},membership:{subject:'user_support',site:'support',tenant:'tenant'},consent:{accepted:true,disclosure:'q02-support-v1',scopes:[...SCOPES],epoch:2},nonce:challenge,store:{reserve:async()=>true},now})
const s=JSON.parse(Buffer.from(supportProof.split('.')[1],'base64url').toString())
const p={v:1,iss:portalConfig.issuer,aud:portalConfig.audience,support_sub:s.sub,portal_sub:'user_portal',support_site:s.site,portal_site:'portal',tenant:s.tenant,support_epoch:s.epoch,portal_epoch:3,support_consent_version:s.consent_version,portal_consent_version:VERSION,scopes:[...SCOPES],challenge,support_jti:s.jti,support_digest:await digest(supportProof),jti:randomToken(),iat:now,nbf:now,exp:s.exp,purpose:PURPOSE}
const enc=new TextEncoder()
async function sign(p) {
 const input=[{alg:'ES256',typ:'q02-portal-reciprocal+jwt',kid:portalConfig.kid},p].map(x=>b64(enc.encode(JSON.stringify(x)))).join('.')
 return `${input}.${b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},portal.privateKey,enc.encode(input)))}`
}
const receipt=await sign(p)
const args={receipt,supportProof,supportConfig,portalConfig,challenge,portalSubject:'user_portal',now}
assert.equal((await inspectReciprocalReceipt(args)).redemption,'DENY')
assert.equal((await inspectReceipt(receipt,supportProof,{support:{issuer:supportConfig.issuer,audience:supportConfig.audience,kid:supportConfig.kid,key:support.publicKey},portal:{issuer:portalConfig.issuer,audience:portalConfig.audience,kid:portalConfig.kid,key:portal.publicKey}},{support:{site:s.site,tenant:s.tenant,sub:s.sub,epoch:s.epoch,consent_version:s.consent_version,nonce:challenge},portalSub:'user_portal',portalSite:'portal',portalEpoch:3},now)).redemption,'DENIED')
for(const change of [{support_digest:randomToken()},{support_jti:randomToken()},{portal_sub:'user_other'},{tenant:'other'},{challenge:randomToken()}]) await assert.rejects(inspectReciprocalReceipt({...args,receipt:await sign({...p,...change})}))
console.log('7 offline cross-source contract checks passed; both implementations deny redemption. Ephemeral keys only; no proofs printed.')
