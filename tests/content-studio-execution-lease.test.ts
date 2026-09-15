import fs from 'node:fs'
import path from 'node:path'
import {
  assertContentStudioExecution,
  claimContentStudioExecution,
  releaseContentStudioExecution,
  renewContentStudioExecution,
} from '@/lib/seoFactory/writingContractStore'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260915_content_studio_execution_lease.sql'),
  'utf8',
)

describe('Content Studio execution lease schema review contract', () => {
  test('claim is atomic, takeover-safe, and increments the fencing token', () => {
    expect(sql).toMatch(/create or replace function public\.claim_content_studio_execution/i)
    expect(sql).toMatch(/execution_attempt\s*=\s*coalesce\(j\.execution_attempt,\s*0\)\s*\+\s*1/i)
    expect(sql).toMatch(/execution_lease_expires_at\s*<=\s*(?:now\(\)|clock_timestamp\(\))/i)
    expect(sql).toMatch(/j\.execution_owner\s+is\s+null/i)
  })

  test('renewal and current-owner assertion require owner plus attempt and an unexpired lease', () => {
    expect(sql).toMatch(/create or replace function public\.renew_content_studio_execution/i)
    expect(sql).toMatch(/create or replace function public\.(?:assert|check)_content_studio_execution/i)
    const ownerAttemptChecks = sql.match(/execution_owner\s*=\s*p_execution_owner[\s\S]{0,240}execution_attempt\s*=\s*p_execution_attempt/gi) || []
    expect(ownerAttemptChecks.length).toBeGreaterThanOrEqual(3)
    expect(sql).toMatch(/execution_lease_expires_at\s*>\s*(?:now\(\)|clock_timestamp\(\))/i)
  })

  test('release is fenced by owner and attempt and RPC execution is service-role only', () => {
    expect(sql).toMatch(/create or replace function public\.release_content_studio_execution/i)
    expect(sql).toMatch(/release_content_studio_execution[\s\S]{0,1200}execution_owner\s*=\s*p_execution_owner[\s\S]{0,240}execution_attempt\s*=\s*p_execution_attempt/i)
    for (const fn of ['claim_content_studio_execution', 'renew_content_studio_execution', 'check_content_studio_execution', 'release_content_studio_execution']) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^;]+from public, anon, authenticated`, 'i'))
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]+to service_role`, 'i'))
    }
  })

  test('existing contracted jobs remain claimable without pre-existing lease state', () => {
    expect(sql).toMatch(/add column if not exists execution_attempt\s+integer\s+not null\s+default\s+0/i)
    expect(sql).toMatch(/execution_owner\s+text/i)
    expect(sql).toMatch(/execution_lease_expires_at\s+timestamptz/i)
  })
})

describe('Content Studio execution lease runtime RPC helpers', () => {
  test('claim, renew, assert and release preserve one owner/attempt fencing token', async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const db = {
      rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args })
        if (fn === 'claim_content_studio_execution') {
          return { data: [{ execution_owner: 'owner-a', execution_attempt: 7, execution_lease_expires_at: '2026-09-15T06:00:00.000Z' }], error: null }
        }
        if (fn === 'renew_content_studio_execution') {
          return { data: [{ execution_lease_expires_at: '2026-09-15T06:15:00.000Z' }], error: null }
        }
        if (fn === 'check_content_studio_execution') return { data: true, error: null }
        if (fn === 'release_content_studio_execution') return { data: true, error: null }
        throw new Error(`unexpected rpc ${fn}`)
      }),
      from: jest.fn(),
    } as any

    const claim = await claimContentStudioExecution(db, {
      jobId: '00000000-0000-0000-0000-000000000001',
      contractId: 'contract-1',
      contractHash: 'hash-1',
      owner: 'owner-a',
      leaseSeconds: 900,
    })
    expect(claim).toMatchObject({ owner: 'owner-a', attempt: 7 })

    const renewed = await renewContentStudioExecution(db, {
      jobId: '00000000-0000-0000-0000-000000000001',
      contractId: 'contract-1',
      contractHash: 'hash-1',
      owner: claim.owner,
      attempt: claim.attempt,
      leaseSeconds: 900,
    })
    expect(renewed).toBe('2026-09-15T06:15:00.000Z')

    await expect(assertContentStudioExecution(db, {
      jobId: '00000000-0000-0000-0000-000000000001',
      contractId: 'contract-1',
      contractHash: 'hash-1',
      owner: claim.owner,
      attempt: claim.attempt,
    })).resolves.toBeUndefined()

    await expect(releaseContentStudioExecution(db, {
      jobId: '00000000-0000-0000-0000-000000000001',
      owner: claim.owner,
      attempt: claim.attempt,
    })).resolves.toBe(true)

    expect(calls.map((entry) => entry.fn)).toEqual([
      'claim_content_studio_execution',
      'renew_content_studio_execution',
      'check_content_studio_execution',
      'release_content_studio_execution',
    ])
    expect(calls[1].args).toMatchObject({ p_execution_owner: 'owner-a', p_execution_attempt: 7 })
    expect(calls[2].args).toMatchObject({ p_execution_owner: 'owner-a', p_execution_attempt: 7 })
    expect(calls[3].args).toMatchObject({ p_execution_owner: 'owner-a', p_execution_attempt: 7 })
  })

  test('stale owner assertion fails closed', async () => {
    const db = {
      rpc: jest.fn(async () => ({ data: false, error: null })),
      from: jest.fn(),
    } as any
    await expect(assertContentStudioExecution(db, {
      jobId: '00000000-0000-0000-0000-000000000001',
      contractId: 'contract-1',
      contractHash: 'hash-1',
      owner: 'stale-owner',
      attempt: 3,
    })).rejects.toThrow(/lease|execution|stale|owner/i)
  })
})
