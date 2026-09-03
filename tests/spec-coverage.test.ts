import { SIGNAL_COUNT, SIGNAL_REGISTRY } from '@/lib/seoFactory/masterEngine'
import { reportSpecCoverage, SPEC_GROUPS, SPEC_POINT_COUNT } from '@/lib/seoEngine/specCoverage'

describe('Master Engine vs 838-point spec', () => {
  it('registry length matches SIGNAL_COUNT and is far below the spec', () => {
    expect(SIGNAL_REGISTRY.length).toBe(SIGNAL_COUNT)
    expect(SIGNAL_COUNT).toBeGreaterThan(150)
    expect(SIGNAL_COUNT).toBeLessThan(SPEC_POINT_COUNT)
  })

  it('reports dark slots separately from computed-capable signals', () => {
    const r = reportSpecCoverage()
    expect(r.specPoints).toBe(838)
    expect(r.registered).toBe(SIGNAL_COUNT)
    expect(r.computedCapable + r.darkSlots).toBe(r.registered)
    expect(r.computedCapable).toBeGreaterThan(100)
    // The 2026-09 dark-slot wave flipped 11 heuristic signals to computed:
    // they must no longer count as dark, and the remaining measurement slots
    // (volume, difficulty, CrUX field data, GBP, etc.) must stay honest.
    const lit = ['s_entity_kg_link', 's_embedding_similarity', 's_passage_relevance', 't_robots_txt', 'l_competitor_link_gap', 'e_brand_reputation', 'f_seasonal_alignment', 'f_trending_velocity', 'f_news_proximity', 'f_competitor_freshness', 'x_mobile_parity']
    for (const id of lit) {
      expect(SIGNAL_REGISTRY.find((s) => s.id === id)?.computed).toBe(true)
    }
    expect(r.darkSlots).toBeGreaterThan(40)
    expect(SPEC_GROUPS).toHaveLength(18)
    expect(r.hardenOrder.length).toBeGreaterThanOrEqual(4)
  })

  it('does not treat uncomputed registry rows as computed-capable', () => {
    const dark = SIGNAL_REGISTRY.filter((s) => !s.computed)
    expect(SIGNAL_REGISTRY.find((s) => s.id === 't_hreflang')?.computed).toBe(true)
    expect(SIGNAL_REGISTRY.find((s) => s.id === 'g_featured_snippet')?.computed).toBe(true)
    expect(SIGNAL_REGISTRY.find((s) => s.id === 'x_core_vitals')?.computed).toBe(true)
    expect(dark.some((s) => s.id === 'e_gbp_profile')).toBe(true)
    expect(dark.some((s) => s.id === 'intent_monthly_volume')).toBe(true)
  })
})
