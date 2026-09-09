import {
  DRAFT_RENDERER_SAFE_CHARS,
  inspectDraftIntegrity,
  recoverDraftContent,
} from '@/lib/seoFactory/draftIntegrity'

function article(): string {
  return `# Student visa guide

## In 60 seconds

${Array.from({ length: 70 }, (_, i) => `Sentence ${i + 1} explains a practical requirement clearly for the reader.`).join(' ')}

## Eligibility

Applicants should verify current official requirements before they apply.`
}

describe('draftIntegrity', () => {
  it('recovers a real article hidden beside a giant invalid schema payload', () => {
    const good = article()
    const badSchema = `<script type="application/ld+json">${'x'.repeat(DRAFT_RENDERER_SAFE_CHARS + 5_000)}</script>`
    const raw = `${good}\n\n${badSchema}`
    const result = inspectDraftIntegrity(raw)

    expect(raw.length).toBeGreaterThan(DRAFT_RENDERER_SAFE_CHARS)
    expect(result.recovered).toBe(true)
    expect(result.rendererSafe).toBe(true)
    expect(result.bodyWords).toBeGreaterThanOrEqual(40)
    expect(result.content).toContain('# Student visa guide')
    expect(result.content).not.toContain('application/ld+json')
    expect(recoverDraftContent(raw)).toBe(result.content)
  })

  it('quarantines a huge payload that is still not reader-facing prose after normalization', () => {
    const raw = `<script type="application/ld+json">${'x'.repeat(DRAFT_RENDERER_SAFE_CHARS + 5_000)}</script>`
    const result = inspectDraftIntegrity(raw)

    expect(result.pathological).toBe(true)
    expect(result.recovered).toBe(false)
    expect(result.bodyWords).toBeLessThan(40)
    expect(recoverDraftContent(raw)).toBe(raw)
  })

  it('does not reject an ordinary short work-in-progress draft', () => {
    const raw = '# Draft\n\nA short paragraph is still being written.'
    const result = inspectDraftIntegrity(raw)
    expect(result.pathological).toBe(false)
    expect(result.hardOversize).toBe(false)
  })
})
