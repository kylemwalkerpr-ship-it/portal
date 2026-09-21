/**
 * P6 final release-gate repair - M2: admin verify UI must not say only
 * "Verified" when interlink finalization was withheld.
 *
 * `POST /api/content-studio/verify-published` returns
 * `interlinksWithheld: 'deployment_lineage_not_proven'` when the ARTICLE
 * verification succeeded (stamp status 'verified') but the supplied exact job
 * id had no positive official deployment-lineage proof, so the staged
 * `seo_interlinks` rows intentionally stay planned. A bare "Verified" would
 * imply the interlinks were finalized.
 *
 * Contract pinned here:
 *   - the shared message helper keeps the article-level success and states the
 *     withheld interlink state explicitly (and is idempotent);
 *   - without a withheld state the stamp message is never rewritten;
 *   - the API stamp message is shaped by that helper;
 *   - the admin UI types `interlinksWithheld` and renders the helper's message
 *     (article stage stays ok - it does NOT imply interlinks finalized).
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  INTERLINKS_PENDING_DEPLOYMENT_LINEAGE,
  INTERLINKS_WITHHELD_LINEAGE_REASON,
  verifyStampMessage,
} from '@/lib/seoFactory/verifyStampMessage'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('A) verifyStampMessage: article success is kept, withheld interlinks are visible', () => {
  it('qualifies a successful withheld verification instead of a bare Verified', () => {
    const message = verifyStampMessage({
      stampMessage: 'Verified · HTTP 200 · 812w · score 88/100',
      interlinksWithheld: INTERLINKS_WITHHELD_LINEAGE_REASON,
    })

    expect(message).toContain('Article verified')
    expect(message).toContain(INTERLINKS_PENDING_DEPLOYMENT_LINEAGE)
    expect(message).toContain('HTTP 200')
    expect(message).not.toBe('Verified')
  })

  it('never rewrites the message when nothing was withheld', () => {
    expect(
      verifyStampMessage({ stampMessage: 'Verified · HTTP 200 · 812w · score 88/100' }),
    ).toBe('Verified · HTTP 200 · 812w · score 88/100')
    expect(
      verifyStampMessage({
        stampMessage: 'Verified · HTTP 200 · 812w · score 88/100',
        interlinksWithheld: null,
      }),
    ).toBe('Verified · HTTP 200 · 812w · score 88/100')
    expect(verifyStampMessage({})).toBe('Verified')
  })

  it('is idempotent and never claims the interlinks were finalized', () => {
    const once = verifyStampMessage({
      stampMessage: 'Verified · HTTP 200',
      interlinksWithheld: INTERLINKS_WITHHELD_LINEAGE_REASON,
    })
    const twice = verifyStampMessage({
      stampMessage: once,
      interlinksWithheld: INTERLINKS_WITHHELD_LINEAGE_REASON,
    })

    expect(twice).toBe(once)
    expect(twice.toLowerCase()).not.toMatch(/interlinks (finalized|applied|verified)/)
  })
})

describe('B) the API stamp and the admin UI both carry the withheld state', () => {
  it('the verify-published route shapes the stamp message with the shared helper', () => {
    const route = read('app/api/content-studio/verify-published/route.ts')
    expect(route).toContain("from '@/lib/seoFactory/verifyStampMessage'")
    expect(route).toMatch(
      /interlinksWithheld[\s\S]{0,400}?stamp\.message = verifyStampMessage\(\{ stampMessage: stamp\.message, interlinksWithheld \}\)/,
    )
    expect(route).toContain("'deployment_lineage_not_proven'")
  })

  it('the admin runVerify types the withheld reason and renders the truthful message', () => {
    const ui = read('components/design/admin-content-studio.tsx')
    expect(ui).toContain("from '@/lib/seoFactory/verifyStampMessage'")
    const start = ui.indexOf('const runVerify = React.useCallback(')
    expect(start).toBeGreaterThanOrEqual(0)
    const block = ui.slice(start, start + 3000)
    // Response typing carries the additive withheld reason.
    expect(block).toMatch(/interlinksWithheld\?: string \| null/)
    // The message is the helper output, not a bare stamp fallback.
    expect(block).toMatch(/const message = verifyStampMessage\(\{[\s\S]{0,200}?interlinksWithheld: data\.interlinksWithheld/)
    // A successful article verification still lands on the ok stage with the
    // helper message (never a bare 'Verified' fallback).
    expect(block).toMatch(/\[jobId\]: \{\s*stage: 'ok',\s*message,/)
    expect(block).not.toMatch(/setActionNotice\?\.\(data\.stamp\?\.message \|\| 'Verified'\)/)
  })
})
