import {
  assertLocalContentStudioExecutionLease,
  currentContentStudioExecution,
  markContentStudioExecutionLeaseLost,
} from './contentStudioExecutionContext'

const COMPAT_COLUMNS = /event_log|lineage|regeneration_reason|regeneration_mode|column/i

type StrictStreamIdentity = {
  jobId: string
  contractId: string
  contractHash: string
  opportunityId: string | null
  owner: string
  attempt: number
}

function strictIdentity(): StrictStreamIdentity | null {
  const execution = currentContentStudioExecution()
  if (!execution?.strict) return null
  assertLocalContentStudioExecutionLease()
  const jobId = String(execution.executionJobId || '').trim()
  const contractId = String(execution.contractId || '').trim()
  const contractHash = String(execution.contractHash || '').trim()
  const owner = String(execution.executionOwner || '').trim()
  const attempt = Number(execution.executionAttempt)
  if (!jobId || !contractId || !contractHash || !owner || !Number.isInteger(attempt)) {
    throw new Error('strict stream persistence is missing its exact job/contract/owner fencing identity')
  }
  return {
    jobId,
    contractId,
    contractHash,
    opportunityId: String(execution.opportunityId || '').trim() || null,
    owner,
    attempt,
  }
}

function fenceMutation(query: any, identity: StrictStreamIdentity): any {
  let fenced = query
    .eq('id', identity.jobId)
    .eq('contract_id', identity.contractId)
    .eq('contract_hash', identity.contractHash)
    .eq('execution_owner', identity.owner)
    .eq('execution_attempt', identity.attempt)
    .gt('execution_lease_expires_at', new Date().toISOString())
  if (identity.opportunityId) fenced = fenced.eq('opportunity_id', identity.opportunityId)
  return fenced
}

function staleError(identity: StrictStreamIdentity): Error {
  return new Error(
    `strict stream persistence refused stale execution for ${identity.jobId}: owner/attempt/lease changed`,
  )
}

/**
 * Wrap a PostgREST mutation builder so every chained filter keeps the strict
 * owner/attempt fence and awaiting the mutation proves exactly one row still
 * belongs to that execution. Compatibility-column errors are returned to the
 * caller so its existing minimal-row retry can run through the same fence.
 */
function wrapMutation(query: any, identity: StrictStreamIdentity): any {
  let proxy: any
  proxy = new Proxy(query, {
    get(target, property, receiver) {
      if (property === 'then') {
        return (onFulfilled: (value: any) => any, onRejected?: (reason: unknown) => any) => {
          let represented: any
          try {
            represented = target.select('id')
          } catch (error) {
            markContentStudioExecutionLeaseLost(error)
            return Promise.reject(error).then(onFulfilled, onRejected)
          }
          return represented.then((result: any) => {
            const message = String(result?.error?.message || '')
            if (result?.error && COMPAT_COLUMNS.test(message)) return onFulfilled(result)
            if (result?.error) {
              const error = new Error(`strict stream persistence failed: ${message || 'database mutation error'}`)
              markContentStudioExecutionLeaseLost(error)
              return Promise.reject(error).then(onFulfilled, onRejected)
            }
            const rows = Array.isArray(result?.data) ? result.data : []
            if (rows.length !== 1 || String(rows[0]?.id || '') !== identity.jobId) {
              const error = staleError(identity)
              markContentStudioExecutionLeaseLost(error)
              return Promise.reject(error).then(onFulfilled, onRejected)
            }
            return onFulfilled(result)
          }, onRejected)
        }
      }
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      return (...args: any[]) => {
        const next = value.apply(target, args)
        if (next && typeof next === 'object' && typeof next.then === 'function') {
          return wrapMutation(next, identity)
        }
        return next
      }
    },
  })
  return proxy
}

/**
 * PipelineStream predates execution leases and performs an early queue update
 * before the shared final persist door. For strict contracted runs this client
 * wrapper fences those legacy writes without changing the verified streaming
 * producer/heartbeat lifecycle. Uncontracted callers receive the original
 * client unchanged.
 */
export function fenceStreamContentJobsClient<T extends { from: (...args: any[]) => any }>(client: T): T {
  const identity = strictIdentity()
  if (!identity) return client

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== 'from') return Reflect.get(target, property, receiver)
      return (table: string, ...args: any[]) => {
        const builder = target.from(table, ...args)
        if (table !== 'content_jobs') return builder
        return new Proxy(builder, {
          get(tableTarget, tableProperty, tableReceiver) {
            if (tableProperty === 'insert' || tableProperty === 'upsert' || tableProperty === 'delete') {
              return () => {
                const error = new Error(
                  `strict Content Studio stream may not ${String(tableProperty)} content_jobs outside its reserved row`,
                )
                markContentStudioExecutionLeaseLost(error)
                throw error
              }
            }
            if (tableProperty === 'update') {
              return (patch: Record<string, unknown>, ...updateArgs: any[]) => {
                assertLocalContentStudioExecutionLease()
                const query = tableTarget.update(patch, ...updateArgs)
                return wrapMutation(fenceMutation(query, identity), identity)
              }
            }
            return Reflect.get(tableTarget, tableProperty, tableReceiver)
          },
        })
      }
    },
  }) as T
}
