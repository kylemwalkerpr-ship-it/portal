// Trusted server coordinator. It holds the database fence while reconciling
// committed events to the external journal, then persists that exact signed
// checkpoint before handing the verified object to the authority adapter.
import pg from 'pg'
import { createCheckpointClient } from './checkpoint.mjs'
import { createPostgresAuthority } from './postgres-authority.mjs'

const deny = () => { throw Error('Privacy authorization denied') }
const hash = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)

export function createCheckpointCoordinator({ binding, trust, connectionString,
  connect = () => new pg.Client({connectionString,connectionTimeoutMillis:5000,query_timeout:8000}) }) {
  const database = new URL(connectionString)
  if (!['postgres:','postgresql:'].includes(database.protocol) || database.searchParams.get('sslmode')!=='verify-full') deny()
  const journal = createCheckpointClient({binding,trust})
  return Object.freeze({
    async withLockedAuthority({input,tenant,sessions,phase='consume',requestDigest,callback}) {
      if (!hash(requestDigest) || !['stage','consume'].includes(phase) || typeof callback!=='function' ||
          typeof tenant!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(tenant)) deny()
      let client, began=false, committed=false, checkpoint
      try {
        client=connect(); await client.connect()
        const identity=await client.query('select session_user::text as login,current_user::text as role')
        if(identity.rows.length!==1 || identity.rows[0].login!=='q02_coordinator_runtime' || identity.rows[0].role!=='q02_coordinator_runtime') deny()
        await client.query('BEGIN'); began=true
        await client.query("set local lock_timeout='1500ms'; set local statement_timeout='8s'; set local idle_in_transaction_session_timeout='12s'")
        await client.query('select q02_runtime.fence_head($1) as head',[tenant])
        checkpoint=await journal.reconcile(client,tenant)
        const persisted=await client.query('select q02_runtime.set_checkpoint($1::jsonb) as saved',[JSON.stringify({tenant,...checkpoint,enrollmentReference:`checkpoint-proof:${checkpoint.evidenceDigest}`})])
        if(persisted.rows.length!==1 || persisted.rows[0].saved!==true) deny()
        const end=await client.query('COMMIT')
        if(end.command!=='COMMIT') deny()
        committed=true
      } catch {
        if(client && began && !committed) { try { await client.query('ROLLBACK') } catch {} }
        deny()
      } finally { if(client) { try { await client.end() } catch {} } }
      const authority=createPostgresAuthority({input,tenant,sessions,phase,checkpoint,connectionString,connect})
      return authority.withLockedAuthority(requestDigest,callback)
    },
  })
}
