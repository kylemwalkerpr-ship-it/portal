/**
 * DISPOSABLE VALIDATION HARNESS — NOT FOR MERGE.
 * Requires a fresh PostgreSQL 16 database with PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.
 * Runs the exact p11AuditCommand implementation through a deliberately narrow
 * PostgREST-shaped adapter backed by psql. It never calls a real provider.
 */
import { execFile, execFileSync } from 'node:child_process'
import { NextRequest } from 'next/server'

const mockRequireAdminUser = jest.fn()
const mockRunVisibilityAudits = jest.fn()
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: (...args: unknown[]) => mockRequireAdminUser(...args) }))
jest.mock('@/lib/supabase', () => ({ getSupabaseAdminClient: () => new MockPsqlSupabaseAdapter() }))
jest.mock('@/lib/seoEngine/llmVisibility', () => ({
  runVisibilityAudits: (...args: unknown[]) => mockRunVisibilityAudits(...args),
  runFanOutVisibilityAudits: (...args: unknown[]) => mockRunVisibilityAudits(...args),
  loadVisibilityFeed: jest.fn(),
  loadVisibilityByCluster: jest.fn(),
}))

import { executeP11AuditCommand, profileP11Actor } from '@/lib/seoEngine/p11AuditCommand'
import { POST as visibilityPost } from '@/app/api/seo-engine/llm-visibility/route'

type Row = Record<string, any>
type Action = 'select' | 'insert' | 'update'

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function sqlValue(column: string, value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const encoded = sqlString(typeof value === 'string' ? value : JSON.stringify(value))
  return column === 'request_json' || column === 'result_json' ? `${encoded}::jsonb` : encoded
}

function psql(sql: string): { rows: Row[]; stderr: string } {
  try {
    const output = execFileSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-c', sql], {
      encoding: 'utf8',
      env: process.env,
    }).trim()
    return { rows: output ? JSON.parse(output) : [], stderr: '' }
  } catch (error: any) {
    const stderr = String(error?.stderr || error?.message || 'psql failed')
    return { rows: [], stderr }
  }
}

function psqlAsync(sql: string): Promise<string> {
  const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-c', sql]
  return new Promise((resolve, reject) => {
    execFile('psql', args, { encoding: 'utf8', env: process.env }, (error, stdout, stderr) => {
      if (error) {
        Object.assign(error, { stderr })
        reject(error)
        return
      }
      resolve(stdout.trim())
    })
  })
}

class PsqlQuery {
  private action: Action = 'select'
  private values: Row = {}
  private filters: Array<[string, unknown]> = []
  private head = false
  private selected = '*'
  constructor(private readonly table: string) {}
  insert(values: Row) { this.action = 'insert'; this.values = values; return this }
  update(values: Row) { this.action = 'update'; this.values = values; return this }
  select(fields = '*', options?: { head?: boolean; count?: string }) {
    if (this.action === 'select') this.action = 'select'
    this.selected = fields
    this.head = Boolean(options?.head)
    return this
  }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this }
  maybeSingle() { return this.execute(true) }
  single() { return this.execute(true) }
  then(resolve?: any, reject?: any): Promise<any> {
    return this.execute(false).then(resolve, reject)
  }
  private where(): string {
    return this.filters.length
      ? ` where ${this.filters.map(([column, value]) => `${column} = ${sqlValue(column, value)}`).join(' and ')}`
      : ''
  }
  private async execute(single: boolean): Promise<any> {
    let inner: string
    if (this.head) {
      inner = `select count(*)::int as count from public.${this.table}${this.where()}`
    } else if (this.action === 'insert') {
      const columns = Object.keys(this.values)
      inner = `insert into public.${this.table} (${columns.join(', ')}) values (${columns.map((column) => sqlValue(column, this.values[column])).join(', ')}) returning *`
    } else if (this.action === 'update') {
      const assignments = Object.entries(this.values).map(([column, value]) => `${column} = ${sqlValue(column, value)}`).join(', ')
      inner = `update public.${this.table} set ${assignments}${this.where()} returning *`
    } else {
      inner = `select ${this.selected} from public.${this.table}${this.where()}`
    }
    const query = this.head
      ? `select coalesce((select count from (${inner}) counted), 0)::text`
      : this.action === 'insert' || this.action === 'update'
        ? `with mutated as (${inner}) select coalesce(json_agg(row_to_json(mutated)), '[]'::json)::text from mutated`
        : `select coalesce(json_agg(row_to_json(result)), '[]'::json)::text from (${inner}) result`
    try {
      const output = await psqlAsync(query)
      if (this.head) return { data: null, count: Number(output), error: null }
      const rows: Row[] = output ? JSON.parse(output) : []
      return { data: single ? rows[0] ?? null : rows, count: null, error: null }
    } catch (error: any) {
      const message = String(error?.stderr || error?.message || 'psql failed')
      const code = message.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1]
      return { data: null, count: null, error: { code, message } }
    }
  }
}

class MockPsqlSupabaseAdapter {
  from(table: string) { return new PsqlQuery(table) }
}

function scalar(sql: string): string {
  const output = execFileSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8', env: process.env,
  }).trim()
  return output
}

const actor = profileP11Actor('11111111-1111-4111-8111-111111111111')
const request = { queries: ['  visa question  '], maxAudits: 1 }
const postgresDescribe = process.env.P11_PG_LIFECYCLE === '1' ? describe : describe.skip

postgresDescribe('P11 #289 PostgreSQL lifecycle (disposable PG16 only)', () => {
  beforeEach(() => {
    mockRequireAdminUser.mockResolvedValue({ profileId: actor.profileId })
    mockRunVisibilityAudits.mockReset()
  })

  it('admits one durable command under concurrent same-key calls and grants only one callback owner', async () => {
    execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', `
      create function public.p11_test_delay_command_insert() returns trigger language plpgsql as $$
      begin perform pg_sleep(0.2); return new; end $$;
      create trigger p11_test_delay_command_insert before insert on public.seo_llm_audit_commands
      for each row execute function public.p11_test_delay_command_insert();
    `], { encoding: 'utf8', env: process.env })

    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const callbackStarted = new Promise<void>((resolve) => { started = resolve })
    let callbackCount = 0
    const run = async () => executeP11AuditCommand({
      actor, idempotencyKey: 'pg-concurrent-001', request,
      run: async () => { callbackCount += 1; started(); await gate; return { ok: true } },
    })
    const calls = [run(), run()]
    const tagged = calls.map((call, index) => call.then((outcome) => ({ index, outcome })))
    try {
      await callbackStarted
      expect(callbackCount).toBe(1)
      const loser = await Promise.race(tagged)
      expect(loser.outcome.kind).toBe('pending')
      release()
      const outcomes = await Promise.all(tagged)
      expect(outcomes.map(({ outcome }) => outcome.kind).sort()).toEqual(['pending', 'result'])
      expect(outcomes.find(({ outcome }) => outcome.kind === 'result')?.outcome).toMatchObject({ kind: 'result', result: { ok: true } })
      expect(callbackCount).toBe(1)
      expect(Number(scalar("select count(*) from public.seo_llm_audit_commands where idempotency_key = 'pg-concurrent-001'"))).toBe(1)
    } finally {
      release()
      await Promise.allSettled(calls)
      execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', 'drop trigger if exists p11_test_delay_command_insert on public.seo_llm_audit_commands; drop function if exists public.p11_test_delay_command_insert()'], { encoding: 'utf8', env: process.env })
    }
  })

  it('conflicts on the same actor and key with a different normalized request', async () => {
    let callbacks = 0
    await executeP11AuditCommand({ actor, idempotencyKey: 'pg-conflict-001', request, run: async () => ({ ok: true }) })
    const conflict = await executeP11AuditCommand({
      actor, idempotencyKey: 'pg-conflict-001', request: { queries: ['other'] }, run: async () => { callbacks += 1; return { mustNotRun: true } },
    })
    expect(conflict.kind).toBe('conflict')
    expect(callbacks).toBe(0)
    expect(Number(scalar("select count(*) from public.seo_llm_audit_commands where idempotency_key = 'pg-conflict-001'"))).toBe(1)
  })

  it('writes a durable provider claim before simulated side effect and blocks ambiguous disconnect replay', async () => {
    let sideEffects = 0
    const key = 'pg-disconnect-001'
    const run = (callback: (command: any) => Promise<any>) => executeP11AuditCommand({
      actor, idempotencyKey: key, request, run: callback,
    })
    await expect(run(async (command) => {
      expect(await command.claimProvider(0, 'mock-provider')).toBe(true)
      expect(Number(scalar(`select count(*) from public.seo_llm_audit_provider_claims where command_id = '${command.commandId}' and status = 'claimed'`))).toBe(1)
      sideEffects += 1
      // This proves application recovery from a transport-disconnect exception
      // after a claim; it does not exercise TCP or provider infrastructure.
      throw Object.assign(new Error('simulated transport disconnect after claim'), { code: 'ECONNRESET' })
    })).rejects.toMatchObject({ message: 'simulated transport disconnect after claim', code: 'ECONNRESET' })
    const replay = await run(async () => { sideEffects += 1; return { mustNotRun: true } })
    expect(replay).toMatchObject({ kind: 'pending', command: { status: 'blocked_indeterminate' } })
    expect(sideEffects).toBe(1)
  })

  it('replays completed result without executing callback again', async () => {
    let runs = 0
    const execute = () => executeP11AuditCommand({
      actor, idempotencyKey: 'pg-replay-001', request,
      run: async () => { runs += 1; return { completed: true } },
    })
    await execute()
    expect(await execute()).toMatchObject({ kind: 'result', replayed: true, result: { completed: true } })
    expect(runs).toBe(1)
  })

  it('enforces observation uniqueness by command and ordinal with SQLSTATE 23505', async () => {
    const admission = await executeP11AuditCommand({
      actor, idempotencyKey: 'pg-observation-001', request, run: async (command) => ({ commandId: command.commandId }),
    })
    const commandId = (admission as any).command.id
    const insert = (ordinal: number) => psql(`with inserted as (insert into public.seo_llm_visibility (query, engine, command_id, query_ordinal) values ('q-${ordinal}', 'mock', '${commandId}', ${ordinal}) returning id) select coalesce(json_agg(row_to_json(inserted)), '[]'::json)::text from inserted`)
    expect(insert(0).stderr).toBe('')
    expect(insert(0).stderr).toMatch(/ERROR:\s+23505:/)
    expect(insert(1).stderr).toBe('')
  })

  it('fails closed when completed persistence fails and leaves durable evidence blocked from retry', async () => {
    const key = 'pg-complete-failure-001'
    execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', `
      create function public.p11_test_block_completion() returns trigger language plpgsql as $$
      begin if new.status = 'completed' then raise exception 'test blocks completed transition'; end if; return new; end $$;
      create trigger p11_test_block_completion before update on public.seo_llm_audit_commands
      for each row execute function public.p11_test_block_completion();
    `], { encoding: 'utf8', env: process.env })
    let callbacks = 0
    const execute = (run: (command: any) => Promise<any>) => executeP11AuditCommand({ actor, idempotencyKey: key, request, run })
    await expect(execute(async (command) => {
      callbacks += 1
      await command.claimProvider(0, 'mock-provider')
      return { sideEffectDone: true }
    })).rejects.toThrow('test blocks completed transition')
    execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', 'drop trigger p11_test_block_completion on public.seo_llm_audit_commands; drop function public.p11_test_block_completion()'], { encoding: 'utf8', env: process.env })
    const retry = await execute(async () => { callbacks += 1; return { mustNotRun: true } })
    expect(retry).toMatchObject({ kind: 'pending', command: { status: 'blocked_indeterminate' } })
    expect(callbacks).toBe(1)
  })

  it('keeps new tables inaccessible to client roles and available only to service_role', () => {
    for (const table of ['seo_llm_audit_commands', 'seo_llm_audit_provider_claims']) {
      expect(scalar(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass`)).toBe('t')
      expect(scalar(`select has_table_privilege('anon', 'public.${table}', 'select') or has_table_privilege('authenticated', 'public.${table}', 'select')`)).toBe('f')
      expect(scalar(`select has_table_privilege('service_role', 'public.${table}', 'select')`)).toBe('t')
      expect(scalar(`select count(*) from pg_policies where schemaname='public' and tablename='${table}' and 'service_role'=any(roles)`)).toBe('1')
    }
    expect(psql('set role anon; select * from public.seo_llm_audit_commands').stderr).toMatch(/ERROR:\s+42501:/)
    expect(psql('set role authenticated; select * from public.seo_llm_audit_provider_claims').stderr).toMatch(/ERROR:\s+42501:/)
    expect(psql('set role service_role; select count(*) from public.seo_llm_audit_commands').stderr).toBe('')
  })

  it('runs the real route POST through PostgreSQL lifecycle with auth and provider behavior mocked', async () => {
    let providerSideEffects = 0
    mockRunVisibilityAudits.mockImplementation(async ({ command }: any) => {
      if (await command.claimProvider(0, 'mock-provider')) {
        providerSideEffects += 1
        await command.finishProviderClaim(0, 'mock-provider', 'completed', { simulated: true })
      }
      return { audits: 1 }
    })
    const post = (key: string, body: unknown) => visibilityPost(new NextRequest('http://localhost/api/seo-engine/llm-visibility', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body),
    }))
    const first = await post('pg-route-001', { queries: ['visa question'], maxAudits: 1 })
    const firstBody = await first.json()
    expect(first.status).toBe(200)
    expect(firstBody.replayed).toBe(false)
    const conflict = await post('pg-route-001', { queries: ['different question'], maxAudits: 1 })
    expect(conflict.status).toBe(409)
    expect(providerSideEffects).toBe(1)
    expect(Number(scalar(`select count(*) from public.seo_llm_audit_commands where id='${firstBody.commandId}' and status='completed'`))).toBe(1)
  })
})
