import { issueIntent, DISCLOSURE, newChallenge, verifyIntent } from './attestation.mjs'
import { authorityDigest, liveRequestDigest, prepareLiveLink, authorizeLiveLink } from './live-authority.mjs'
import { exact, deny, hash, payload, signWire, currentSigner, verifyWire, boundedLinkJson, linkResponse } from './link-wire.mjs'
const scopes=['derived_summary','preferences']
const version=site=>site==='support'?DISCLOSURE.version:'portal-v7-1'
const fields={review:[],grant:['accepted','disclosure','scopes'],withdraw:[],challenge:['expectedEpoch'],issue:['accepted','disclosure','scopes','nonce'],receipt:['supportProof','challenge'],event:['requestDigest'],ack:['requestDigest','ownAck','peerAck','peerCredential'],stage:['supportProof','receipt','challenge','portalCredential'],consume:['supportProof','receipt','challenge','supportCredential','portalCredential','serviceProof']}
async function signer(context, runtime) {
 const c=context?.proof, peer=context?.peer?.proof
 if(!runtime.privateJwk?.d || !exact(c,['enabled','issuer','audience','site','tenant','kid','publicJwk',...(runtime.site==='portal'?['consentVersion']:[])])) deny()
 if(peer?.site!==(runtime.site==='support'?'portal':'support') || peer.tenant!==runtime.tenant || peer.issuer!==runtime.peerOrigin || peer.audience!==runtime.origin || peer.enabled!==true || context.peer.party!==runtime.peerOrigin) deny()
 if(c?.site!==runtime.site || c.tenant!==runtime.tenant || c.kid!==runtime.kid || c.enabled!==true || c.issuer!==runtime.origin || c.audience!==runtime.peerOrigin) deny()
 const material=new Set()
 for(const manifest of [context,context.peer,context.service]) {
  const entries=manifest?.proofKeys??manifest?.keys
  if(!Array.isArray(entries) || entries.length<1 || entries.length>4) deny()
  for(const entry of entries) {
   const k=await currentSigner(manifest,null,entry.kid)
   const key=await crypto.subtle.importKey('jwk',k.publicJwk,{name:'ECDSA',namedCurve:'P-256'},true,['verify'])
   const raw=Buffer.from(await crypto.subtle.exportKey('raw',key)).toString('hex')
   if(material.has(raw)) deny()
   material.add(raw)
  }
 }
 if(!exact(context.service,['issuer','audience','principal','tenant','active','scope','keys']) || context.service?.active!==true || context.service?.tenant!==runtime.tenant || context.service?.scope!=='q02:link') deny()
 const key=await currentSigner(context,runtime.privateJwk,runtime.kid)
 if(key.publicJwk.x!==c.publicJwk?.x || key.publicJwk.y!==c.publicJwk?.y) deny()
 return {...c,privateJwk:runtime.privateJwk}
}
function consent(context,site) {return context.consent??{epoch:0,active:false,scopes:[],version:version(site)}}
function validateOptin(body,site) {
 if(body.accepted!==true || body.disclosure!==version(site) || JSON.stringify(body.scopes)!==JSON.stringify(scopes)) deny()
}
async function peerSession(runtime,token,descriptor) {
 const s=await runtime.peerVerify(token)
 if(s.active!==true || s.sub!==descriptor.subject || await authorityDigest(s.sid)!==descriptor.sessionDigest || s.exp<=Math.floor(Date.now()/1000)) deny()
 return s
}
/** Site runtime/config are server constructed. No request origin, profile, email,
 * service_role, enrollment marker, or caller-selected identity can grant access. */
export async function handleLinkRequest(req,action,runtime) {
 try {
  if(!Object.hasOwn(fields,action) && action!=='forget') return linkResponse({error:'Unknown operation'},405)
  if(req.method==='GET' ? !['review','forget'].includes(action) : req.method!=='POST') return linkResponse({error:'Method not allowed'},405)
  let body={}
  if(req.method==='POST') {
   if(req.headers.get('origin')!==runtime.origin || ![null,'same-origin'].includes(req.headers.get('sec-fetch-site'))) deny()
   body=await boundedLinkJson(req)
   if(!exact(body,fields[action]??[])) deny()
  }
  const credential=runtime.credential(req)
  if(!credential) deny()
  if(action==='forget') {
   await runtime.authority.withSession(credential,async()=>{})
   return linkResponse({forgetAvailable:false,derivedUse:false,correctionAvailable:false,deleted:false},req.method==='POST'?409:200)
  }
  if(action==='stage' || action==='consume') {
   if(runtime.site!=='support' || !runtime.coordinator) deny()
   // A user must be on the Support origin and own the exact Support session in
   // the continuation. Both credentials are verified again under authority lock.
   let input
   if(action==='stage') {
    const context=await runtime.authority.withSession(credential,tx=>tx.command({action:'review'}))
    await signer(context,runtime)
    const service=context.service
    if(!runtime.servicePrivateJwk?.d || service?.active!==true || service.tenant!==runtime.tenant || service.scope!=='q02:link') deny()
    await currentSigner(service,runtime.servicePrivateJwk,runtime.serviceKid,Math.floor(Date.now()/1000)+30)
    input={...body,supportCredential:credential,serviceProof:''}
    const now=Math.floor(Date.now()/1000)
    input.serviceProof=await signWire('q02-service+jwt',runtime.serviceKid,{v:1,iss:service.issuer,aud:service.audience,sub:service.principal,scope:'q02:link',tenant:runtime.tenant,request_digest:await liveRequestDigest(input),jti:newChallenge(),iat:now,nbf:now,exp:now+30},runtime.servicePrivateJwk)
   } else input={...body}
   const [current,original]=await Promise.all([runtime.verify(credential),runtime.verify(input.supportCredential)])
   if(current.sub!==original.sub || current.sid!==original.sid) deny()
   const adapter={protocol:'q02-locked-authority-v8',withLockedAuthority:(requestDigest,callback)=>runtime.coordinator.withLockedAuthority({input,tenant:runtime.tenant,sessions:runtime.sessions,phase:action==='stage'?'stage':'consume',requestDigest,callback})}
   const result=await (action==='stage'?prepareLiveLink:authorizeLiveLink)(input,adapter)
   return linkResponse({...result,...(action==='stage'?{continuation:input}:{})})
  }
  return await runtime.authority.withSession(credential,async tx=>{
   if(action==='withdraw') {
    // Withdrawal is independent of signing/checkpoint availability.
    const context=await tx.command({action:'withdraw_context'}), c=consent(context,runtime.site)
    await tx.command({action:'withdraw',epoch:c.epoch,scopes:[],version:version(runtime.site)})
    return linkResponse({state:'withdrawn',derivedUse:false,recordsDeleted:false})
   }
   const context=await tx.command({action:'review'}), c=consent(context,runtime.site)
   if(action==='review') {
    let available=false
    try {await signer(context,runtime); available=true} catch {}
    return linkResponse({peerOrigin:runtime.peerOrigin,consent:c,state:c.active?'active':'withdrawn',scopes:c.scopes,disclosure:runtime.site==='support'?DISCLOSURE:{version:'portal-v7-1'},issuanceAvailable:available,available,linkingAvailable:false,continuationAvailable:available,derivedUse:false,forgetAvailable:false,correctionAvailable:false})
   }
   const config=await signer(context,runtime)
   if(action==='grant') {
    validateOptin(body,runtime.site)
    const result=await tx.command({action:'grant',epoch:c.epoch,scopes,version:version(runtime.site)})
    return linkResponse({state:'active',epoch:result.epoch,derivedUse:false})
   }
   if(!c.active || JSON.stringify(c.scopes)!==JSON.stringify(scopes)) deny()
   if(action==='challenge') {
    if(runtime.site!=='portal' || body.expectedEpoch!==c.epoch) deny()
    const challenge=newChallenge()
    await tx.command({action:'challenge',epoch:c.epoch,digest:await authorityDigest(challenge)})
    return linkResponse({challenge,expiresIn:120,derivedUse:false})
   }
   if(action==='issue') {
    if(runtime.site!=='support') deny()
    validateOptin(body,'support')
    const proof=await issueIntent({config,session:tx.session,membership:{subject:tx.session.sub,site:'support',tenant:runtime.tenant},consent:{...body,epoch:c.epoch},nonce:body.nonce,store:{reserve:async p=>{await tx.command({action:'reserve',epoch:p.epoch,scopes:p.scopes,jti:p.jti,nonce:p.nonce,iat:p.iat,exp:p.exp});return true}}})
    return linkResponse({proof,supportCredential:credential,challenge:body.nonce,expiresIn:120,derivedUse:false})
   }
   if(action==='receipt') {
    if(runtime.site!=='portal' || !hash(body.challenge)) deny()
    const live=await tx.receipt(body.challenge), peer=context.peer, now=Math.floor(Date.now()/1000)
    const h=payload(body.supportProof)
    const key=await currentSigner(peer,null,peer.proof.kid,h.exp)
    if(key.publicJwk.x!==peer.proof.publicJwk?.x || key.publicJwk.y!==peer.proof.publicJwk?.y || key.publicJwk.x===config.publicJwk.x && key.publicJwk.y===config.publicJwk.y) deny()
    const support=await verifyIntent(body.supportProof,{config:peer.proof,nonce:body.challenge})
    if(support.tenant!==runtime.tenant || support.site!=='support') deny()
    const p={v:1,iss:config.issuer,aud:config.audience,support_sub:support.sub,portal_sub:tx.session.sub,support_site:'support',portal_site:'portal',tenant:runtime.tenant,support_epoch:support.epoch,portal_epoch:c.epoch,support_consent_version:DISCLOSURE.version,portal_consent_version:'portal-v7-1',scopes,challenge:body.challenge,support_jti:support.jti,support_digest:await authorityDigest(body.supportProof),jti:newChallenge(),iat:now,nbf:now,exp:Math.min(support.exp,live.challengeExpiresAt,tx.session.exp),purpose:'account-memory-link-reciprocal'}
    if(p.exp<=now || await tx.reserveReceipt({jti:p.jti,challenge:p.challenge,supportDigest:p.support_digest,supportJti:p.support_jti,supportSubject:p.support_sub,supportEpoch:p.support_epoch,portalEpoch:p.portal_epoch,iat:p.iat,exp:p.exp})!==true) deny()
    return linkResponse({receipt:await signWire('q02-portal-reciprocal+jwt',config.kid,p,config.privateJwk),portalCredential:credential,challenge:body.challenge,derivedUse:false})
   }
   if(['event','ack'].includes(action)) {
    if(!hash(body.requestDigest)) deny()
    const event=await tx.event(body.requestDigest)
    if(action==='event') return linkResponse({ack:await signWire('q02-event-ack+jwt',config.kid,event.descriptor,config.privateJwk),requestDigest:body.requestDigest,derivedUse:false})
    if(!event.peerDescriptor) deny()
    await verifyWire(body.ownAck,'q02-event-ack+jwt',context,event.descriptor)
    await verifyWire(body.peerAck,'q02-event-ack+jwt',context.peer,event.peerDescriptor)
    // Re-pin peer issuer/party against metadata from this locked DB transaction.
    const peer=await peerSession(runtime,body.peerCredential,event.peerDescriptor)
    if(peer.issuer!==context.peer.issuer || peer.party!==context.peer.party) deny()
    const result=await tx.ack(event.descriptor,event.peerDescriptor)
    return linkResponse({...result,derivedUse:false})
   }
   deny()
  })
 } catch { return linkResponse({error:'Privacy request unavailable or denied',derivedUse:false},403) }
}
