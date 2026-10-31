import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {b64,randomToken,digest,VERSION,SCOPES,PURPOSE,verifyPortalSession,inspectSupport,inspectReceipt,redeem} from '../lib/q02/protocol.mjs'
import {handleConsent,runtimeTrustReady} from '../lib/q02/api.mjs'
const enc=new TextEncoder(), now=1800000000
async function pair() { return crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']) }
async function sign(payload,key,typ='q02-support-intent+jwt',kid='support-1',extra={}) {
 const input=[{alg:'ES256',typ,kid,...extra},payload].map(x=>b64(enc.encode(JSON.stringify(x)))).join('.')
 return `${input}.${b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(input)))}`
}
const support=await pair(), portal=await pair()
const trust={issuer:'https://support.test',audience:'https://portal.test',kid:'support-1',key:support.publicKey}
const portalTrust={issuer:'https://portal.test',audience:'https://support.test',kid:'portal-1',key:portal.publicKey}
const s={v:1,purpose:'account-memory-link-intent',iss:trust.issuer,aud:trust.audience,sub:'user_support',site:'support',tenant:'tenant',epoch:2,consent_version:'q02-support-v1',scopes:[...SCOPES],nonce:randomToken(),jti:randomToken(),iat:now,nbf:now,exp:now+120}
const expected={support:{site:s.site,tenant:s.tenant,nonce:s.nonce,sub:s.sub,epoch:s.epoch,consent_version:s.consent_version},portalSub:'user_portal',portalSite:'portal',portalEpoch:3}
const proof=await sign(s,support.privateKey)
const r={v:1,iss:portalTrust.issuer,aud:portalTrust.audience,support_sub:s.sub,portal_sub:expected.portalSub,support_site:s.site,portal_site:'portal',tenant:s.tenant,support_epoch:s.epoch,portal_epoch:3,support_consent_version:s.consent_version,portal_consent_version:VERSION,scopes:[...SCOPES],challenge:s.nonce,support_jti:s.jti,support_digest:await digest(proof),jti:randomToken(),iat:now,nbf:now,exp:now+120,purpose:PURPOSE}
const receipt=await sign(r,portal.privateKey,'q02-portal-reciprocal+jwt','portal-1')
test('valid two-signature vector remains DENIED, including repeats',async()=>{
 for(let i=0;i<2;i++) assert.equal((await inspectReceipt(receipt,proof,{support:trust,portal:portalTrust},expected,now)).redemption,'DENIED')
 assert.throws(redeem,/disabled/); assert.equal(runtimeTrustReady,false)
})
for(const [field,value] of Object.entries({aud:'https://evil.test',sub:'user_other',tenant:'other',epoch:1,nonce:randomToken(),consent_version:'old',scopes:['preferences'],exp:now+121,jti:'weak',v:2,purpose:'other'})) test(`support rejects ${field}`,async()=>{
 await assert.rejects(inspectSupport(await sign({...s,[field]:value},support.privateKey),trust,expected.support,now))
})
for(const [field,value] of Object.entries({support_sub:'user_other',portal_sub:'user_other',support_site:'other',portal_site:'other',tenant:'other',support_epoch:1,portal_epoch:2,support_consent_version:'old',portal_consent_version:'old',challenge:randomToken(),support_jti:randomToken(),support_digest:randomToken(),v:2,purpose:'other',exp:now+121,scopes:['preferences']})) test(`receipt rejects ${field}`,async()=>{
 await assert.rejects(inspectReceipt(await sign({...r,[field]:value},portal.privateKey,'q02-portal-reciprocal+jwt','portal-1'),proof,{support:trust,portal:portalTrust},expected,now))
})
test('forgery, missing trust, unknown kid, key URL, extra/duplicate claims, expiration deny',async()=>{
 await assert.rejects(inspectSupport(await sign(s,portal.privateKey),trust,expected.support,now))
 await assert.rejects(inspectSupport(proof,null,expected.support,now))
 await assert.rejects(inspectSupport(await sign(s,support.privateKey,undefined,'unknown'),trust,expected.support,now))
 await assert.rejects(inspectSupport(await sign(s,support.privateKey,undefined,undefined,{jku:'https://evil.test/key'}),trust,expected.support,now))
 await assert.rejects(inspectSupport(await sign({...s,extra:true},support.privateKey),trust,expected.support,now))
 const parts=proof.split('.'); parts[1]=b64(enc.encode(JSON.stringify(s).replace('"v":1','"v":1,"v":1')))
 await assert.rejects(inspectSupport(parts.join('.'),trust,expected.support,now))
 await assert.rejects(inspectSupport(proof,trust,expected.support,now+120))
})
const rsa=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify'])
const jwtKey=`-----BEGIN PUBLIC KEY-----\n${Buffer.from(await crypto.subtle.exportKey('spki',rsa.publicKey)).toString('base64')}\n-----END PUBLIC KEY-----`
const config={issuer:'https://clerk.test',party:'https://portal.test',jwtKey,site:'portal',tenant:'tenant'}
const claims={iss:config.issuer,azp:config.party,sub:'user_portal',sid:'sess_portal',iat:now,nbf:now,exp:now+60}
async function session(p=claims,key=rsa.privateKey) {
 const input=[{alg:'RS256',typ:'JWT'},p].map(x=>b64(enc.encode(JSON.stringify(x)))).join('.')
 return `${input}.${b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(input)))}`
}
test('independent pinned Clerk sub/sid/issuer/party verified',async()=>assert.deepEqual(await verifyPortalSession(await session(),config,now),{subject:'user_portal',session:'sess_portal'}))
for(const [field,value] of Object.entries({iss:'https://foreign.test',azp:'https://support.test',sub:'',sid:'',exp:now,nbf:now+1,iat:now+1,sts:'pending'})) test(`session rejects ${field}`,async()=>assert.rejects(verifyPortalSession(await session({...claims,[field]:value}),config,now)))
test('missing pin and forged Clerk signature deny',async()=>{
 await assert.rejects(verifyPortalSession(await session(),{...config,jwtKey:null},now))
 const bad=await session(); await assert.rejects(verifyPortalSession(bad.slice(0,-12)+'AAAAAAAAAAAA',config,now))
})
const state={epoch:1,active:true,version:VERSION,scopes:[...SCOPES],enrollmentActive:true,redemption:'DENIED'}
const options={session:{subject:'user_portal',session:'sess_portal'},config,store:async()=>state}
const req=(body,origin=config.party)=>new Request('https://ignored.test/api/privacy/reciprocal',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
test('anonymous and body identities never authorize',async()=>{
 assert.equal((await handleConsent(req({action:'withdraw',expectedEpoch:1}),{...options,session:null})).status,401)
 assert.equal((await handleConsent(req({action:'withdraw',expectedEpoch:1,subject:'user_other'}),options)).status,400)
})
test('CSRF pinned origin and bounded body',async()=>{
 assert.equal((await handleConsent(req({action:'withdraw',expectedEpoch:1},'https://support.test'),options)).status,403)
 assert.equal((await handleConsent(req({action:'withdraw',expectedEpoch:1,x:'a'.repeat(3000)}),options)).status,400)
})
test('runtime unavailable never grants or issues; withdrawal still calls durable store',async()=>{
 for(const body of [{action:'grant',expectedEpoch:1,explicitOptIn:true,version:VERSION,scopes:SCOPES},{action:'challenge',expectedEpoch:1}]) assert.equal((await handleConsent(req(body),options)).status,503)
 let called=false
 const result=await handleConsent(req({action:'withdraw',expectedEpoch:1}),{...options,store:async args=>{called=true; assert.equal(args.p_subject,'user_portal'); return {...state,active:false,scopes:[],epoch:2} }})
 assert.equal(result.status,200);assert.ok(called)
 assert.equal(result.headers.get('cache-control'),'no-store')
})
test('challenge uses server randomness, session hash, scoped store and omits identities',async()=>{
 let args
 const res=await handleConsent(req({action:'challenge',expectedEpoch:1}),{...options,ready:true,store:async a=>{args=a;return state}})
 const data=await res.json(); assert.equal(res.status,200);assert.match(data.challenge,/^[A-Za-z0-9_-]{43}$/)
 assert.equal(args.p_digest,await digest(data.challenge)); assert.equal(args.p_session_digest,await digest('sess_portal'))
 assert.ok(!JSON.stringify(data).includes('user_portal'))
})
test('stale epoch and DB outage are non-success; malformed adapter denies',async()=>{
 for(const [error,status] of [[{code:'40001'},409],[{code:'42501'},403],[Error('offline'),503]]) assert.equal((await handleConsent(req({action:'withdraw',expectedEpoch:1}),{...options,store:async()=>{throw error}})).status,status)
 assert.equal((await handleConsent(new Request('https://portal.test'),{...options,store:async()=>null})).status,503)
})
test('offline vectors interoperate with pinned support S3 field contract',()=>{
 assert.deepEqual(Object.keys(s).sort(),['v','iss','aud','sub','site','tenant','purpose','scopes','nonce','jti','iat','nbf','exp','epoch','consent_version'].sort())
 const route=readFileSync(new URL('../app/api/privacy/reciprocal/route.ts',import.meta.url),'utf8')
 assert.ok(!route.includes('requirePortalUser'));assert.ok(!route.includes('console.'))
})
test('prototype action names and primitive JSON deny without store effects',async()=>{
 for (const action of ['__proto__','toString','constructor']) assert.equal((await handleConsent(req({action,expectedEpoch:1}),options)).status,400)
 for (const body of [null,[],true,'withdraw']) assert.equal((await handleConsent(req(body),options)).status,400)
})
test('independently imported identical public keys cannot become reciprocal trust',async()=>{
 const duplicate=await crypto.subtle.importKey('jwk',await crypto.subtle.exportKey('jwk',support.publicKey),{name:'ECDSA',namedCurve:'P-256'},true,['verify'])
 await assert.rejects(inspectReceipt(receipt,proof,{support:trust,portal:{...portalTrust,key:duplicate}},expected,now),/Distinct keys/)
})
test('receipt JTI must be unguessable canonical 256-bit identifier',async()=>{
 for (const jti of ['weak','A'.repeat(42)+'B']) await assert.rejects(inspectReceipt(await sign({...r,jti},portal.privateKey,'q02-portal-reciprocal+jwt','portal-1'),proof,{support:trust,portal:portalTrust},expected,now))
})
