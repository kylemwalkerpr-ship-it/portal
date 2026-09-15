import {
  assertIsolatedAuthoringAllowed,
  createContentStudioExecutionState,
  markCoherentDeskRunning,
  runInContentStudioExecution,
} from '@/lib/seoFactory/contentStudioExecutionContext'

describe('Content Studio strict execution isolation', () => {
  it('does not let one concurrent job authorize another job', async () => {
    const a = createContentStudioExecutionState(true, { contractId:'wc_a', contractHash:'ha', opportunityId:'oa' })
    const b = createContentStudioExecutionState(true, { contractId:'wc_b', contractHash:'hb', opportunityId:'ob' })
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
    const state = createContentStudioExecutionState(true, { contractId:'wc_timer', contractHash:'h', opportunityId:'o' })
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
    await expect(delayed).resolves.toMatch(/execution window closed/i)
  })

  it('does not let a delayed callback from job A borrow an active job B lease', async () => {
    const a = createContentStudioExecutionState(true, { contractId:'wc_a2', contractHash:'ha2', opportunityId:'oa2' })
    const b = createContentStudioExecutionState(true, { contractId:'wc_b2', contractHash:'hb2', opportunityId:'ob2' })
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
    await expect(delayed).resolves.toMatch(/execution window closed/i)
  })
})
