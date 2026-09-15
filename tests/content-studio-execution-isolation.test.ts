import {
  assertIsolatedAuthoringAllowed,
  createContentStudioExecutionState,
  markCoherentDeskRunning,
  runInContentStudioExecution,
} from '@/lib/seoFactory/contentStudioExecutionContext'
import { assemblyFromPipelineInput } from '@/lib/seoFactory/linearDesk'

function strictState(name: string) {
  return createContentStudioExecutionState(true, {
    contractId:`wc_${name}`,
    contractHash:`h_${name}`,
    opportunityId:`o_${name}`,
    executionJobId:`00000000-0000-0000-0000-${name.padEnd(12, '0').slice(0,12)}`,
    executionOwner:`owner_${name}`,
    executionAttempt:1,
    executionLeaseExpiresAt:new Date(Date.now() + 60_000).toISOString(),
  })
}

describe('Content Studio strict execution isolation', () => {
  it('does not let one concurrent job authorize another job', async () => {
    const a = strictState('a')
    const b = strictState('b')
    let releaseA!: () => void
    const holdA = new Promise<void>((resolve) => { releaseA = resolve })
    let aReady!: () => void
    const ready = new Promise<void>((resolve) => { aReady = resolve })

    const jobA = runInContentStudioExecution(a, async () => {
      markCoherentDeskRunning()
      expect(() => assertIsolatedAuthoringAllowed()).not.toThrow()
      aReady()
      await holdA
    })
    await ready

    await runInContentStudioExecution(b, async () => {
      expect(() => assertIsolatedAuthoringAllowed()).toThrow(/before the validated writing stage starts/i)
    })
    releaseA()
    await jobA
  })

  it('closes inherited timer permission after the execution window returns', async () => {
    const state = strictState('timer')
    let delayed!: Promise<string>
    await runInContentStudioExecution(state, async () => {
      markCoherentDeskRunning()
      delayed = new Promise((resolve) => {
        setTimeout(() => {
          try {
            assertIsolatedAuthoringAllowed()
            resolve('allowed')
          } catch (error) {
            resolve(error instanceof Error ? error.message : String(error))
          }
        }, 0)
      })
      expect(() => assertIsolatedAuthoringAllowed()).not.toThrow()
    })
    await expect(delayed).resolves.toMatch(/execution window (?:is )?closed/i)
  })

  it('does not let a delayed callback from job A borrow an active job B lease', async () => {
    const a = strictState('a2')
    const b = strictState('b2')
    let delayed!: Promise<string>
    await runInContentStudioExecution(a, async () => {
      markCoherentDeskRunning()
      delayed = new Promise((resolve) => setTimeout(() => {
        try { assertIsolatedAuthoringAllowed(); resolve('allowed') }
        catch (error) { resolve(error instanceof Error ? error.message : String(error)) }
      }, 5))
    })
    await runInContentStudioExecution(b, async () => {
      markCoherentDeskRunning()
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(() => assertIsolatedAuthoringAllowed()).not.toThrow()
    })
    await expect(delayed).resolves.toMatch(/execution window (?:is )?closed/i)
  })

  it('injects immutable contract keyword provenance into strict Linear Desk assembly', async () => {
    const state = createContentStudioExecutionState(true, {
      contractId:'wc_provenance',
      contractHash:'h_provenance',
      opportunityId:'o_provenance',
      executionJobId:'00000000-0000-0000-0000-provenance00',
      executionOwner:'owner_provenance',
      executionAttempt:4,
      executionLeaseExpiresAt:new Date(Date.now() + 60_000).toISOString(),
      contractQueryCoverage: {
        requiredShortKeywords:['opt timing','filing window'],
        requiredLongTailKeywords:['when should f-1 students file for opt'],
        shortKeywordTerms:[
          { term:'opt timing', source:'demand' },
          { term:'filing window', source:'synthesized' },
        ],
        longTailKeywordTerms:[
          { term:'when should f-1 students file for opt', source:'demand' },
        ],
      },
    })

    await runInContentStudioExecution(state, async () => {
      const assembly = assemblyFromPipelineInput({
        primaryKeyword:'f-1 opt timing',
        contentType:'legal_guide',
        requiredShortKeywords:['mutable request keyword'],
        requiredLongTailKeywords:[],
        shortKeywordTerms:[{ term:'mutable request keyword', source:'demand' }],
        longTailKeywordTerms:[],
      })
      expect(assembly.requiredShortKeywords).toEqual(['opt timing','filing window'])
      expect(assembly.requiredLongTailKeywords).toEqual(['when should f-1 students file for opt'])
      expect(assembly.shortKeywordTerms).toEqual([
        { term:'opt timing', source:'demand' },
        { term:'filing window', source:'synthesized' },
      ])
      expect(assembly.longTailKeywordTerms).toEqual([
        { term:'when should f-1 students file for opt', source:'demand' },
      ])
    })
  })
})
