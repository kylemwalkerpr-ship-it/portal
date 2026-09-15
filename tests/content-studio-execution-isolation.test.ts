import {
  assertIsolatedAuthoringAllowed,
  createContentStudioExecutionState,
  markCoherentDeskRunning,
  runInContentStudioExecution,
} from '@/lib/seoFactory/contentStudioExecutionContext'

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
})
