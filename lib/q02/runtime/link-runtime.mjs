import { createOnlineSessionVerifier } from './live-authority.mjs'
import { createSiteAuthority } from './site-authority.mjs'
import { createCheckpointCoordinator } from './checkpoint-coordinator.mjs'
import { deny } from './link-wire.mjs'
// Constructed lazily per request. Values come from server config, never Host.
/** @param {{site: string, env: Record<string, string | undefined>, verifyToken: any, checkpointBinding?: any, connect?: any}} options */
export function createLinkRuntime({site,env,verifyToken,checkpointBinding=undefined,connect=undefined}) {
 if(!['support','portal'].includes(site)) deny()
 const prefix='Q02_'+site.toUpperCase()+'_', peer=site==='support'?'portal':'support'
 const origin=site==='support'?'https://support.yousafeconsultancy.com':env.Q02_PORTAL_AUTHORIZED_PARTY
 if(site==='portal' && !['https://portal.yousafeconsultancy.com','https://market.yousafeconsultancy.com'].includes(origin)) deny()
 const peerOrigin=site==='support'?env.Q02_PORTAL_AUTHORIZED_PARTY:'https://support.yousafeconsultancy.com'
 const sessions={}
 for(const name of ['support','portal']) {
  const p='Q02_'+name.toUpperCase()+'_'
  const issuer=env[p+'CLERK_ISSUER'],party=name==='support'?'https://support.yousafeconsultancy.com':env.Q02_PORTAL_AUTHORIZED_PARTY
  sessions[name]={issuer,party,verify:createOnlineSessionVerifier({issuer,party,jwtKey:env[p+'CLERK_JWT_KEY']??(name==='support'?env.CLERK_JWT_KEY:undefined),backendKey:env[p+'CLERK_BACKEND_KEY'],verifyToken})}
 }
 const tenant=env[prefix+'TENANT']
 if(env[prefix+'SITE']!==site) deny()
 const readJson=name=>{try{return JSON.parse(env[name]??'null')}catch{return null}}
 const authority=createSiteAuthority({site,tenant,connectionString:env[prefix+'DATABASE_URL'],verify:sessions[site].verify,...(connect?{connect}:{} )})
 let coordinator
 if(site==='support' && env.Q02_COORDINATOR_DATABASE_URL && checkpointBinding) coordinator=createCheckpointCoordinator({connectionString:env.Q02_COORDINATOR_DATABASE_URL,binding:checkpointBinding,trust:readJson('Q02_CHECKPOINT_TRUST'),...(connect?{connect}:{} )})
 return {site,tenant,origin,peerOrigin,authority,sessions,verify:sessions[site].verify,peerVerify:sessions[peer].verify,coordinator,
  privateJwk:readJson(prefix+'SIGNING_PRIVATE_JWK'),kid:env[prefix+'PROOF_KID'],servicePrivateJwk:site==='support'?readJson('Q02_SERVICE_SIGNING_PRIVATE_JWK'):null,serviceKid:site==='support'?env.Q02_SERVICE_PROOF_KID:undefined,
  credential:req=>{
   const cookies=(req.headers.get('cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('__session='))
   if(cookies.length!==1) deny()
   return cookies[0].slice('__session='.length)
  },
 }
}
