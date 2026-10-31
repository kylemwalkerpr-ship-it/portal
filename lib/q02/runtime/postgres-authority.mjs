// Server-only PostgreSQL transaction adapter. The SQL entrypoints require the
// dedicated scoped runtime login; generic Supabase service-role RPC is not used.
import pg from 'pg'
import { authorityDigest, liveRequestDigest } from './live-authority.mjs'
import { isVerifiedCheckpoint } from './checkpoint.mjs'

const deny = () => { throw Error('Privacy authorization denied') }
const hash = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
function claims(token) {
  if (typeof token !== 'string' || token.length > 16384) deny()
  const parts = token.split('.')
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) deny()
  const value = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) deny()
  return value
}

/** Use separate instances with phase="stage" and phase="consume", each with a
 * freshly verified external checkpoint. No ACK or checkpoint refresh is implicit.
 * All configuration is constructed by the trusted server, never request JSON.
 * Decoded identities select locks only. authorizeLiveLink verifies the original
 * signatures and both online sessions while those locks remain held.
 */
export function createPostgresAuthority({ input, tenant, connectionString, sessions, checkpoint, phase = 'consume',
  connect = () => new pg.Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 10000 }),
}) {
  const request = Object.freeze({ ...input })
  return {
    protocol: 'q02-locked-authority-v8',
    async withLockedAuthority(requestDigest, callback) {
      let client, began = false, committed = false
      try {
        const database = new URL(connectionString)
        if (!['stage', 'consume'].includes(phase) || !['postgres:', 'postgresql:'].includes(database.protocol) || database.searchParams.get('sslmode') !== 'verify-full' ||
            typeof tenant !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(tenant) || !hash(requestDigest) ||
            !isVerifiedCheckpoint(checkpoint) || !hash(checkpoint.generation) ||
            !Number.isSafeInteger(checkpoint.highWater) || checkpoint.highWater < 0 || !hash(checkpoint.headDigest) ||
            !hash(checkpoint.evidenceDigest) || !hash(checkpoint.nonceDigest) || !Number.isSafeInteger(checkpoint.verifiedAt) ||
            checkpoint.verifiedAt > Date.now() || Date.now() - checkpoint.verifiedAt > 10_000 ||
            requestDigest !== await liveRequestDigest(request) || typeof callback !== 'function' ||
            !sessions?.support || !sessions?.portal || sessions.support.verify === sessions.portal.verify) deny()
        const support = claims(request.supportProof), portal = claims(request.receipt)
        const supportSession = claims(request.supportCredential), portalSession = claims(request.portalCredential)
        if (![support.sub, portal.portal_sub].every(value => /^user_[A-Za-z0-9_-]{1,123}$/.test(value)) ||
            ![supportSession.sid, portalSession.sid].every(value => /^sess_[A-Za-z0-9_-]{1,123}$/.test(value))) deny()
        const lockRequest = {
          tenant, requestDigest, supportSubject: support.sub, portalSubject: portal.portal_sub,
          mode: phase, checkpoint: { generation: checkpoint.generation, highWater: checkpoint.highWater, headDigest: checkpoint.headDigest, evidenceDigest: checkpoint.evidenceDigest },
          challengeDigest: await authorityDigest(request.challenge),
          supportSessionDigest: await authorityDigest(supportSession.sid),
          portalSessionDigest: await authorityDigest(portalSession.sid),
        }
        client = connect()
        await client.connect()
        const identity = await client.query('select session_user::text as login, current_user::text as role')
        if (identity.rows.length !== 1 || identity.rows[0].login !== 'q02_coordinator_runtime' || identity.rows[0].role !== 'q02_coordinator_runtime') deny()
        await client.query('BEGIN')
        began = true
        await client.query("set local lock_timeout='1500ms'; set local statement_timeout='8s'; set local idle_in_transaction_session_timeout='12s'")
        const locked = await client.query('select q02_runtime.lock_authority($1::jsonb) as authority', [JSON.stringify(lockRequest)])
        if (locked.rows.length !== 1 || !locked.rows[0].authority) deny()
        const context = locked.rows[0].authority
        if (context.current?.challenge) context.current.challenge.value = request.challenge
        const authorities = {}
        for (const [site, sessionClaims] of [['support', supportSession], ['portal', portalSession]]) {
          const enrolled = context.current?.[site], configured = context.authorities?.[site], verifier = sessions[site]
          if (!enrolled || !configured || configured.issuer !== verifier.issuer || configured.party !== verifier.party ||
              enrolled.enrolledSessionDigest !== lockRequest[site + 'SessionDigest'] || typeof verifier.verify !== 'function') deny()
          authorities[site] = { ...configured, verify: verifier.verify }
          // The database retains only the session digest. The signed JWT must
          // independently prove this same sid in the callback before commit.
          enrolled.enrolledSid = sessionClaims.sid
        }
        let checked = false, consumed = false, staged = false, checkedBinding
        const tx = {
          service: context.service, reconciliation: context.reconciliation,
          outbox: context.outbox, current: context.current, authorities,
          async assertCurrent(binding) {
            if (consumed || binding.requestDigest !== requestDigest) deny()
            const result = await client.query('select q02_runtime.assert_current($1::jsonb) as current', [JSON.stringify(binding)])
            checked = result.rows.length === 1 && result.rows[0].current === true
            checkedBinding = checked ? await authorityDigest(JSON.stringify(binding)) : undefined
            return checked
          },
          async consume(binding) {
            if (phase !== 'consume' || !checked || consumed || binding.requestDigest !== requestDigest || await authorityDigest(JSON.stringify(binding)) !== checkedBinding) deny()
            const result = await client.query('select q02_runtime.consume($1::jsonb) as receipt', [JSON.stringify(binding)])
            if (result.rows.length !== 1 || result.rows[0].receipt?.committed !== true) deny()
            consumed = true
            return result.rows[0].receipt
          },
          async stage(binding) {
            if (phase !== 'stage' || !checked || staged || consumed || binding.requestDigest !== requestDigest || await authorityDigest(JSON.stringify(binding)) !== checkedBinding) deny()
            const result = await client.query('select q02_runtime.stage($1::jsonb) as receipt', [JSON.stringify(binding)])
            if (result.rows.length !== 1 || result.rows[0].receipt?.staged !== true) deny()
            staged = true
            return result.rows[0].receipt
          },
        }
        const result = await callback(tx)
        if (!checked || (phase === 'stage' ? !staged || consumed || result?.decision !== 'STAGED' : !consumed || staged || result?.decision !== 'LINKED') || result.requestDigest !== requestDigest) deny()
        const end = await client.query('COMMIT')
        // PostgreSQL can answer ROLLBACK to COMMIT after an aborted transaction.
        if (end.command !== 'COMMIT') deny()
        committed = true
        return result
      } catch {
        if (client && began && !committed) {
          try { await client.query('ROLLBACK') } catch { /* Ambiguous outcomes remain denied. */ }
        }
        deny()
      } finally {
        if (client) { try { await client.end() } catch { /* Never log credentials or SQL parameters. */ } }
      }
    },
  }
}
