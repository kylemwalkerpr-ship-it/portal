jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(),
  createSupabaseServiceRoleClient: jest.fn(() => null),
}))

import { createSupabaseAdminClient, createSupabaseServiceRoleClient } from '@/lib/supabase'
import { enforceGate, loadGateRuns, recordJobQualityGate } from '@/lib/seoEngine/gate'

function queryClient(data: unknown[] = []) {
  const builder: Record<string, any> = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  }
  return { from: jest.fn(() => builder) }
}

describe('SEO gate service-role boundary', () => {
  beforeEach(() => {
    jest.mocked(createSupabaseServiceRoleClient).mockReturnValue(null)
    jest.mocked(createSupabaseAdminClient).mockClear()
  })

  it('keeps mandatory gate verdicts while denying persistence without service role', async () => {
    const verdict = await enforceGate(
      { subjectType: 'draft', stage: 'visa', country: 'US' },
      undefined,
      {},
      { ymyl_statutory: false, ymyl_disclaimer: false },
    )

    expect(verdict.mandatory).toEqual(expect.objectContaining({ applicable: true, met: false }))
    expect(verdict.recorded).toBe(false)
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('fails open for studio quality writes and gate history reads without service role', async () => {
    await expect(recordJobQualityGate({ score: 90, passed: true })).resolves.toBe(false)
    await expect(loadGateRuns()).resolves.toEqual({ runs: [], passRate: 0, avgScore: 0 })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('uses the service-role client for gate writes and history reads when available', async () => {
    const db = queryClient([{ id: 'run-1', score: 80, passed: true }])
    jest.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never)

    await expect(recordJobQualityGate({ score: 90, passed: true })).resolves.toBe(true)
    await expect(loadGateRuns()).resolves.toEqual({ runs: [{ id: 'run-1', score: 80, passed: true }], passRate: 100, avgScore: 80 })
    expect(db.from).toHaveBeenCalledWith('seo_gate_runs')
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })
})
