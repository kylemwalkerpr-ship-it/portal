import pg from 'pg'
import { authorityDigest } from './live-authority.mjs'
import { newChallenge } from './attestation.mjs'
import { deny } from './link-wire.mjs'
// No public bootstrap/admin connection. Each instance has exactly one DB login.
export function createSiteAuthority({site,tenant,connectionString,verify,connect=()=>new pg.Client({connectionString,connectionTimeoutMillis:5000,query_timeout:8000})}) {
 const url=new URL(connectionString)
 if(!['support','portal'].includes(site) || !/^[A-Za-z0-9_-]{1,128}$/.test(tenant) || !['postgres:','postgresql:'].includes(url.protocol) || url.searchParams.get('sslmode')!=='verify-full' || typeof verify!=='function') deny()
 return Object.freeze({
 async withSession(credential, callback) {
  let client,began=false,committed=false
  try {
   // Verify before connecting AND again under the same fence as enrollment/write.
   const initial=await verify(credential)
   client=connect(); await client.connect()
   const identity=await client.query('select session_user::text as login,current_user::text as role')
   if(identity.rows.length!==1 || identity.rows[0].login!==`q02_${site}_runtime` || identity.rows[0].role!==`q02_${site}_runtime`) deny()
   await client.query('BEGIN'); began=true
   await client.query("set local lock_timeout='1500ms'; set local statement_timeout='8s'; set local idle_in_transaction_session_timeout='12s'")
   // Enrollment obtains global fence; a second live check is held through commit.
   const sd=await authorityDigest(initial.sid)
   const enrolled=await client.query('select q02_runtime.enroll_session($1,$2,$3,$4,$5,$6) as enrolled',[tenant,initial.sub,sd,initial.issuer,initial.party,initial.exp])
   if(enrolled.rows[0]?.enrolled!==true) deny()
   const session=await verify(credential)
   if(session.active!==true || session.sub!==initial.sub || session.sid!==initial.sid || session.issuer!==initial.issuer || session.party!==initial.party || session.exp<=Math.floor(Date.now()/1000)) deny()
   const query=async(sql,args,field)=>{ const r=await client.query(sql,args); if(r.rows.length!==1 || r.rows[0][field]==null) deny(); return r.rows[0][field] }
   const base=[tenant,session.sub,sd]
   const tx={session,credential,site,tenant,
    command:p=>query('select q02_runtime.site_command($1,$2,$3,$4::jsonb) as value',[...base,JSON.stringify(p)],'value'),
    reserveReceipt:p=>query('select q02_runtime.reserve_receipt($1,$2,$3,$4::jsonb) as value',[...base,JSON.stringify(p)],'value'),
    receipt:challenge=>authorityDigest(challenge).then(d=>query('select q02_runtime.receipt_context($1,$2,$3,$4) as value',[...base,d],'value')),
    event:rd=>query('select q02_runtime.event_context($1,$2,$3,$4,$5) as value',[...base,rd,newChallenge()],'value'),
    ack:(own,peer)=>query('select q02_runtime.record_signed_ack($1,$2,$3,$4::jsonb,$5::jsonb) as value',[...base,JSON.stringify(own),JSON.stringify(peer)],'value'),
   }
   const result=await callback(tx)
   if(session.exp<=Math.floor(Date.now()/1000)) deny()
   const end=await client.query('COMMIT'); if(end.command!=='COMMIT') deny(); committed=true
   return result
  } catch { if(client && began && !committed) {try {await client.query('ROLLBACK')}catch{}} deny() }
  finally {if(client) {try{await client.end()}catch{}}}
 },
 })
}
