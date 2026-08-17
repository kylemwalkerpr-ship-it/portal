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
    expect(r.darkSlots).toBeGreaterThan(50)
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
