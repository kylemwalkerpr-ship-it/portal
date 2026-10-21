import { createHash, randomUUID } from 'node:crypto'
import { getSupabaseAdminClient } from '@/lib/supabase'

export type P11CommandStatus = 'admitted' | 'running' | 'completed' | 'failed' | 'blocked_indeterminate'

export interface P11CommandActor {
  scope: string
  profileId: string | null
}

export const SEO_ENGINE_DAILY_ACTOR: P11CommandActor = { scope: 'system:seo-engine-daily', profileId: null }

export function scheduledP11IdempotencyKey(action: string, windowStart = new Date()): string {
  return `scheduled:${action}:${windowStart.toISOString().slice(0, 10)}`
}

export function profileP11Actor(profileId: string): P11CommandActor {
  return { scope: `profile:${profileId}`, profileId }
}

export function validP11Actor(actor: P11CommandActor): boolean {
  if (typeof actor.scope !== 'string' || actor.scope.length < 1 || actor.scope.length > 220 || !/^[\x20-\x7e]+$/.test(actor.scope)) return false
  if (actor.scope.startsWith('profile:')) return typeof actor.profileId === 'string' && actor.scope === `profile:${actor.profileId}`
  return actor.profileId === null && /^system:[a-z0-9][a-z0-9:-]{0,199}$/.test(actor.scope)
}

export interface P11AuditRequest {
  queries?: string[]
  engineLabel?: string
  maxAudits?: number
  fanOut?: boolean
  planLimit?: number
  maxPerPlan?: number
}

export function normalizeP11Request(input: P11AuditRequest): P11AuditRequest {
  const queries = Array.isArray(input.queries)
    ? input.queries.slice(0, 15).map((query) => String(query).trim().slice(0, 500)).filter(Boolean)
    : undefined
  const integer = (value: unknown, fallback: number, min: number, max: number) => {
    const number = Number(value)
    return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback
  }
  return {
    queries,
    engineLabel: typeof input.engineLabel === 'string' ? input.engineLabel.trim().slice(0, 100) || undefined : undefined,
    maxAudits: integer(input.maxAudits, 10, 1, 30),
    fanOut: input.fanOut === true,
    planLimit: integer(input.planLimit, 8, 1, 20),
    maxPerPlan: integer(input.maxPerPlan, 5, 1, 10),
  }
}

export function validP11IdempotencyKey(key: unknown): key is string {
  return typeof key === 'string' && key.length >= 8 && key.length <= 200 && /^[\x21-\x7e]+$/.test(key)
}

export async function admitP11AuditCommand(actor: P11CommandActor, idempotencyKey: string, input: P11AuditRequest): Promise<{ kind: 'admitted'; command: Record<string, any>; request: P11AuditRequest } | { kind: 'conflict'; command: Record<string, any> }> {
  if (!validP11Actor(actor)) throw new Error('Invalid P11 command actor scope')
  if (!validP11IdempotencyKey(idempotencyKey)) throw new Error('Invalid P11 idempotency key')
  const db = getSupabaseAdminClient()
  const request = normalizeP11Request(input)
  const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex')
  const inserted = await db.from('seo_llm_audit_commands').insert({
    actor_scope: actor.scope,
    actor_profile_id: actor.profileId,
    idempotency_key: idempotencyKey,
    request_hash: requestHash,
    request_json: request,
    run_id: randomUUID(),
    status: 'admitted',
  }).select('*').maybeSingle()
  let command: Record<string, any> | null = null
  if (!inserted.error) command = inserted.data
  else if (inserted.error.code === '23505') {
    const existing = await db.from('seo_llm_audit_commands').select('*')
      .eq('actor_scope', actor.scope).eq('idempotency_key', idempotencyKey).maybeSingle()
    if (existing.error || !existing.data) throw new Error(existing.error?.message || 'Unable to recover audit command')
    command = existing.data
  } else throw new Error(inserted.error.message || 'Unable to admit audit command')
  if (!command) throw new Error('Audit command admission returned no command')
  return command.request_hash !== requestHash ? { kind: 'conflict', command } : { kind: 'admitted', command, request }
}

export interface P11CommandContext {
  commandId: string
  runId: string
  request: P11AuditRequest
  /** True means this call inserted the unique claim and owns the provider attempt. */
  claimProvider(queryOrdinal: number, providerPin: string): Promise<boolean>
  finishProviderClaim(queryOrdinal: number, providerPin: string, status: 'completed' | 'failed', result: unknown, error?: string): Promise<void>
}

export type CommandRunOutcome =
  | { kind: 'result'; command: Record<string, any>; result: unknown; replayed?: boolean }
  | { kind: 'conflict'; command: Record<string, any> }
  | { kind: 'pending'; command: Record<string, any> }

async function exactCommandRowCount(db: any, table: string, commandId: string): Promise<number | null> {
  try {
    const result = await db.from(table).select('command_id', { head: true, count: 'exact' }).eq('command_id', commandId)
    return !result.error && typeof result.count === 'number' && Number.isInteger(result.count) && result.count >= 0
      ? result.count
      : null
  } catch {
    return null
  }
}

async function commandHasNoDurableEvidence(db: any, commandId: string): Promise<boolean> {
  const [providerClaims, observations] = await Promise.all([
    exactCommandRowCount(db, 'seo_llm_audit_provider_claims', commandId),
    exactCommandRowCount(db, 'seo_llm_visibility', commandId),
  ])
  return providerClaims === 0 && observations === 0
}

async function reloadCommandAfterCasMiss(db: any, command: Record<string, any>): Promise<CommandRunOutcome> {
  const current = await db.from('seo_llm_audit_commands').select('*').eq('id', command.id).single()
  if (current.error || !current.data) throw new Error(current.error?.message || 'Unable to recover audit command state')
  if (current.data.status === 'completed') return { kind: 'result', command: current.data, result: current.data.result_json, replayed: true }
  return { kind: 'pending', command: current.data }
}

/** Atomic DB uniqueness is admission authority; only admitted/failed -> running CAS may execute. */
export async function executeP11AuditCommand<T>(args: {
  actor: P11CommandActor
  idempotencyKey: string
  request: P11AuditRequest
  run: (context: P11CommandContext) => Promise<T>
}): Promise<CommandRunOutcome> {
  if (!validP11Actor(args.actor)) throw new Error('Invalid P11 command actor scope')
  if (!validP11IdempotencyKey(args.idempotencyKey)) throw new Error('Invalid P11 idempotency key')
  const admission = await admitP11AuditCommand(args.actor, args.idempotencyKey, args.request)
  if (admission.kind === 'conflict') return admission
  const db = getSupabaseAdminClient()
  const request = admission.request
  let command: Record<string, any> | null = admission.command
  if (command.status === 'completed') return { kind: 'result', command, result: command.result_json, replayed: true }
  if (command.status !== 'admitted' && command.status !== 'failed') return { kind: 'pending', command }

  const priorStatus = command.status
  if (priorStatus === 'failed') {
    if (!(await commandHasNoDurableEvidence(db, command.id))) {
      const blocked = await db.from('seo_llm_audit_commands').update({
        status: 'blocked_indeterminate',
        error: 'Failed audit command has provider claims or persisted observations; automatic retry is blocked',
        updated_at: new Date().toISOString(),
      }).eq('id', command.id).eq('status', 'failed').select('*').maybeSingle()
      if (blocked.error) throw new Error(blocked.error.message || 'Unable to block failed audit command with durable evidence')
      if (!blocked.data) return reloadCommandAfterCasMiss(db, command)
      return { kind: 'pending', command: blocked.data }
    }
  }

  const claimed = await db.from('seo_llm_audit_commands').update({
    status: 'running',
    error: null,
    completed_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', command.id).eq('status', priorStatus).select('*').maybeSingle()
  if (claimed.error) throw new Error(claimed.error.message || 'Unable to claim audit command execution')
  if (!claimed.data) {
    return reloadCommandAfterCasMiss(db, command)
  }
  command = claimed.data
  let existingProviderClaim = false

  const context: P11CommandContext = {
    commandId: command.id,
    runId: command.run_id,
    request,
    async claimProvider(queryOrdinal, providerPin) {
      const claim = await db.from('seo_llm_audit_provider_claims').insert({
        command_id: command!.id,
        query_ordinal: queryOrdinal,
        provider_pin: providerPin,
        status: 'claimed',
      }).select('command_id').maybeSingle()
      if (!claim.error && claim.data) return true
      if (!claim.error) throw new Error('Provider claim insert returned no durable row')
      if (claim.error.code !== '23505') throw new Error(claim.error.message || 'Unable to persist provider claim')
      existingProviderClaim = true
      return false
    },
    async finishProviderClaim(queryOrdinal, providerPin, status, result, error) {
      const updated = await db.from('seo_llm_audit_provider_claims').update({
        status,
        result_json: result,
        error: error?.slice(0, 1000) || null,
        completed_at: new Date().toISOString(),
      }).eq('command_id', command!.id).eq('query_ordinal', queryOrdinal).eq('provider_pin', providerPin).eq('status', 'claimed').select('command_id').maybeSingle()
      if (updated.error || !updated.data) throw new Error(updated.error?.message || 'Unable to persist provider outcome')
    },
  }

  try {
    const result = await args.run(context)
    if (existingProviderClaim) throw new Error('Existing provider claim blocks command completion as a fresh audit')
    const saved = await db.from('seo_llm_audit_commands').update({
      status: 'completed', result_json: result, error: null,
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', command.id).eq('status', 'running').select('*').single()
    if (saved.error || !saved.data) throw new Error(saved.error?.message || 'Unable to persist completed audit command')
    return { kind: 'result', command: saved.data, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Audit command failed'
    const status: P11CommandStatus = await commandHasNoDurableEvidence(db, command.id) ? 'failed' : 'blocked_indeterminate'
    const blocked = await db.from('seo_llm_audit_commands').update({ status, error: message.slice(0, 2000), updated_at: new Date().toISOString() })
      .eq('id', command.id).eq('status', 'running').select('id').maybeSingle()
    if (blocked.error || !blocked.data) throw new Error(`Unable to persist P11 command ${status}: ${blocked.error?.message || 'no command row transitioned'}`)
    throw error
  }
}
