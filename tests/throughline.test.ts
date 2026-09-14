import { readFileSync } from 'fs'
import path from 'path'
import { runThroughline, shouldRunThroughline, THROUGHLINE_SYSTEM } from '@/lib/seoFactory/throughline'

const DOC = `# Student visa documents checklist 2026

You confirm the live list on [USCIS](https://www.uscis.gov/) before you file Form I-20.

## Eligibility
You must hold a valid passport. Officers may refuse a stale bank window.

## Documents
Keep the I-20 with the passport.

## FAQ
### What should you prepare first?
The live form list.

## Sources
- [USCIS](https://www.uscis.gov/)

**Disclaimer:** This guide is educational only, not legal advice.
`

describe('shouldRunThroughline', () => {
  it('skips gigs, non-indexable, and thin bodies', () => {
    expect(shouldRunThroughline({ contentType: 'marketplace_gig', indexable: true, words: 2000 })).toBe(false)
    expect(shouldRunThroughline({ contentType: 'legal_guide', indexable: false, words: 2000 })).toBe(false)
    expect(shouldRunThroughline({ contentType: 'legal_guide', indexable: true, words: 400 })).toBe(false)
    expect(shouldRunThroughline({ contentType: 'legal_guide', indexable: true, words: 900 })).toBe(true)
  })

  it('runs on shorter bodies when outline splices force a throughline', () => {
    expect(shouldRunThroughline({ contentType: 'legal_guide', indexable: true, words: 400, force: true })).toBe(true)
    expect(shouldRunThroughline({ contentType: 'legal_guide', indexable: true, words: 120, force: true })).toBe(false)
    expect(shouldRunThroughline({ contentType: 'marketplace_gig', indexable: true, words: 900, force: true })).toBe(false)
  })
})

describe('runThroughline', () => {
  it('rejects when fact tokens shrink and keeps the original', async () => {
    const r = await runThroughline({
      content: DOC,
      thesis: 'The live list is the file.',
      contentType: 'legal_guide',
      generateText: async () => '# Hello\n\nNo facts remain.\n',
    })
    expect(r.applied).toBe(false)
    expect(r.rejected).toBe(true)
    expect(r.content).toBe(DOC)
    expect(r.reason).toMatch(/Fact tokens|thin|Disclaimer/i)
  })

  it('applies when facts, disclaimer, and URLs survive', async () => {
    const r = await runThroughline({
      content: DOC,
      thesis: 'The live list is the file.',
      contentType: 'legal_guide',
      generateText: async (system) => {
        expect(system).toBe(THROUGHLINE_SYSTEM)
        return DOC.replace('You confirm the live list', 'Start with the live list')
      },
    })
    expect(r.applied).toBe(true)
    expect(r.rejected).toBe(false)
    expect(r.content).toContain('https://www.uscis.gov/')
    expect(r.content).toContain('Form I-20')
    expect(r.content).toMatch(/not legal advice/)
  })
})

describe('pipeline wiring', () => {
  it('runs the desk hop after deterministic repair on both JSON and stream paths', () => {
    const json = readFileSync(path.join(process.cwd(), 'lib/seoFactory/pipeline.ts'), 'utf8')
    const stream = readFileSync(path.join(process.cwd(), 'lib/seoFactory/pipelineStream.ts'), 'utf8')
    expect(json).toContain('runFactoryThroughline')
    expect(stream).toContain('runFactoryThroughline')
    expect(json.lastIndexOf('runFactoryThroughline')).toBeGreaterThan(json.lastIndexOf('applyDeterministicRepairs'))
    expect(stream.lastIndexOf('runFactoryThroughline')).toBeGreaterThan(stream.lastIndexOf('applyDeterministicRepairs'))
  })
})

describe('revision publishing contract', () => {
  const paragraph = 'Keep your documents together and check the details before sending the application. '
  const article = (copies: number) => DOC.replace('Keep the I-20 with the passport.', 'Keep the I-20 with the passport. ' + paragraph.repeat(copies))

  it('keeps a compliant draft when the rewrite falls just below the brief minimum', async () => {
    const original = article(80)
    const result = await runThroughline({
      content: original, minWords: 1000, maxWords: 1500,
      generateText: async () => article(70),
    })
    expect(result.rejected).toBe(true)
    expect(result.content).toBe(original)
  })

  it('rejects expansion beyond the brief maximum', async () => {
    const original = article(80)
    const result = await runThroughline({
      content: original, minWords: 1000, maxWords: 1500,
      generateText: async () => article(140),
    })
    expect(result.rejected).toBe(true)
    expect(result.content).toBe(original)
  })

  it('gives the editor the actual body word window', async () => {
    let prompt = ''
    await runThroughline({
      content: article(80), minWords: 1000, maxWords: 1500,
      generateText: async (_system, value) => { prompt = value; return article(80) },
    })
    expect(JSON.parse(prompt).wordBudget).toEqual({ minWords: 1000, maxWords: 1500 })
  })

  it('rejects a changed outline even when the factual tokens survive', async () => {
    const result = await runThroughline({
      content: DOC,
      generateText: async () => DOC.replace('## Documents', '## Paperwork'),
    })
    expect(result.rejected).toBe(true)
    expect(result.content).toBe(DOC)
  })

  it('rejects an invented citation added alongside the original sources', async () => {
    const result = await runThroughline({
      content: DOC,
      generateText: async () => DOC + '\nRead [this guide](https://example.com/invented-guide).',
    })
    expect(result.rejected).toBe(true)
    expect(result.content).toBe(DOC)
  })
})

 it('retains the draft when the final publishing audit rejects the rewrite', async () => {
    const result = await runThroughline({
      content: DOC,
      generateText: async () => DOC.replace('Keep the I-20 with the passport.', 'Keep the I-20 beside your passport.'),
      validateRevision: () => ({ ok: false, reason: 'Lost required keyword coverage' }),
    })
    expect(result.applied).toBe(false)
    expect(result.content).toBe(DOC)
    expect(result.reason).toBe('Lost required keyword coverage')
  })
