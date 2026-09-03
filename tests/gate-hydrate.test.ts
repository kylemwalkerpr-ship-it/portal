import { hydrateGateFromJobScores } from '@/lib/seoEngine/gate'

describe('hydrateGateFromJobScores', () => {
  it('prefers seo_gate_runs when any exist', () => {
    expect(hydrateGateFromJobScores({
      gateRuns: 4, gatePassed: 3, jobScored: 40, jobPassed: 10,
    })).toEqual({ runs: 4, passed: 3, passRate: 75, source: 'seo_gate_runs' })
  })

  it('falls back to scored content_jobs so the desk is not stuck at 0 runs · 0%', () => {
    expect(hydrateGateFromJobScores({
      gateRuns: 0, gatePassed: 0, jobScored: 20, jobPassed: 5,
    })).toEqual({ runs: 20, passed: 5, passRate: 25, source: 'content_jobs' })
  })

  it('stays at zero only when neither table has audits', () => {
    expect(hydrateGateFromJobScores({
      gateRuns: 0, gatePassed: 0, jobScored: 0, jobPassed: 0,
    })).toEqual({ runs: 0, passed: 0, passRate: 0, source: 'seo_gate_runs' })
  })
})
