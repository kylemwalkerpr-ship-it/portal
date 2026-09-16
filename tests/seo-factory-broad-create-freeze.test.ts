/**
 * P0 broad-CREATE freeze — execution gate at the central SEO Factory boundary.
 *
 * Cleanup-to-expansion parity is not yet proven (P13 controlled expansion is
 * still PENDING), so an unmatched keyword routed by standing rules /
 * content-type defaults must not become permission to author and ship a
 * net-new public page. Existing authoritative destinations (exact registry
 * owner URLs, strike-seed owners, explicit cluster ownerUrlHints) and normal
 * refresh/expand/keep flows must keep working.
 *
 * These tests use the REAL `resolveOwner` output and the REAL pipeline entry
 * points (no mocked gate) so the frozen default, the explicit P13 unlock and
 * the authoritative-existing allow-list are all proven end to end.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import {
  BROAD_CREATE_UNLOCK_ENV,
  assertBroadCreateAllowed,
  broadCreateFreezeMessage,
  isBroadCreateUnlocked,
  isBroadNetNewCreate,
} from '@/lib/seoFactory/broadCreateFreeze'
import { runSeoFactoryPipeline } from '@/lib/seoFactory/pipeline'
import { runSeoFactoryPipelineStream, type PipelineStreamEvent } from '@/lib/seoFactory/pipelineStream'

// The unlocked runs must never touch real infrastructure. The gate is NOT
// mocked — only the Supabase client and the GSC brief are stubbed so an
// unlocked plan can be observed passing the gate without network writes.
jest.mock('@supabase/supabase-js', () => {
  const result = { data: null, error: null }
  const chain: Record<string, unknown> = {}
  const passthrough = () => chain
  for (const method of [
    'from', 'select', 'eq', 'neq', 'not', 'in', 'order', 'limit',
    'update', 'insert', 'delete', 'gte', 'lte', 'is', 'match',
  ]) {
    chain[method] = jest.fn(passthrough)
  }
  chain.maybeSingle = jest.fn(async () => result)
  chain.single = jest.fn(async () => result)
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return { createClient: jest.fn(() => chain) }
})

jest.mock('@/lib/gscContentBrief', () => ({
  buildGscContentBrief: jest.fn(async () => {
    throw new Error('SENTINEL_DOWNSTREAM_BRIEF_REACHED')
  }),
  formatGscBriefForPrompt: jest.fn(() => ''),
}))

const UNMATCHED_KEYWORD = 'uk graduate visa requirements'
const REGISTRY_KEYWORD = 'uk spouse visa document checklist 2026'
const STRIKE_SEED_KEYWORD = 'uk university of bristol international student guide'

type GatePlan = Pick<OwnerPlan, 'matched' | 'action' | 'routingSource'>

const plan = (over: Partial<GatePlan>): GatePlan => ({
  matched: null,
  action: 'build',
  routingSource: 'standing_rules',
  ...over,
})

describe('broad-create freeze · gate predicate', () => {
  it('freezes unmatched fallback builds (standing_rules and content_type_default)', () => {
    expect(isBroadNetNewCreate(plan({ routingSource: 'standing_rules' }))).toBe(true)
    expect(isBroadNetNewCreate(plan({ routingSource: 'content_type_default' }))).toBe(true)
  })

  it('does not freeze plans that already have an authoritative existing destination', () => {
    // Exact registry owner URL / host (registry row matched).
    expect(
      isBroadNetNewCreate(plan({
        matched: { id: 1, owner_url: 'https://legal.yousafeconsultancy.com/uk/x/' } as OwnerPlan['matched'],
        routingSource: 'registry_owner_url',
      })),
    ).toBe(false)
    expect(
      isBroadNetNewCreate(plan({
        matched: { id: 1, owner_url: '' } as OwnerPlan['matched'],
        routingSource: 'registry_host',
      })),
    ).toBe(false)
    // Strike-seed existing owner (expand/keep).
    expect(isBroadNetNewCreate(plan({ action: 'expand', routingSource: 'strike_seed' }))).toBe(false)
    expect(isBroadNetNewCreate(plan({ action: 'keep', routingSource: 'strike_seed' }))).toBe(false)
    // Explicit existing cluster ownerUrlHint.
    expect(isBroadNetNewCreate(plan({ action: 'expand', routingSource: 'registry_owner_url' }))).toBe(false)
    // Normal refresh/expand/keep flows never carry action=build.
    expect(isBroadNetNewCreate(plan({ action: 'expand', routingSource: 'standing_rules' }))).toBe(false)
    expect(isBroadNetNewCreate(plan({ action: 'keep', routingSource: 'standing_rules' }))).toBe(false)
  })

  it('is fail-closed for unknown future routing sources', () => {
    expect(isBroadNetNewCreate(plan({ routingSource: 'some_future_fallback' as OwnerPlan['routingSource'] }))).toBe(true)
  })
})

describe('broad-create freeze · explicit P13 unlock', () => {
  it('defaults to frozen — only the intentional flag unlocks', () => {
    expect(isBroadCreateUnlocked({})).toBe(false)
    expect(isBroadCreateUnlocked({ [BROAD_CREATE_UNLOCK_ENV]: '0' })).toBe(false)
    expect(isBroadCreateUnlocked({ [BROAD_CREATE_UNLOCK_ENV]: 'false' })).toBe(false)
    expect(isBroadCreateUnlocked({ [BROAD_CREATE_UNLOCK_ENV]: 'yes' })).toBe(false)
    // Unrelated environments are never inferred as an unlock.
    expect(isBroadCreateUnlocked({ NODE_ENV: 'development', SEO_REPORT_EMAIL: 'ops@example.com' })).toBe(false)
    expect(isBroadCreateUnlocked({ [BROAD_CREATE_UNLOCK_ENV]: '1' })).toBe(true)
    expect(isBroadCreateUnlocked({ [BROAD_CREATE_UNLOCK_ENV]: 'true' })).toBe(true)
  })

  it('throws a deterministic, operator-readable refusal by default and permits with the flag', () => {
    const frozen = plan({ routingSource: 'standing_rules' })
    expect(() => assertBroadCreateAllowed(frozen, { env: {} })).toThrow(/broad net-new CREATE/i)
    expect(() => assertBroadCreateAllowed(frozen, { env: { [BROAD_CREATE_UNLOCK_ENV]: '1' } })).not.toThrow()

    const message = broadCreateFreezeMessage(frozen, { primaryKeyword: UNMATCHED_KEYWORD })
    expect(message).toMatch(/broad net-new CREATE/i)
    expect(message).toMatch(/frozen/i)
    expect(message).toMatch(/cleanup-to-expansion parity/i)
    expect(message).toMatch(/P13/)
    expect(message).toContain(BROAD_CREATE_UNLOCK_ENV)
    expect(message).toContain(UNMATCHED_KEYWORD)
    expect(message).toContain('standing_rules')
  })
})

describe('broad-create freeze · real ownership routing stays untouched', () => {
  it('still routes an unmatched keyword through standing_rules (routing rewrite forbidden)', async () => {
    const resolved = await resolveOwner({
      primaryKeyword: UNMATCHED_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(resolved.matched).toBeNull()
    expect(resolved.routingSource).toBe('standing_rules')
    expect(resolved.action).toBe('build')
    expect(isBroadNetNewCreate(resolved)).toBe(true)
  })

  it('does not freeze a real exact-registry-owner resolution', async () => {
    const resolved = await resolveOwner({
      primaryKeyword: REGISTRY_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(resolved.routingSource).toBe('registry_owner_url')
    expect(isBroadNetNewCreate(resolved)).toBe(false)
  })

  it('does not freeze a real strike-seed expansion', async () => {
    const resolved = await resolveOwner({
      primaryKeyword: STRIKE_SEED_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(resolved.routingSource).toBe('strike_seed')
    expect(resolved.action).toBe('expand')
    expect(isBroadNetNewCreate(resolved)).toBe(false)
  })

  it('does not freeze a real explicit existing cluster owner hint', async () => {
    const resolved = await resolveOwner({
      primaryKeyword: 'study permit refusal reapply canada 2026',
      contentType: 'legal_guide',
      region: 'CA',
      ownerUrlHint: 'https://legal.yousafeconsultancy.com/ca/study-permit-refusal-reapply-2026/',
    })
    expect(resolved.action).toBe('expand')
    expect(resolved.routingSource).toBe('registry_owner_url')
    expect(isBroadNetNewCreate(resolved)).toBe(false)
  })
})

describe('broad-create freeze · non-stream pipeline boundary', () => {
  const originalUnlock = process.env[BROAD_CREATE_UNLOCK_ENV]

  afterEach(() => {
    if (originalUnlock === undefined) delete process.env[BROAD_CREATE_UNLOCK_ENV]
    else process.env[BROAD_CREATE_UNLOCK_ENV] = originalUnlock
  })

  it('refuses an unmatched broad create before GSC brief / generation / job persistence', async () => {
    delete process.env[BROAD_CREATE_UNLOCK_ENV]
    await expect(
      runSeoFactoryPipeline({
        topic: UNMATCHED_KEYWORD,
        contentType: 'legal_guide',
        region: 'UK',
        shipMode: 'none',
      }),
    ).rejects.toThrow(/broad net-new CREATE/i)
  })

  it('permits the same plan once the explicit unlock is configured', async () => {
    process.env[BROAD_CREATE_UNLOCK_ENV] = '1'
    // The stubbed GSC brief is the first downstream step after the gate, so
    // reaching its sentinel proves the gate let the plan through without
    // touching generation or infrastructure.
    await expect(
      runSeoFactoryPipeline({
        topic: UNMATCHED_KEYWORD,
        contentType: 'legal_guide',
        region: 'UK',
        shipMode: 'none',
      }),
    ).rejects.toThrow('SENTINEL_DOWNSTREAM_BRIEF_REACHED')
  })
})

describe('broad-create freeze · stream pipeline boundary', () => {
  const originalUnlock = process.env[BROAD_CREATE_UNLOCK_ENV]

  afterEach(() => {
    if (originalUnlock === undefined) delete process.env[BROAD_CREATE_UNLOCK_ENV]
    else process.env[BROAD_CREATE_UNLOCK_ENV] = originalUnlock
  })

  it('emits a terminal error — no job row, no delta, no final — before generation', async () => {
    delete process.env[BROAD_CREATE_UNLOCK_ENV]
    const events: PipelineStreamEvent[] = []
    for await (const event of runSeoFactoryPipelineStream({
      topic: UNMATCHED_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
      shipMode: 'none',
    })) {
      events.push(event)
    }
    const errors = events.filter((e) => e.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ type: 'error', error: expect.stringMatching(/broad net-new CREATE/i) })
    expect(events.some((e) => e.type === 'job')).toBe(false)
    expect(events.some((e) => e.type === 'delta')).toBe(false)
    expect(events.some((e) => e.type === 'final')).toBe(false)
  })

  it('permits the same plan once the explicit unlock is configured', async () => {
    process.env[BROAD_CREATE_UNLOCK_ENV] = '1'
    const events: PipelineStreamEvent[] = []
    for await (const event of runSeoFactoryPipelineStream({
      topic: UNMATCHED_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
      shipMode: 'none',
    })) {
      events.push(event)
    }
    const errors = events.filter((e) => e.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      type: 'error',
      error: expect.stringContaining('SENTINEL_DOWNSTREAM_BRIEF_REACHED'),
    })
    expect(events.some((e) => e.type === 'delta')).toBe(false)
  })
})

describe('broad-create freeze · call sites are wired before authoring', () => {
  const root = process.cwd()
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

  it('non-stream gate runs after resolveOwner and before any job persistence', () => {
    const src = read('lib/seoFactory/pipeline.ts')
    const resolveAt = src.indexOf('const plan = await resolveOwner(')
    const gateAt = src.indexOf('assertBroadCreateAllowed(plan')
    const persistAt = src.indexOf('persistPipelineJob(')
    expect(resolveAt).toBeGreaterThan(-1)
    expect(gateAt).toBeGreaterThan(resolveAt)
    expect(persistAt).toBeGreaterThan(gateAt)
  })

  it('stream gate runs after resolveOwner and before the early drafting row', () => {
    const src = read('lib/seoFactory/pipelineStream.ts')
    const resolveAt = src.indexOf('const plan = await resolveOwner(')
    const gateAt = src.indexOf('assertBroadCreateAllowed(plan')
    const draftingRowAt = src.indexOf("status: 'drafting'")
    expect(resolveAt).toBeGreaterThan(-1)
    expect(gateAt).toBeGreaterThan(resolveAt)
    expect(draftingRowAt).toBeGreaterThan(gateAt)
  })
})
