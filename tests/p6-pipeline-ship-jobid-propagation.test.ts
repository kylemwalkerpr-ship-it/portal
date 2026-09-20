/**
 * P6 final repair — PIPELINE JOB ID PROPAGATION.
 *
 * Reviewer medium: both pipeline ship surfaces called `shipContent` WITHOUT a
 * jobId, so staging/verification could never be bound to the real
 * `content_jobs.id` and the scheduled reconciler could never prove the
 * deployment lineage for the exact job.
 *
 * Contract pinned here:
 *   · pipelineStream passes the EXACT `earlyJobId` (the content_jobs.id it
 *     created/claimed for this run) into `shipContent`;
 *   · pipeline (non-stream) passes the EXACT `input.existingJobId` when one
 *     exists and invents nothing when it does not (its own job row is
 *     persisted AFTER ship, so a `plan-*` id must never be sent);
 *   · ship.ts binds both stage + background verification to `opts.jobId`.
 */
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

/** The span from `marker` to the next `closing` occurrence (the call's end). */
function callBlock(source: string, marker: string, closing: string): string {
  const start = source.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(closing, start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('A) pipelineStream — the exact early content_jobs.id reaches shipContent', () => {
  const source = () => read('lib/seoFactory/pipelineStream.ts')

  it('passes the exact earlyJobId into the ship call', () => {
    const call = callBlock(source(), 'shipResult = await shipContent({', '\n        })')
    const codeOnly = call
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')

    expect(call).toMatch(/\.\.\.\(earlyJobId \? \{ jobId: earlyJobId \} : \{\}\)/)
    // A synthetic `plan-*` id must never become a ship job identity (the
    // contract comment above the spread mentions it, so comments are stripped).
    expect(codeOnly).not.toMatch(/plan-/)
    expect(codeOnly).not.toMatch(/input\.sourceJobId/)
  })

  it('the earlyJobId really is the persisted content_jobs row id', () => {
    const body = source()
    expect(body).toMatch(/earlyJobId = early\.data\.id/)
    expect(body).toMatch(/earlyJobId = retry\.data\.id/)
    expect(body).toMatch(/let earlyJobId: string \| null = String\(input\.existingJobId \|\| ''\)\.trim\(\) \|\| null/)
  })
})

describe('B) pipeline (non-stream) — only a real persisted job id is propagated', () => {
  const source = () => read('lib/seoFactory/pipeline.ts')

  it('passes the exact existingJobId and never a synthetic plan-* id', () => {
    const call = callBlock(source(), 'shipResult = await shipContent({', '\n    })')
    const codeOnly = call
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')

    expect(call).toMatch(/\.\.\.\(input\.existingJobId \? \{ jobId: input\.existingJobId \} : \{\}\)/)
    expect(codeOnly).not.toMatch(/plan-/)
    expect(codeOnly).not.toMatch(/input\.sourceJobId/)
  })

  it('keeps the synthetic plan-* id scoped to ContentSpec resolution only', () => {
    const body = source()
    // The only synthetic id in the module is the spec-resolution fallback, and
    // it is not the ship/job identity.
    const synthetic = body.match(/`plan-\$\{Date\.now\(\)\}`/g) || []
    expect(synthetic.length).toBe(1)
    expect(body).toMatch(/jobId: input\.existingJobId \|\| input\.sourceJobId \|\| `plan-\$\{Date\.now\(\)\}`/)
  })
})

describe('C) ship.ts binds staging + verification to the exact opts.jobId', () => {
  it('both success paths pass opts.jobId into staging and background verification', () => {
    const body = read('lib/seoFactory/ship.ts')
    expect(body.match(/stageEngineInterlinksForVerification\(\{/g)?.length).toBe(2)
    expect(body.match(/jobId: opts\.jobId \|\| null/g)?.length).toBe(4)
    expect(body).toMatch(/verifyLiveInBackground\(\{[\s\S]{0,400}?jobId: opts\.jobId \|\| null/)
  })
})
