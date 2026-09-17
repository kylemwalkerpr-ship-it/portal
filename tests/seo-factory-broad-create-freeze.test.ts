/**
 * P0 broad-CREATE freeze — execution gate at the central SEO Factory boundary.
 *
 * Cleanup-to-expansion parity is not yet proven (P13 controlled expansion is
 * still PENDING), so an unmatched keyword routed by standing rules /
 * content-type defaults must not become permission to author and ship a
 * net-new public page. Only routing that proves the FINAL DESTINATION already
 * exists (a matched registry owner URL, or a strike-seed owner) keeps working;
 * fallback routes stay frozen whatever action label they carry. `registry_host`
 * is invented when a matched row's owner_url is unusable, so it must NOT be
 * treated as authoritative — and an `ownerUrlHint` is NOT authority unless it
 * names the matched registry row's owner_url (harmless trailing slash aside).
 * A hint that matches no registry row, or differs from the matched owner, is
 * just as fabricated as a standing-rules URL.
 *
 * These tests use the REAL `resolveOwner` output and the REAL pipeline entry
 * points (no mocked gate) so the frozen default, the explicit P13 unlock and
 * the destination-authority allow-list are all proven end to end.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import {
  BROAD_CREATE_UNLOCK_ENV,
  assertBroadCreateAllowed,
  assertBroadCreateDestinationAllowed,
  assertPublicationDestinationAllowed,
  broadCreateFreezeMessage,
  checkBroadCreateDestinationLive,
  isBroadCreateUnlocked,
  isBroadNetNewCreate,
  resetBroadCreateLiveCache,
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
/**
 * Current EXACT-LIVE registry owner (registry id 3, confirmed/keep; the live
 * page answers 200 at this exact URL). The previous success fixture (id 58,
 * uk spouse visa document checklist 2026) is known to redirect to a different
 * destination today, so it must never stand in for an existing owner.
 */
const REGISTRY_KEYWORD = 'f-1 document checklist'
const REGISTRY_OWNER_URL =
  'https://legal.yousafeconsultancy.com/us/student-visas/f1-document-checklist-2026/'
const REGISTRY_REGION = 'US'
/**
 * Known-redirecting registry row (id 58, proposed). Its owner URL answers 200
 * only after redirecting to the Canada spousal-sponsorship checklist, so static
 * registry agreement alone is not proof of existence.
 */
const REDIRECTING_KEYWORD = 'uk spouse visa document checklist 2026'
const REDIRECTING_OWNER_URL =
  'https://legal.yousafeconsultancy.com/uk/immigration/uk-spouse-visa-document-checklist-2026/'
const REDIRECT_TARGET_URL =
  'https://legal.yousafeconsultancy.com/ca/family/canada-spousal-sponsorship-document-checklist-2026/'
const STRIKE_SEED_KEYWORD = 'uk university of bristol international student guide'
const STRIKE_SEED_CANONICAL =
  'https://legal.yousafeconsultancy.com/guide/uk-university-of-bristol-international-student-guide/'

type GatePlan = Pick<OwnerPlan, 'matched' | 'action' | 'routingSource' | 'canonicalUrl'>

const plan = (over: Partial<GatePlan>): GatePlan => ({
  matched: null,
  action: 'build',
  routingSource: 'standing_rules',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/uk/x/',
  ...over,
})

describe('broad-create freeze · gate predicate', () => {
  it('freezes every fallback route regardless of action label', () => {
    // A fallback route invents a destination. `registry_host` is emitted when a
    // matched row's owner_url cannot be parsed and the resolver fabricates a
    // pathForHostFallback destination, so it is NOT an existing owner — and an
    // `expand`/`keep` label on it is not proof either.
    expect(
      isBroadNetNewCreate(plan({
        matched: { id: 1, owner_url: '' } as OwnerPlan['matched'],
        routingSource: 'registry_host',
      })),
    ).toBe(true)
    expect(isBroadNetNewCreate(plan({ action: 'build', routingSource: 'registry_host' }))).toBe(true)
    expect(isBroadNetNewCreate(plan({ action: 'expand', routingSource: 'registry_host' }))).toBe(true)
    expect(isBroadNetNewCreate(plan({ action: 'keep', routingSource: 'registry_host' }))).toBe(true)
    // Unmatched fallbacks, including mislabeled expand/keep flows.
    expect(isBroadNetNewCreate(plan({ action: 'build', routingSource: 'standing_rules' }))).toBe(true)
    expect(isBroadNetNewCreate(plan({ action: 'expand', routingSource: 'standing_rules' }))).toBe(true)
    expect(isBroadNetNewCreate(plan({ action: 'keep', routingSource: 'standing_rules' }))).toBe(true)
    expect(isBroadNetNewCreate(plan({ action: 'build', routingSource: 'content_type_default' }))).toBe(true)
    expect(isBroadNetNewCreate(plan({ action: 'expand', routingSource: 'content_type_default' }))).toBe(true)
    expect(isBroadNetNewCreate(plan({ action: 'keep', routingSource: 'content_type_default' }))).toBe(true)
  })

  it('does not freeze plans whose routing proves an existing destination', () => {
    // Exact registry owner URL: matched owner_url must agree with the final
    // canonical (harmless trailing slash aside).
    expect(
      isBroadNetNewCreate(plan({
        matched: { id: 1, owner_url: REGISTRY_OWNER_URL } as OwnerPlan['matched'],
        routingSource: 'registry_owner_url',
        canonicalUrl: REGISTRY_OWNER_URL,
      })),
    ).toBe(false)
    expect(
      isBroadNetNewCreate(plan({
        matched: { id: 1, owner_url: REGISTRY_OWNER_URL } as OwnerPlan['matched'],
        routingSource: 'registry_owner_url',
        canonicalUrl: REGISTRY_OWNER_URL.replace(/\/$/, ''),
      })),
    ).toBe(false)
    // Strike-seed existing owner (expand/keep) — canonical must be the locked
    // seed URL, not merely any YouSafe URL.
    expect(
      isBroadNetNewCreate(plan({
        action: 'expand',
        routingSource: 'strike_seed',
        canonicalUrl: STRIKE_SEED_CANONICAL,
      })),
    ).toBe(false)
    expect(
      isBroadNetNewCreate(plan({
        action: 'keep',
        routingSource: 'strike_seed',
        canonicalUrl: STRIKE_SEED_CANONICAL,
      })),
    ).toBe(false)
  })

  it('freezes registry_owner_url claims that do not carry the matched owner or final canonical agreement', () => {
    // A label alone is not authority: no matched row, no owner URL, a
    // mismatched owner URL, or a blank final canonical all stay frozen.
    expect(isBroadNetNewCreate(plan({ action: 'expand', routingSource: 'registry_owner_url' }))).toBe(true)
    expect(
      isBroadNetNewCreate(plan({
        matched: { id: 1, owner_url: '' } as OwnerPlan['matched'],
        routingSource: 'registry_owner_url',
      })),
    ).toBe(true)
    expect(
      isBroadNetNewCreate(plan({
        matched: { id: 1, owner_url: 'not a url' } as OwnerPlan['matched'],
        routingSource: 'registry_owner_url',
      })),
    ).toBe(true)
    expect(
      isBroadNetNewCreate(plan({
        matched: { id: 1, owner_url: REGISTRY_OWNER_URL } as OwnerPlan['matched'],
        routingSource: 'registry_owner_url',
        canonicalUrl: 'https://legal.yousafeconsultancy.com/uk/immigration/some-other-page/',
      })),
    ).toBe(true)
    expect(
      isBroadNetNewCreate(plan({
        matched: { id: 1, owner_url: REGISTRY_OWNER_URL } as OwnerPlan['matched'],
        routingSource: 'registry_owner_url',
        canonicalUrl: '',
      })),
    ).toBe(true)
    // Strike-seed claims must name a locked seed canonical.
    expect(
      isBroadNetNewCreate(plan({
        routingSource: 'strike_seed',
        canonicalUrl: 'https://legal.yousafeconsultancy.com/guide/some-other-page/',
      })),
    ).toBe(true)
    expect(isBroadNetNewCreate(plan({ routingSource: 'strike_seed', canonicalUrl: '' }))).toBe(true)
  })

  it('is fail-closed for unknown future routing sources, whatever the action', () => {
    expect(isBroadNetNewCreate(plan({ routingSource: 'some_future_fallback' as OwnerPlan['routingSource'] }))).toBe(true)
    expect(isBroadNetNewCreate(plan({ action: 'expand', routingSource: 'some_future_fallback' as OwnerPlan['routingSource'] }))).toBe(true)
    expect(isBroadNetNewCreate(plan({ action: 'keep', routingSource: 'some_future_fallback' as OwnerPlan['routingSource'] }))).toBe(true)
  })

  it('freezes a registry_host fallback through assertBroadCreateAllowed unless P13 unlocks', () => {
    const fallbackExpand = plan({
      matched: { id: 1, owner_url: '' } as OwnerPlan['matched'],
      action: 'expand',
      routingSource: 'registry_host',
    })
    expect(() => assertBroadCreateAllowed(fallbackExpand, { env: {} })).toThrow(/broad net-new CREATE/i)
    expect(() => assertBroadCreateAllowed({ ...fallbackExpand, action: 'keep' }, { env: {} })).toThrow(/broad net-new CREATE/i)
    expect(() => assertBroadCreateAllowed({ ...fallbackExpand, action: 'build' }, { env: {} })).toThrow(/broad net-new CREATE/i)
    expect(() => assertBroadCreateAllowed(fallbackExpand, { env: { [BROAD_CREATE_UNLOCK_ENV]: '1' } })).not.toThrow()
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
      region: REGISTRY_REGION,
    })
    expect(resolved.routingSource).toBe('registry_owner_url')
    expect(resolved.matched?.owner_url).toBe(REGISTRY_OWNER_URL)
    expect(resolved.canonicalUrl).toBe(REGISTRY_OWNER_URL)
    expect(isBroadNetNewCreate(resolved)).toBe(false)
  })

  it('keeps static authority for the known-redirecting registry row (static proof alone is not live proof)', async () => {
    // Registry agreement is NECESSARY but NOT SUFFICIENT: the live URL for id 58
    // currently redirects elsewhere, and only the async live proof can see that.
    const resolved = await resolveOwner({
      primaryKeyword: REDIRECTING_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(resolved.routingSource).toBe('registry_owner_url')
    expect(resolved.matched?.owner_url).toBe(REDIRECTING_OWNER_URL)
    expect(resolved.canonicalUrl).toBe(REDIRECTING_OWNER_URL)
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
    expect(resolved.canonicalUrl).toBe(STRIKE_SEED_CANONICAL)
    expect(isBroadNetNewCreate(resolved)).toBe(false)
  })
})

describe('broad-create freeze · ownerUrlHint is not authority by itself', () => {
  it('freezes a fabricated ownerUrlHint that matches no registry row', async () => {
    const resolved = await resolveOwner({
      primaryKeyword: UNMATCHED_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
      ownerUrlHint: 'https://legal.yousafeconsultancy.com/uk/graduate-visa-requirements/',
    })
    // Syntactically valid YouSafe hint, and the resolver labels it
    // registry_owner_url — but no registry owner exists, so it is not authority.
    expect(resolved.matched).toBeNull()
    expect(resolved.routingSource).toBe('registry_owner_url')
    expect(resolved.canonicalUrl).toBe(
      'https://legal.yousafeconsultancy.com/uk/graduate-visa-requirements/',
    )
    expect(isBroadNetNewCreate(resolved)).toBe(true)
    expect(() => assertBroadCreateAllowed(resolved, { env: {} })).toThrow(/broad net-new CREATE/i)
    expect(() =>
      assertBroadCreateAllowed(resolved, { env: { [BROAD_CREATE_UNLOCK_ENV]: '1' } }),
    ).not.toThrow()
  })

  it('freezes an ownerUrlHint that differs from the matched registry owner', async () => {
    const resolved = await resolveOwner({
      primaryKeyword: REGISTRY_KEYWORD,
      contentType: 'legal_guide',
      region: REGISTRY_REGION,
      ownerUrlHint:
        'https://legal.yousafeconsultancy.com/us/student-visas/f1-document-checklist-alternate/',
    })
    expect(resolved.matched?.owner_url).toBe(REGISTRY_OWNER_URL)
    expect(resolved.routingSource).toBe('registry_owner_url')
    expect(resolved.canonicalUrl).not.toBe(REGISTRY_OWNER_URL)
    expect(isBroadNetNewCreate(resolved)).toBe(true)
    expect(() => assertBroadCreateAllowed(resolved, { env: {} })).toThrow(/broad net-new CREATE/i)
    expect(() =>
      assertBroadCreateAllowed(resolved, { env: { [BROAD_CREATE_UNLOCK_ENV]: 'true' } }),
    ).not.toThrow()
  })

  it('still allows an ownerUrlHint that equals the matched registry owner (trailing slash harmless)', async () => {
    const resolved = await resolveOwner({
      primaryKeyword: REGISTRY_KEYWORD,
      contentType: 'legal_guide',
      region: REGISTRY_REGION,
      ownerUrlHint: REGISTRY_OWNER_URL.replace(/\/$/, ''),
    })
    expect(resolved.matched?.owner_url).toBe(REGISTRY_OWNER_URL)
    expect(resolved.canonicalUrl).toBe(REGISTRY_OWNER_URL)
    expect(resolved.routingSource).toBe('registry_owner_url')
    expect(isBroadNetNewCreate(resolved)).toBe(false)
    expect(() => assertBroadCreateAllowed(resolved, { env: {} })).not.toThrow()
  })

  it('freezes a strike-seed plan whose final canonical was swapped for another URL', async () => {
    const seed = await resolveOwner({
      primaryKeyword: STRIKE_SEED_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(seed.routingSource).toBe('strike_seed')
    expect(isBroadNetNewCreate(seed)).toBe(false)

    const swapped = {
      ...seed,
      canonicalUrl: 'https://legal.yousafeconsultancy.com/guide/some-other-page/',
    }
    expect(isBroadNetNewCreate(swapped)).toBe(true)
    expect(() => assertBroadCreateAllowed(swapped, { env: {} })).toThrow(/broad net-new CREATE/i)
    expect(() =>
      assertBroadCreateAllowed(swapped, { env: { [BROAD_CREATE_UNLOCK_ENV]: '1' } }),
    ).not.toThrow()
  })
})

describe('broad-create freeze · matched legal pillar routed to a net-new destination', () => {
  // `resolveOwner` can match a legal registry pillar yet deliberately keep an
  // explicit non-legal destination on its own net-new URL (stealLegalPillar).
  // `matched` then describes the keyword match, not the final destination's
  // existence — the freeze must classify the destination and stay closed.
  const STOLEN_PILLAR_TYPES = [
    'blog_summary',
    'regional_page',
    'regional_from',
    'regional_university',
  ] as const

  it.each(STOLEN_PILLAR_TYPES)(
    'freezes %s: matched legal pillar re-routed to a fresh standing-rules build',
    async (contentType) => {
      const resolved = await resolveOwner({
        primaryKeyword: REGISTRY_KEYWORD,
        contentType,
        region: 'UK',
      })
      // The keyword matched the legal registry pillar (action=expand)…
      expect(resolved.matched).not.toBeNull()
      // …but the final destination is a fresh standing-rules build, not that pillar.
      expect(resolved.action).toBe('build')
      expect(resolved.routingSource).toBe('standing_rules')
      // The gate must classify the final destination, so this is frozen even
      // though `matched` is non-null (the old shortcut wrongly allowed it).
      expect(isBroadNetNewCreate(resolved)).toBe(true)
      expect(() => assertBroadCreateAllowed(resolved, { env: {} })).toThrow(/broad net-new CREATE/i)
    },
  )
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

  it('reports an off-mission strike seed as non-actionable demand, not malformed junk', async () => {
    await expect(
      runSeoFactoryPipeline({
        topic: 'university of the pacific student housing',
        primaryKeyword: 'university of the pacific student housing',
        contentType: 'legal_guide',
        region: 'US',
        shipMode: 'none',
      }),
    ).rejects.toThrow(/Rejected off-mission keyword/i)
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

  it('emits an explicit off-mission reason for the historical Pacific housing seed', async () => {
    const events: PipelineStreamEvent[] = []
    for await (const event of runSeoFactoryPipelineStream({
      topic: 'university of the pacific student housing',
      primaryKeyword: 'university of the pacific student housing',
      contentType: 'legal_guide',
      region: 'US',
      shipMode: 'none',
    })) events.push(event)
    expect(events.filter((e) => e.type === 'error')).toEqual([
      expect.objectContaining({ type: 'error', error: expect.stringMatching(/Rejected off-mission keyword/i) }),
    ])
    expect(events.some((e) => e.type === 'job' || e.type === 'delta' || e.type === 'final')).toBe(false)
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

/**
 * Static authority is NECESSARY but NOT SUFFICIENT. Live read-only evidence
 * across the 76 registry owner URLs found 10 redirects to different URLs and
 * one 404 — including `confirmed/keep` rows. The authoring gate must therefore
 * await an exact live existence proof (HEAD with redirect:follow, GET retry on
 * 403/405/501, final 2xx, normalized final URL equal to the intended
 * canonical) before any drafting row or AI generation. Fetch is mocked here;
 * no real network request is ever made.
 */
describe('broad-create freeze · exact live existence proof at the authoring boundary', () => {
  const fetchMock = jest.fn()
  const originalFetch = global.fetch

  function resetFreezeLiveCache(): void {
    const mod = require('@/lib/seoFactory/broadCreateFreeze') as {
      resetBroadCreateLiveCache?: () => void
    }
    mod.resetBroadCreateLiveCache?.()
  }

  function mockLive(response: { status: number; url: string }) {
    fetchMock.mockResolvedValue({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      url: response.url,
    })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    ;(global as unknown as { fetch: unknown }).fetch = fetchMock
    resetFreezeLiveCache()
    delete process.env[BROAD_CREATE_UNLOCK_ENV]
  })

  afterEach(() => {
    ;(global as unknown as { fetch: unknown }).fetch = originalFetch
    delete process.env[BROAD_CREATE_UNLOCK_ENV]
  })

  async function exactLiveRegistryPlan() {
    const resolved = await resolveOwner({
      primaryKeyword: REGISTRY_KEYWORD,
      contentType: 'legal_guide',
      region: REGISTRY_REGION,
    })
    expect(resolved.routingSource).toBe('registry_owner_url')
    expect(resolved.canonicalUrl).toBe(REGISTRY_OWNER_URL)
    expect(isBroadNetNewCreate(resolved)).toBe(false)
    return resolved
  }

  it('refuses a statically-authorized registry owner whose live URL redirects elsewhere (non-stream)', async () => {
    await exactLiveRegistryPlan()
    mockLive({ status: 200, url: REDIRECT_TARGET_URL })
    await expect(
      runSeoFactoryPipeline({
        topic: REGISTRY_KEYWORD,
        contentType: 'legal_guide',
        region: REGISTRY_REGION,
        shipMode: 'none',
      }),
    ).rejects.toThrow(/broad net-new CREATE/i)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('refuses a statically-authorized registry owner whose live URL is 404 (non-stream)', async () => {
    await exactLiveRegistryPlan()
    mockLive({ status: 404, url: REGISTRY_OWNER_URL })
    await expect(
      runSeoFactoryPipeline({
        topic: REGISTRY_KEYWORD,
        contentType: 'legal_guide',
        region: REGISTRY_REGION,
        shipMode: 'none',
      }),
    ).rejects.toThrow(/broad net-new CREATE/i)
  })

  it('refuses a statically-authorized registry owner whose live probe throws (non-stream)', async () => {
    await exactLiveRegistryPlan()
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED 203.0.113.7:443'))
    await expect(
      runSeoFactoryPipeline({
        topic: REGISTRY_KEYWORD,
        contentType: 'legal_guide',
        region: REGISTRY_REGION,
        shipMode: 'none',
      }),
    ).rejects.toThrow(/broad net-new CREATE/i)
  })

  it('permits a statically-authorized owner with an exact live 200 and reaches the downstream sentinel', async () => {
    await exactLiveRegistryPlan()
    mockLive({ status: 200, url: REGISTRY_OWNER_URL })
    await expect(
      runSeoFactoryPipeline({
        topic: REGISTRY_KEYWORD,
        contentType: 'legal_guide',
        region: REGISTRY_REGION,
        shipMode: 'none',
      }),
    ).rejects.toThrow('SENTINEL_DOWNSTREAM_BRIEF_REACHED')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('retries HEAD 405 as GET and permits an exact live 200', async () => {
    await exactLiveRegistryPlan()
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 405, url: REGISTRY_OWNER_URL })
      .mockResolvedValueOnce({ ok: true, status: 200, url: REGISTRY_OWNER_URL })
    await expect(
      runSeoFactoryPipeline({
        topic: REGISTRY_KEYWORD,
        contentType: 'legal_guide',
        region: REGISTRY_REGION,
        shipMode: 'none',
      }),
    ).rejects.toThrow('SENTINEL_DOWNSTREAM_BRIEF_REACHED')
    expect(fetchMock.mock.calls.map((call) => (call[1] as { method?: string } | undefined)?.method)).toEqual([
      'HEAD',
      'GET',
    ])
  })

  it('treats a harmless trailing-slash final URL as the same destination', async () => {
    await exactLiveRegistryPlan()
    mockLive({ status: 200, url: REGISTRY_OWNER_URL.replace(/\/$/, '') })
    await expect(
      runSeoFactoryPipeline({
        topic: REGISTRY_KEYWORD,
        contentType: 'legal_guide',
        region: REGISTRY_REGION,
        shipMode: 'none',
      }),
    ).rejects.toThrow('SENTINEL_DOWNSTREAM_BRIEF_REACHED')
  })

  it('stream: emits a terminal error and no drafting job when the live URL redirects', async () => {
    await exactLiveRegistryPlan()
    mockLive({ status: 200, url: REDIRECT_TARGET_URL })
    const events: PipelineStreamEvent[] = []
    for await (const event of runSeoFactoryPipelineStream({
      topic: REGISTRY_KEYWORD,
      contentType: 'legal_guide',
      region: REGISTRY_REGION,
      shipMode: 'none',
    })) {
      events.push(event)
    }
    const errors = events.filter((e) => e.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      type: 'error',
      error: expect.stringMatching(/broad net-new CREATE/i),
    })
    expect(events.some((e) => e.type === 'job')).toBe(false)
    expect(events.some((e) => e.type === 'delta')).toBe(false)
    expect(events.some((e) => e.type === 'final')).toBe(false)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('stream: emits a terminal error when the live URL is 404', async () => {
    await exactLiveRegistryPlan()
    mockLive({ status: 404, url: REGISTRY_OWNER_URL })
    const events: PipelineStreamEvent[] = []
    for await (const event of runSeoFactoryPipelineStream({
      topic: REGISTRY_KEYWORD,
      contentType: 'legal_guide',
      region: REGISTRY_REGION,
      shipMode: 'none',
    })) {
      events.push(event)
    }
    const errors = events.filter((e) => e.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      type: 'error',
      error: expect.stringMatching(/broad net-new CREATE/i),
    })
    expect(events.some((e) => e.type === 'job')).toBe(false)
  })

  it('stream: reaches the downstream sentinel on an exact live 200', async () => {
    await exactLiveRegistryPlan()
    mockLive({ status: 200, url: REGISTRY_OWNER_URL })
    const events: PipelineStreamEvent[] = []
    for await (const event of runSeoFactoryPipelineStream({
      topic: REGISTRY_KEYWORD,
      contentType: 'legal_guide',
      region: REGISTRY_REGION,
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
  })

  it('P13 unlock bypasses static and live proof and performs no fetch (non-stream + stream)', async () => {
    process.env[BROAD_CREATE_UNLOCK_ENV] = '1'
    await expect(
      runSeoFactoryPipeline({
        topic: UNMATCHED_KEYWORD,
        contentType: 'legal_guide',
        region: 'UK',
        shipMode: 'none',
      }),
    ).rejects.toThrow('SENTINEL_DOWNSTREAM_BRIEF_REACHED')
    const events: PipelineStreamEvent[] = []
    for await (const event of runSeoFactoryPipelineStream({
      topic: UNMATCHED_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
      shipMode: 'none',
    })) {
      events.push(event)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('static-untrusted fallback and fabricated ownerUrlHint fail before any fetch', async () => {
    await expect(
      runSeoFactoryPipeline({
        topic: UNMATCHED_KEYWORD,
        contentType: 'legal_guide',
        region: 'UK',
        shipMode: 'none',
      }),
    ).rejects.toThrow(/broad net-new CREATE/i)
    await expect(
      runSeoFactoryPipeline({
        topic: UNMATCHED_KEYWORD,
        contentType: 'legal_guide',
        region: 'UK',
        shipMode: 'none',
        cluster: {
          mode: 'expand',
          targetUrl: 'https://legal.yousafeconsultancy.com/uk/graduate-visa-requirements/',
        },
      }),
    ).rejects.toThrow(/broad net-new CREATE/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/**
 * Unit-level contract for the injectable exact-live checker. Injected
 * `fetchImpl` only — no global fetch, no real network.
 */
describe('broad-create freeze · exact live checker contract (injected fetch)', () => {
  const checkUrl = 'https://legal.yousafeconsultancy.com/unit/live-proof-check/'

  function response(status: number, url: string): Response {
    return { ok: status >= 200 && status < 300, status, url } as unknown as Response
  }

  beforeEach(() => {
    resetBroadCreateLiveCache()
  })

  it('accepts an exact 200 whose normalized final URL equals the intended canonical', async () => {
    const fetchImpl = jest.fn(async (_url: string, _init?: RequestInit) =>
      response(200, checkUrl),
    )
    const verdict = await checkBroadCreateDestinationLive(checkUrl, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(verdict).toMatchObject({ ok: true, status: 200, reason: 'exact_live' })
    expect(verdict.finalUrl).toBe(checkUrl.replace(/\/$/, ''))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    // The probe targets the intended canonical exactly as resolved.
    expect(fetchImpl.mock.calls[0][0]).toBe(checkUrl)
    expect((fetchImpl.mock.calls[0] as unknown[])[1]).toMatchObject({
      method: 'HEAD',
      redirect: 'follow',
    })
  })

  it('treats a harmless trailing slash as the same destination', async () => {
    const fetchImpl = jest.fn(async () => response(200, checkUrl.replace(/\/$/, '')))
    const verdict = await checkBroadCreateDestinationLive(checkUrl, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(verdict.ok).toBe(true)
  })

  it('fails closed when the final URL is a different destination (redirect)', async () => {
    const fetchImpl = jest.fn(async () => response(200, `${checkUrl}elsewhere/`))
    const verdict = await checkBroadCreateDestinationLive(checkUrl, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('redirect_mismatch')
    expect(verdict.finalUrl).toContain('/elsewhere')
  })

  it.each([404, 410, 500])('fails closed on HTTP %s', async (status) => {
    const fetchImpl = jest.fn(async () => response(status, checkUrl))
    const verdict = await checkBroadCreateDestinationLive(checkUrl, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('http_not_2xx')
    expect(verdict.status).toBe(status)
  })

  it('fails closed on a network error/timeout', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('The operation was aborted due to timeout')
    })
    const verdict = await checkBroadCreateDestinationLive(checkUrl, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('network_error')
    expect(verdict.status).toBe(0)
  })

  it('fails closed when the response URL is unusable', async () => {
    const fetchImpl = jest.fn(async () => response(200, ''))
    const verdict = await checkBroadCreateDestinationLive(checkUrl, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('invalid_final_url')
  })

  it.each([403, 405, 501])('retries HEAD %s as GET and accepts the exact 200', async (headStatus) => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(headStatus, checkUrl))
      .mockResolvedValueOnce(response(200, checkUrl))
    const verdict = await checkBroadCreateDestinationLive(checkUrl, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(verdict.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const methods = fetchImpl.mock.calls.map(
      (call) => (call[1] as { method?: string } | undefined)?.method,
    )
    expect(methods).toEqual(['HEAD', 'GET'])
  })

  it('never probes an unparseable/blank intended URL', async () => {
    const fetchImpl = jest.fn()
    const blank = await checkBroadCreateDestinationLive('', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const garbage = await checkBroadCreateDestinationLive('not a url', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(blank.reason).toBe('invalid_destination')
    expect(garbage.reason).toBe('invalid_destination')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('caches completed verdicts and does not cache transient network failures', async () => {
    const okFetch = jest.fn(async () => response(200, checkUrl))
    await checkBroadCreateDestinationLive(checkUrl, { fetchImpl: okFetch as unknown as typeof fetch })
    await checkBroadCreateDestinationLive(checkUrl, { fetchImpl: okFetch as unknown as typeof fetch })
    expect(okFetch).toHaveBeenCalledTimes(1)

    resetBroadCreateLiveCache()
    const downFetch = jest.fn(async () => {
      throw new Error('offline')
    })
    await checkBroadCreateDestinationLive(checkUrl, { fetchImpl: downFetch as unknown as typeof fetch })
    await checkBroadCreateDestinationLive(checkUrl, { fetchImpl: downFetch as unknown as typeof fetch })
    expect(downFetch).toHaveBeenCalledTimes(2)
  })

  it('static-untrusted plan fails before the injected fetch is ever called', async () => {
    const fetchImpl = jest.fn()
    await expect(
      assertBroadCreateDestinationAllowed(plan({ routingSource: 'standing_rules' }), {
        env: {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/broad net-new CREATE/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('P13 unlock bypasses static and live proof without calling the injected fetch', async () => {
    const fetchImpl = jest.fn()
    await expect(
      assertBroadCreateDestinationAllowed(plan({ routingSource: 'standing_rules' }), {
        env: { [BROAD_CREATE_UNLOCK_ENV]: '1' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('publication assertion requires the live proof after static authority passes', async () => {
    const fetchImpl = jest.fn(async () => response(200, REGISTRY_OWNER_URL))
    const authority = plan({
      matched: { id: 3, owner_url: REGISTRY_OWNER_URL } as OwnerPlan['matched'],
      routingSource: 'registry_owner_url',
      canonicalUrl: REGISTRY_OWNER_URL,
    })
    await expect(
      assertPublicationDestinationAllowed(authority, REGISTRY_OWNER_URL, {
        env: {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    resetBroadCreateLiveCache()
    const redirecting = jest.fn(async () => response(200, REDIRECT_TARGET_URL))
    await expect(
      assertPublicationDestinationAllowed(authority, REGISTRY_OWNER_URL, {
        env: {},
        fetchImpl: redirecting as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/broad net-new CREATE/i)
  })
})

describe('broad-create freeze · call sites are wired before authoring', () => {
  const root = process.cwd()
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

  it('non-stream gate runs after resolveOwner and before any job persistence', () => {
    const src = read('lib/seoFactory/pipeline.ts')
    const resolveAt = src.indexOf('const plan = await resolveOwner(')
    const gateAt = src.indexOf('await assertBroadCreateDestinationAllowed(plan')
    const persistAt = src.indexOf('persistPipelineJob(')
    expect(resolveAt).toBeGreaterThan(-1)
    expect(gateAt).toBeGreaterThan(resolveAt)
    expect(persistAt).toBeGreaterThan(gateAt)
  })

  it('stream gate runs after resolveOwner and before the early drafting row', () => {
    const src = read('lib/seoFactory/pipelineStream.ts')
    const resolveAt = src.indexOf('const plan = await resolveOwner(')
    const gateAt = src.indexOf('await assertBroadCreateDestinationAllowed(plan')
    const draftingRowAt = src.indexOf("status: 'drafting'")
    expect(resolveAt).toBeGreaterThan(-1)
    expect(gateAt).toBeGreaterThan(resolveAt)
    expect(draftingRowAt).toBeGreaterThan(gateAt)
  })
})
