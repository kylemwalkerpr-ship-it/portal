/**
 * Hermetic regression for the P0 SEO parity finding: `registry_host` is NOT an
 * authoritative existing destination.
 *
 * `resolveOwner` emits `registry_host` only when a matched registry row's
 * `owner_url` cannot be parsed and `pathForHostFallback` invents a path. A row
 * with an empty `owner_url` (which the runtime registry sync lets through) thus
 * yields a fabricated canonical URL — yet an action label such as `expand`
 * used to smuggle it past the broad-CREATE freeze.
 *
 * The ownership registry loader is mocked with one synthetic empty-owner-url
 * row, so the proof is deterministic and network-free: no Supabase, no fetch,
 * no AI. Routing itself is untouched — this only pins the freeze boundary.
 */
import { resolveOwner } from '@/lib/seoFactory/ownership'
import {
  BROAD_CREATE_UNLOCK_ENV,
  assertBroadCreateAllowed,
  isBroadNetNewCreate,
} from '@/lib/seoFactory/broadCreateFreeze'

jest.mock('@/lib/seoDataLoaders', () => ({
  loadOwnershipRegistry: jest.fn(),
}))

const loadOwnershipRegistry = (
  jest.requireMock('@/lib/seoDataLoaders') as { loadOwnershipRegistry: jest.Mock }
).loadOwnershipRegistry

const KEYWORD = 'synthetic registry host fallback'
const INVENTED_CANONICAL = 'https://legal.yousafeconsultancy.com/uk/synthetic-registry-host-fallback/'

/** The runtime registry sync allows empty owner_url rows through unchanged. */
const registryRow = (action: string) => ({
  id: 9001,
  primary_keyword: KEYWORD,
  intent_class: 'procedural',
  owner_host: 'legal',
  owner_url: '',
  supporting_urls: [],
  action,
  market_destination: null,
  status: 'confirmed',
  notes: 'hermetic fixture: unusable owner_url exercises pathForHostFallback',
})

describe('broad-create freeze · registry_host is an invented fallback, not an existing owner', () => {
  it.each(['build', 'expand', 'keep'] as const)(
    'resolveOwner invents a canonical and the gate freezes it for action=%s',
    async (action) => {
      loadOwnershipRegistry.mockResolvedValue({ rows: [registryRow(action)] })

      const resolved = await resolveOwner({
        primaryKeyword: KEYWORD,
        contentType: 'legal_guide',
        region: 'UK',
      })

      // The keyword matches the row, but the owner URL is unusable…
      expect(resolved.matched).not.toBeNull()
      expect(resolved.matched?.owner_url).toBe('')
      expect(resolved.action).toBe(action)
      // …so routing is a fabricated host fallback, not a proven destination.
      expect(resolved.routingSource).toBe('registry_host')
      expect(resolved.canonicalUrl).toBe(INVENTED_CANONICAL)
      expect(resolved.filePath).toBe('app/uk/synthetic-registry-host-fallback/page.tsx')

      // Fail closed at the authoring boundary regardless of the action label.
      expect(isBroadNetNewCreate(resolved)).toBe(true)
      expect(() => assertBroadCreateAllowed(resolved, { env: {} })).toThrow(/broad net-new CREATE/i)
      // The explicit P13 unlock remains the only bypass.
      expect(() =>
        assertBroadCreateAllowed(resolved, { env: { [BROAD_CREATE_UNLOCK_ENV]: '1' } }),
      ).not.toThrow()
    },
  )
})
