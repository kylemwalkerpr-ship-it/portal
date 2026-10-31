// Legacy compatibility handler; production uses runtime/link-api.mjs.
import { VERSION, SCOPES, digest, randomToken, exactScopes } from './protocol.mjs'
export const runtimeTrustReady = false // Separate security-reviewed provisioning/coordinator mission required.
export async function boundedJson(req) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw Error('Invalid body')
  const reader=req.body?.getReader(); if (!reader) throw Error('Missing body')
  let size=0; const chunks=[]
  try { while (true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>2048) throw Error('Body too large'); chunks.push(value) } }
  finally { await reader.cancel().catch(()=>{}); reader.releaseLock() }
  const bytes=new Uint8Array(size); let offset=0
  for(const part of chunks) { bytes.set(part,offset); offset+=part.length }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
}
const response=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer'}})
// session/store/config supplied ONLY by the server adapter, never body or headers.
export async function handleConsent(req, {session, config, store, ready=false}) {
  if (!session?.subject || !session.session) return response({error:'Verified portal session required'},401)
  if (!store || !config?.site || !config.tenant) return response({error:'Consent service unavailable'},503)
  let body={action:'review'}
  if(req.method==='POST') {
    if(req.headers.get('origin')!==config.party || req.headers.get('sec-fetch-site')==='cross-site') return response({error:'Forbidden'},403)
    try { body=await boundedJson(req) } catch { return response({error:'Invalid request'},400) }
    const fields={grant:['action','expectedEpoch','explicitOptIn','version','scopes'],withdraw:['action','expectedEpoch'],challenge:['action','expectedEpoch'],cancel:['action','expectedEpoch','challenge']}
    if(!body || !Object.hasOwn(fields,body.action) || Object.keys(body).sort().join()!==fields[body.action].sort().join() || !Number.isSafeInteger(body.expectedEpoch) || body.expectedEpoch<0) return response({error:'Invalid request'},400)
    if(body.action==='grant' && (body.explicitOptIn!==true || body.version!==VERSION || !exactScopes(body.scopes))) return response({error:'Explicit versioned consent required'},400)
    if(body.action==='cancel' && (typeof body.challenge!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(body.challenge))) return response({error:'Invalid challenge'},400)
    if(['grant','challenge'].includes(body.action) && !ready) return response({error:'Linking unavailable: trust and atomic coordinator are not provisioned'},503)
  } else if(req.method!=='GET') return response({error:'Method not allowed'},405)
  try {
    const challenge=body.action==='challenge'?randomToken():body.challenge
    const args={p_site:config.site,p_tenant:config.tenant,p_subject:session.subject,p_issuer:config.issuer,p_party:config.party,p_action:body.action,p_expected_epoch:body.expectedEpoch??null,p_opt_in:body.explicitOptIn===true,p_version:body.version??null,p_scopes:body.scopes??null,p_digest:challenge?await digest(challenge):null,p_session_digest:await digest(session.session)}
    const state=await store(args)
    if(!state || !Number.isSafeInteger(state.epoch) || state.epoch<0 || typeof state.active!=='boolean' || typeof state.enrollmentActive!=='boolean' || state.version!==VERSION || !Array.isArray(state.scopes) || (state.active?!exactScopes(state.scopes):state.scopes.length!==0) || state.redemption!=='DENIED') throw Error('Invalid state')
    return response({consent:{epoch:state.epoch,active:state.active,version:VERSION,scopes:state.scopes},available:ready && state.enrollmentActive===true,redemption:'DENIED',...(body.action==='challenge'?{challenge,expiresIn:120}:{})})
  } catch(error) {
    return response({error:'Consent operation was not confirmed; refresh and retry'},error?.code==='40001'?409:error?.code==='42501'?403:503)
  }
}
