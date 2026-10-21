const mockGetDb = jest.fn()
const mockGenerateContentText = jest.fn()
jest.mock('@/lib/supabase', () => ({ getSupabaseAdminClient: () => mockGetDb() }))
jest.mock('@/lib/contentAiProvider', () => ({ generateContentText: (...args: unknown[]) => mockGenerateContentText(...args) }))
jest.mock('@/lib/contentAiRegistry', () => ({
  COMMISSIONED_PROVIDERS: [{ pin: 'provider-a', isConfigured: () => true }],
  LANE_DEFAULT_PIN: 'provider-a',
  commissionedProvider: (pin: string) => ({ pin }),
}))

import { randomUUID } from 'node:crypto'
import { admitP11AuditCommand, executeP11AuditCommand, profileP11Actor, scheduledP11IdempotencyKey, SEO_ENGINE_DAILY_ACTOR } from '@/lib/seoEngine/p11AuditCommand'
import { auditQuery, runVisibilityAudits } from '@/lib/seoEngine/llmVisibility'

type Row = Record<string, any>

class MemoryQuery {
  static failBlockedCommandUpdate = false
  static failProviderClaimCount = false
  static failVisibilityObservationCount = false
  static visibilityObservationCountMode: false | 'error' | 'unknown' = false
  static visibilityObservationInsertAttempts = 0
  static failVisibilityObservationInsertAt = 0
  static failCompletedProviderClaimUpdate = false
  private action: 'select' | 'insert' | 'update' = 'select'
  private values: Row | Row[] = {}
  private filters: Array<[string, unknown]> = []
  private countOnly = false
  constructor(private table: string, private tables: Record<string, Row[]>) {}
  insert(value: Row | Row[]) { this.action = 'insert'; this.values = value; return this }
  update(value: Row) { this.action = 'update'; this.values = value; return this }
  select(_fields?: string, options?: { head?: boolean; count?: string }) { this.action = this.action === 'insert' || this.action === 'update' ? this.action : 'select'; this.countOnly = Boolean(options?.head); return this }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this }
  order() { return this }
  limit() { return this }
  maybeSingle() { return this.execute(true) }
  single() { return this.execute(true) }
  then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) { return this.execute(false).then(resolve, reject) }
  private async execute(single: boolean): Promise<any> {
    const rows = this.tables[this.table] || (this.tables[this.table] = [])
    if (this.action === 'update' && this.table === 'seo_llm_audit_commands' && (this.values as Row).status === 'blocked_indeterminate' && MemoryQuery.failBlockedCommandUpdate) {
      return { data: null, count: null, error: { code: 'XX000', message: 'simulated blocked-state write failure' } }
    }
    if (this.action === 'update' && this.table === 'seo_llm_audit_provider_claims' && (this.values as Row).status === 'completed' && MemoryQuery.failCompletedProviderClaimUpdate) {
      return { data: null, count: null, error: { code: 'XX000', message: 'simulated completed claim write failure' } }
    }
    if (this.action === 'insert') {
      const values = Array.isArray(this.values) ? this.values : [this.values]
      for (const value of values) {
        if (this.table === 'seo_llm_visibility') {
          MemoryQuery.visibilityObservationInsertAttempts += 1
          if (MemoryQuery.visibilityObservationInsertAttempts === MemoryQuery.failVisibilityObservationInsertAt) {
            return { data: null, count: null, error: { code: 'XX000', message: 'simulated observation insert failure' } }
          }
        }
        if (this.table === 'seo_llm_audit_commands' && rows.some((r) => r.actor_scope === value.actor_scope && r.idempotency_key === value.idempotency_key)) {
          return { data: null, count: null, error: { code: '23505', message: 'duplicate command' } }
        }
        if (this.table === 'seo_llm_audit_provider_claims' && rows.some((r) => r.command_id === value.command_id && r.query_ordinal === value.query_ordinal && r.provider_pin === value.provider_pin)) {
          return { data: null, count: null, error: { code: '23505', message: 'duplicate claim' } }
        }
        rows.push({ id: randomUUID(), created_at: new Date().toISOString(), ...value })
      }
      return { data: values.length === 1 ? rows[rows.length - 1] : values.map((v) => rows.find((r) => r === v)), count: null, error: null }
    }
    const matches = rows.filter((row) => this.filters.every(([key, value]) => row[key] === value))
    if (this.countOnly && this.table === 'seo_llm_audit_provider_claims' && MemoryQuery.failProviderClaimCount) {
      return { data: null, count: null, error: { code: 'XX000', message: 'simulated claim-count failure' } }
    }
    if (this.countOnly && this.table === 'seo_llm_visibility' && (MemoryQuery.failVisibilityObservationCount || MemoryQuery.visibilityObservationCountMode === 'error')) {
      return { data: null, count: null, error: { code: 'XX000', message: 'simulated observation-count failure' } }
    }
    if (this.countOnly && this.table === 'seo_llm_visibility' && MemoryQuery.visibilityObservationCountMode === 'unknown') {
      return { data: null, count: null, error: null }
    }
    if (this.countOnly) return { data: null, count: matches.length, error: null }
    if (this.action === 'update') for (const row of matches) Object.assign(row, this.values)
    const result = this.action === 'update' ? matches : rows.filter((row) => this.filters.every(([key, value]) => row[key] === value))
    return { data: single ? result[0] || null : result, count: null, error: null }
  }
}

describe('P11 command admission and recovery', () => {
  let tables: Record<string, Row[]>
  const provider = jest.fn(async () => ({ ok: true }))

  beforeEach(() => {
    tables = {}
    MemoryQuery.failBlockedCommandUpdate = false
    MemoryQuery.failProviderClaimCount = false
    MemoryQuery.failVisibilityObservationCount = false
    MemoryQuery.visibilityObservationCountMode = false
    MemoryQuery.visibilityObservationInsertAttempts = 0
    MemoryQuery.failVisibilityObservationInsertAt = 0
    MemoryQuery.failCompletedProviderClaimUpdate = false
    provider.mockClear()
    mockGenerateContentText.mockReset()
    mockGetDb.mockReturnValue({ from: (name: string) => new MemoryQuery(name, tables) })
  })

  const invoke = (actor = profileP11Actor('profile-a'), key = 'audit-key-123', request: any = { queries: ['visa question'] }) =>
    executeP11AuditCommand({
      actor,
      idempotencyKey: key,
      request,
      run: async (command) => {
        if (await command.claimProvider(0, 'provider-a')) {
          const result = await provider()
          await command.finishProviderClaim(0, 'provider-a', 'completed', result)
        }
        return { audit: 'persisted-result' }
      },
    })

  it('replays a completed result after a lost response and invokes a provider once', async () => {
    const first = await invoke()
    const retry = await invoke()
    expect(first.kind).toBe('result')
    expect(retry).toMatchObject({ kind: 'result', replayed: true, result: { audit: 'persisted-result' } })
    expect(provider).toHaveBeenCalledTimes(1)
    expect(tables.seo_llm_audit_commands).toHaveLength(1)
  })

  it('conflicts on same actor/key with a different canonical request before a second provider call', async () => {
    await invoke()
    const conflict = await invoke(profileP11Actor('profile-a'), 'audit-key-123', { queries: ['different question'] })
    expect(conflict.kind).toBe('conflict')
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('stores failed when the runner throws before creating any provider claim', async () => {
    const actor = profileP11Actor('profile-a')
    await expect(executeP11AuditCommand({
      actor, idempotencyKey: 'pre-claim-failure', request: { queries: ['q'] },
      run: async () => { throw new Error('failed before provider claim') },
    })).rejects.toThrow('failed before provider claim')

    expect(tables.seo_llm_audit_commands[0]).toMatchObject({ status: 'failed', error: 'failed before provider claim' })
    expect(tables.seo_llm_audit_provider_claims || []).toHaveLength(0)
    expect(provider).not.toHaveBeenCalled()
  })

  it('blocks a multi-query run after a partial unowned observation write, with zero provider claims', async () => {
    MemoryQuery.failVisibilityObservationInsertAt = 2
    const actor = profileP11Actor('profile-a')
    const request = { queries: ['invented unowned topic one', 'invented unowned topic two'], maxAudits: 2 }
    const runner = jest.fn((command: any) => runVisibilityAudits({ ...request, command }))

    await expect(executeP11AuditCommand({ actor, idempotencyKey: 'partial-observation-write', request, run: runner }))
      .rejects.toThrow('Observation persistence failed; provider claims prevent automatic reinvocation')

    const command = tables.seo_llm_audit_commands[0]
    expect(command.status).toBe('blocked_indeterminate')
    expect(tables.seo_llm_visibility).toHaveLength(1)
    expect(tables.seo_llm_visibility[0]).toMatchObject({ command_id: command.id, query_ordinal: 0, audit_status: 'blocked' })
    expect(tables.seo_llm_audit_provider_claims || []).toHaveLength(0)
    expect(MemoryQuery.visibilityObservationInsertAttempts).toBe(2)
    expect(mockGenerateContentText).not.toHaveBeenCalled()

    const retryRunner = jest.fn(async () => ({ mustNotRun: true }))
    const retry = await executeP11AuditCommand({ actor, idempotencyKey: 'partial-observation-write', request, run: retryRunner })
    expect(retry).toMatchObject({ kind: 'pending', command: { status: 'blocked_indeterminate' } })
    expect(retryRunner).not.toHaveBeenCalled()
    expect(mockGenerateContentText).not.toHaveBeenCalled()
  })

  it('retries a failed command with the same id and run id, then persists completion', async () => {
    const actor = profileP11Actor('profile-a')
    const request = { queries: ['q'] }
    await expect(executeP11AuditCommand({
      actor, idempotencyKey: 'retry-failed-command', request,
      run: async () => { throw new Error('failed before provider claim') },
    })).rejects.toThrow('failed before provider claim')
    const failedCommand = tables.seo_llm_audit_commands[0]
    const runner = jest.fn(async (command: any) => ({ commandId: command.commandId, runId: command.runId, retried: true }))

    const retry = await executeP11AuditCommand({ actor, idempotencyKey: 'retry-failed-command', request, run: runner })

    expect(retry.kind).toBe('result')
    expect(retry).toMatchObject({ result: { commandId: failedCommand.id, runId: failedCommand.run_id, retried: true } })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(tables.seo_llm_audit_commands[0]).toMatchObject({
      id: failedCommand.id,
      run_id: failedCommand.run_id,
      status: 'completed',
      error: null,
      result_json: { commandId: failedCommand.id, runId: failedCommand.run_id, retried: true },
    })
    expect(tables.seo_llm_audit_provider_claims || []).toHaveLength(0)
    expect(tables.seo_llm_visibility || []).toHaveLength(0)
  })

  it('gives only one concurrent retry ownership of a failed command', async () => {
    const actor = profileP11Actor('profile-a')
    const request = { queries: ['q'] }
    await expect(executeP11AuditCommand({
      actor, idempotencyKey: 'concurrent-failed-retry', request,
      run: async () => { throw new Error('failed before provider claim') },
    })).rejects.toThrow('failed before provider claim')

    let release!: () => void
    let signalStarted!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const started = new Promise<void>((resolve) => { signalStarted = resolve })
    const runner = jest.fn(async () => {
      signalStarted()
      await gate
      return { retried: true }
    })
    const retry = () => executeP11AuditCommand({ actor, idempotencyKey: 'concurrent-failed-retry', request, run: runner })

    const owner = retry()
    await started
    const loser = await retry()
    expect(loser).toMatchObject({ kind: 'pending', command: { status: 'running' } })
    expect(runner).toHaveBeenCalledTimes(1)

    release()
    expect(await owner).toMatchObject({ kind: 'result', result: { retried: true } })
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('keeps a failed command with an existing provider claim pending without running its callback', async () => {
    const actor = profileP11Actor('profile-a')
    const admission = await admitP11AuditCommand(actor, 'failed-command-with-claim', { queries: ['q'] })
    tables.seo_llm_audit_commands[0].status = 'failed'
    tables.seo_llm_audit_provider_claims = [{
      command_id: admission.command.id,
      query_ordinal: 0,
      provider_pin: 'provider-a',
      status: 'failed',
    }]
    const runner = jest.fn(async () => ({ mustNotRun: true }))

    const retry = await executeP11AuditCommand({
      actor, idempotencyKey: 'failed-command-with-claim', request: { queries: ['q'] }, run: runner,
    })

    expect(retry).toMatchObject({ kind: 'pending', command: { id: admission.command.id, status: 'blocked_indeterminate' } })
    expect(runner).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })

  it('fails closed when provider-claim count is unknown for a failed command', async () => {
    const actor = profileP11Actor('profile-a')
    const admission = await admitP11AuditCommand(actor, 'failed-command-count-error', { queries: ['q'] })
    tables.seo_llm_audit_commands[0].status = 'failed'
    MemoryQuery.failProviderClaimCount = true
    const runner = jest.fn(async () => ({ mustNotRun: true }))

    const retry = await executeP11AuditCommand({
      actor, idempotencyKey: 'failed-command-count-error', request: { queries: ['q'] }, run: runner,
    })

    expect(retry).toMatchObject({ kind: 'pending', command: { id: admission.command.id, status: 'blocked_indeterminate' } })
    expect(runner).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })

  it('keeps a failed command with an existing command-linked observation pending without running its callback', async () => {
    const actor = profileP11Actor('profile-a')
    const admission = await admitP11AuditCommand(actor, 'failed-command-with-observation', { queries: ['q'] })
    tables.seo_llm_audit_commands[0].status = 'failed'
    tables.seo_llm_visibility = [{ id: randomUUID(), command_id: admission.command.id, query_ordinal: 0 }]
    const runner = jest.fn(async () => ({ mustNotRun: true }))

    const retry = await executeP11AuditCommand({
      actor,
      idempotencyKey: 'failed-command-with-observation',
      request: { queries: ['q'] },
      run: runner,
    })

    expect(retry).toMatchObject({ kind: 'pending', command: { id: admission.command.id, status: 'blocked_indeterminate' } })
    expect(runner).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })

  it('keeps a failed command pending when observation count is unavailable during retry', async () => {
    const actor = profileP11Actor('profile-a')
    const admission = await admitP11AuditCommand(actor, 'failed-command-observation-count-error', { queries: ['q'] })
    tables.seo_llm_audit_commands[0].status = 'failed'
    MemoryQuery.failVisibilityObservationCount = true
    const runner = jest.fn(async () => ({ mustNotRun: true }))

    const retry = await executeP11AuditCommand({
      actor,
      idempotencyKey: 'failed-command-observation-count-error',
      request: { queries: ['q'] },
      run: runner,
    })

    expect(retry).toMatchObject({ kind: 'pending', command: { id: admission.command.id, status: 'blocked_indeterminate' } })
    expect(runner).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })

  it('keeps blocked_indeterminate commands pending without invoking the runner', async () => {
    const actor = profileP11Actor('profile-a')
    await admitP11AuditCommand(actor, 'blocked-indeterminate-retry', { queries: ['q'] })
    tables.seo_llm_audit_commands[0].status = 'blocked_indeterminate'
    const runner = jest.fn(async () => ({ mustNotRun: true }))

    const retry = await executeP11AuditCommand({
      actor, idempotencyKey: 'blocked-indeterminate-retry', request: { queries: ['q'] }, run: runner,
    })

    expect(retry).toMatchObject({ kind: 'pending', command: { status: 'blocked_indeterminate' } })
    expect(runner).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })

  it('classifies a runner failure as blocked_indeterminate when an observation exists without a provider claim', async () => {
    await expect(executeP11AuditCommand({
      actor: profileP11Actor('profile-a'),
      idempotencyKey: 'observation-before-runner-failure',
      request: { queries: ['q'] },
      run: async (command) => {
        const inserted = await mockGetDb().from('seo_llm_visibility').insert({
          command_id: command.commandId,
          query_ordinal: 0,
        })
        expect(inserted.error).toBeNull()
        throw new Error('runner failed after observation insert')
      },
    })).rejects.toThrow('runner failed after observation insert')

    expect(tables.seo_llm_audit_provider_claims || []).toHaveLength(0)
    expect(tables.seo_llm_visibility).toHaveLength(1)
    expect(tables.seo_llm_audit_commands[0].status).toBe('blocked_indeterminate')
  })

  it('classifies a runner failure as blocked_indeterminate when observation count is unavailable', async () => {
    MemoryQuery.failVisibilityObservationCount = true
    await expect(executeP11AuditCommand({
      actor: profileP11Actor('profile-a'),
      idempotencyKey: 'observation-count-failure',
      request: { queries: ['q'] },
      run: async () => { throw new Error('runner failed') },
    })).rejects.toThrow('runner failed')

    expect(tables.seo_llm_audit_commands[0].status).toBe('blocked_indeterminate')
  })

  it('still conflicts on a different payload after a zero-claim failure', async () => {
    const actor = profileP11Actor('profile-a')
    await expect(executeP11AuditCommand({
      actor, idempotencyKey: 'failed-payload-conflict', request: { queries: ['original'] },
      run: async () => { throw new Error('failed before provider claim') },
    })).rejects.toThrow('failed before provider claim')
    const runner = jest.fn(async () => ({ mustNotRun: true }))

    const conflict = await executeP11AuditCommand({
      actor, idempotencyKey: 'failed-payload-conflict', request: { queries: ['different'] }, run: runner,
    })

    expect(conflict.kind).toBe('conflict')
    expect(runner).not.toHaveBeenCalled()
  })

  it('allows independent use of a key by two durable profile actors', async () => {
    await invoke(profileP11Actor('profile-a'))
    await invoke(profileP11Actor('profile-b'))
    expect(tables.seo_llm_audit_commands).toHaveLength(2)
    expect(provider).toHaveBeenCalledTimes(2)
  })

  it('keeps system cron and profile actors independent for the same key', async () => {
    await invoke(profileP11Actor('profile-a'), 'shared-key')
    await invoke(SEO_ENGINE_DAILY_ACTOR, 'shared-key')
    expect(tables.seo_llm_audit_commands).toHaveLength(2)
    expect(tables.seo_llm_audit_commands.map((command) => command.actor_scope).sort()).toEqual(['profile:profile-a', 'system:seo-engine-daily'])
    expect(tables.seo_llm_audit_commands.find((command) => command.actor_scope === 'system:seo-engine-daily').actor_profile_id).toBeNull()
    expect(provider).toHaveBeenCalledTimes(2)
  })

  it('derives retry-stable cron keys from the logical UTC run day and action', () => {
    const scheduledAt = new Date('2026-09-23T12:00:00.000Z')
    expect(scheduledP11IdempotencyKey('llm', scheduledAt)).toBe('scheduled:llm:2026-09-23')
    expect(scheduledP11IdempotencyKey('llm', scheduledAt)).toBe(scheduledP11IdempotencyKey('llm', scheduledAt))
    expect(scheduledP11IdempotencyKey('all-llm', scheduledAt)).not.toBe(scheduledP11IdempotencyKey('llm', scheduledAt))
  })

  it('lets only one concurrent admission execute the provider', async () => {
    let release!: () => void
    let signalStarted!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const started = new Promise<void>((resolve) => { signalStarted = resolve })
    const run = () => executeP11AuditCommand({
      actor: profileP11Actor('profile-a'), idempotencyKey: 'concurrent-key', request: { queries: ['q'] },
      run: async (command) => {
        if (await command.claimProvider(0, 'provider-a')) {
          provider()
          signalStarted()
          await gate
          await command.finishProviderClaim(0, 'provider-a', 'completed', { ok: true })
        }
        return { ok: true }
      },
    })
    const first = run()
    await started
    const second = await run()
    expect(second.kind).toBe('pending')
    release()
    await first
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('returns pending for an existing running command without invoking the runner', async () => {
    const actor = profileP11Actor('profile-a')
    await admitP11AuditCommand(actor, 'running-key', { queries: ['q'] })
    tables.seo_llm_audit_commands[0].status = 'running'
    const run = jest.fn(async () => ({ ok: true }))
    const outcome = await executeP11AuditCommand({ actor, idempotencyKey: 'running-key', request: { queries: ['q'] }, run })
    expect(outcome).toMatchObject({ kind: 'pending', command: { status: 'running' } })
    expect(run).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })

  it('blocks duplicate provider claims and cannot complete as a fresh success', async () => {
    const actor = profileP11Actor('profile-a')
    const run = jest.fn(async (command: any) => {
      expect(await command.claimProvider(0, 'provider-a')).toBe(true)
      await provider()
      expect(await command.claimProvider(0, 'provider-a')).toBe(false)
      return { audit: 'must not be saved as fresh success' }
    })
    await expect(executeP11AuditCommand({ actor, idempotencyKey: 'duplicate-claim', request: { queries: ['q'] }, run }))
      .rejects.toThrow('Existing provider claim blocks command completion as a fresh audit')
    expect(tables.seo_llm_audit_commands[0].status).toBe('blocked_indeterminate')
    expect(tables.seo_llm_audit_commands[0].result_json).toBeUndefined()
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('surfaces a provider-claim transition failure instead of completing', async () => {
    await expect(executeP11AuditCommand({
      actor: profileP11Actor('profile-a'), idempotencyKey: 'claim-transition', request: { queries: ['q'] },
      run: async (command) => {
        expect(await command.claimProvider(0, 'provider-a')).toBe(true)
        tables.seo_llm_audit_provider_claims[0].status = 'completed'
        await command.finishProviderClaim(0, 'provider-a', 'failed', null, 'provider error')
        return { ok: true }
      },
    })).rejects.toThrow('Unable to persist provider outcome')
    expect(tables.seo_llm_audit_commands[0].status).toBe('blocked_indeterminate')
  })

  it('surfaces failure to persist blocked command status', async () => {
    MemoryQuery.failBlockedCommandUpdate = true
    await expect(executeP11AuditCommand({
      actor: profileP11Actor('profile-a'), idempotencyKey: 'blocked-write-failure', request: { queries: ['q'] },
      run: async (command) => {
        await command.claimProvider(0, 'provider-a')
        throw new Error('after claim')
      },
    })).rejects.toThrow('simulated blocked-state write failure')
    expect(tables.seo_llm_audit_commands[0].status).toBe('running')
  })

  it('treats a failed provider-claim count lookup as indeterminate', async () => {
    MemoryQuery.failProviderClaimCount = true
    await expect(executeP11AuditCommand({
      actor: profileP11Actor('profile-a'), idempotencyKey: 'claim-count-failure', request: { queries: ['q'] },
      run: async () => { throw new Error('runner failed') },
    })).rejects.toThrow('runner failed')
    expect(tables.seo_llm_audit_commands[0].status).toBe('blocked_indeterminate')
  })

  it('blocks retries after an ambiguous claimed attempt or observation persistence error', async () => {
    const failAfterClaim = () => executeP11AuditCommand({
      actor: profileP11Actor('profile-a'), idempotencyKey: 'ambiguous-key', request: { queries: ['q'] },
      run: async (command) => {
        if (await command.claimProvider(0, 'provider-a')) provider()
        throw new Error('observation persistence failed')
      },
    })
    await expect(failAfterClaim()).rejects.toThrow('observation persistence failed')
    const retry = await executeP11AuditCommand({
      actor: profileP11Actor('profile-a'), idempotencyKey: 'ambiguous-key', request: { queries: ['q'] },
      run: async () => { throw new Error('must not run') },
    })
    expect(retry).toMatchObject({ kind: 'pending', command: { status: 'blocked_indeterminate' } })
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('blocks and never reinvokes when successful provider outcome persistence fails', async () => {
    MemoryQuery.failCompletedProviderClaimUpdate = true
    mockGenerateContentText.mockResolvedValue({
      text: JSON.stringify({ answer: 'A direct answer', answerFormat: 'direct_answer', sources: [], confidence: 0.7, flags: [] }),
      provider: 'provider-a',
      model: 'mock-model',
    })
    const actor = profileP11Actor('profile-a')
    const request = { queries: ['visa question'] }
    const runner = jest.fn((command: any) => auditQuery('visa question', undefined, null, 1, command, 0))
    await expect(executeP11AuditCommand({ actor, idempotencyKey: 'outcome-write-error', request, run: runner }))
      .rejects.toThrow('simulated completed claim write failure')
    expect(mockGenerateContentText).toHaveBeenCalledTimes(1)
    expect(tables.seo_llm_audit_provider_claims[0].status).toBe('claimed')
    expect(tables.seo_llm_audit_commands[0].status).toBe('blocked_indeterminate')

    const retryRunner = jest.fn((command: any) => auditQuery('visa question', undefined, null, 1, command, 0))
    const retry = await executeP11AuditCommand({ actor, idempotencyKey: 'outcome-write-error', request, run: retryRunner })
    expect(retry).toMatchObject({ kind: 'pending', command: { status: 'blocked_indeterminate' } })
    expect(retryRunner).not.toHaveBeenCalled()
    expect(mockGenerateContentText).toHaveBeenCalledTimes(1)
  })

  it('preserves ordinary provider failure when its failed claim outcome persists', async () => {
    mockGenerateContentText.mockRejectedValue(new Error('mock provider unavailable'))
    const actor = profileP11Actor('profile-a')
    const result = await executeP11AuditCommand({
      actor, idempotencyKey: 'provider-failure', request: { queries: ['visa question'] },
      run: (command) => auditQuery('visa question', undefined, null, 1, command, 0),
    })
    expect(result.kind).toBe('result')
    expect(tables.seo_llm_audit_provider_claims[0]).toMatchObject({ status: 'failed', error: 'mock provider unavailable' })
    expect(mockGenerateContentText).toHaveBeenCalledTimes(1)
  })

  it('persists provider terminal failures without treating them as successful attempts', async () => {
    const failed = await executeP11AuditCommand({
      actor: profileP11Actor('profile-a'), idempotencyKey: 'terminal-failure', request: { queries: ['q'] },
      run: async (command) => {
        if (await command.claimProvider(0, 'provider-a')) {
          provider()
          await command.finishProviderClaim(0, 'provider-a', 'failed', null, 'provider unavailable')
        }
        return { successfulProviderAttempts: 0, failed: 1 }
      },
    })
    expect(failed).toMatchObject({ kind: 'result', result: { successfulProviderAttempts: 0, failed: 1 } })
    expect(tables.seo_llm_audit_provider_claims[0]).toMatchObject({ status: 'failed', error: 'provider unavailable' })
  })

  it.each(['short', 'k'.repeat(201)])('rejects invalid key %s before initializing command storage', async (idempotencyKey) => {
    mockGetDb.mockClear()
    await expect(executeP11AuditCommand({
      actor: profileP11Actor('profile-a'), idempotencyKey, request: { queries: ['q'] }, run: async () => provider(),
    })).rejects.toThrow('Invalid P11 idempotency key')
    expect(mockGetDb).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })
})
