import { describe, expect, it } from '@jest/globals'
import { superGrokOperationalState } from '@/lib/xaiSuperGrokOAuth'

describe('SuperGrok configurator health state', () => {
  it('does not call a stored OAuth session operational before inference is probed', () => {
    expect(superGrokOperationalState({ connected: true, probeOk: null })).toBe('connected-unverified')
  })

  it('reports healthy only after a successful live inference probe', () => {
    expect(superGrokOperationalState({ connected: true, probeOk: true })).toBe('healthy')
  })

  it('reports degraded when OAuth exists but inference fails', () => {
    expect(superGrokOperationalState({ connected: true, probeOk: false })).toBe('degraded')
  })
})
