/**
 * P11 consumer-contract: the action-stream SSE route must present the
 * successful-provider-attempt citation denominator alongside legacy query
 * counts, so a 1/1 query result with 1/2 provider citations cannot read as
 * contradictory, and must persist those counters in recordEngineRun metadata.
 * No route-level harness exists, so this is a source-contract test.
 */
import fs from 'node:fs'
import path from 'node:path'

const routeSource = fs.readFileSync(
  path.join(process.cwd(), 'app/api/seo-engine/action-stream/route.ts'),
  'utf8',
)

describe('P11 action-stream provider-attempt denominator contract', () => {
  it('persists successful provider-attempt counters in recordEngineRun metadata', () => {
    const recordCall = routeSource.match(/await recordEngineRun\(\s*'manual'[\s\S]*?\)/)
    expect(recordCall).not.toBeNull()
    const block = recordCall![0]
    expect(block).toContain('successfulProviderAttempts: result.successfulProviderAttempts')
    expect(block).toContain('citedSuccessfulProviderAttempts: result.citedSuccessfulProviderAttempts')
    // Legacy query-level counts remain persisted alongside.
    expect(block).toContain('cited: result.cited')
    expect(block).toContain('total: result.total')
  })

  it('leads the done summary with the named provider-attempt denominator and keeps query counts as a separate clause', () => {
    expect(routeSource).toContain(
      '${result.citedSuccessfulProviderAttempts}/${result.successfulProviderAttempts} successful provider attempts cited the estate',
    )
    expect(routeSource).toContain(
      '${result.cited}/${result.total} measured queries cited',
    )
    // The single summary string feeds both the progress step and the done event.
    const emitCalls = routeSource.match(/emitStep\('done', summary,/g) || []
    const sendCalls = routeSource.match(/send\(\{ type: 'done', kind, summary,/g) || []
    expect(emitCalls.length).toBe(1)
    expect(sendCalls.length).toBe(1)
  })

  it('falls back to query-level phrasing when no provider attempt succeeded', () => {
    expect(routeSource).toContain(
      '${result.cited}/${result.total} measured queries cited the estate (${shareLabel})',
    )
  })
})
