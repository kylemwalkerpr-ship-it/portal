import { readFileSync } from 'fs'
import path from 'path'
import { evaluateProseGeometry } from '@/lib/seoFactory/proseGeometry'
import {
  applySpanReplacements,
  collectDenoiseSpans,
  DENOISE_SYSTEM,
  parseSpanReplacements,
  replacementAllowed,
  runMaskedDenoise,
  shouldRunMaskedDenoise,
} from '@/lib/seoFactory/maskedDenoise'

const PAD = Array.from({ length: 48 }, (_, i) => {
  const n = i + 1
  if (n % 3 === 0) return `Officers may refuse a stale bank letter at checkpoint ${n}. Check the live rule.`
  if (n % 3 === 1) return `Step ${n} starts on the live USCIS list so you file Form I-20 with a matching passport.`
  return `You confirm processing times on the official site before checkpoint ${n} locks a deadline.`
}).join(' ')

const MILL =
  'Applicants must confirm the current student visa documents rule on the official government site before they file the petition and they must gather identity evidence that matches those instructions without relying on a forum checklist from last year.'

function millDoc(): string {
  return `# Student visa documents checklist 2026

You confirm the live list on [USCIS](https://www.uscis.gov/) before you file Form I-20. ${PAD}

## Eligibility
${MILL}

You must hold a valid passport. Officers may refuse a stale window.

## Documents
${MILL}

Keep the I-20 with the passport.

## FAQ
### Eligibility
The live form list.

### How long does filing take?
Processing times change; check the agency site.

## Sources
- [USCIS](https://www.uscis.gov/)

**Disclaimer:** This guide is educational only, not legal advice.
`
}

describe('shouldRunMaskedDenoise', () => {
  it('skips gigs, non-indexable, and thin bodies', () => {
    expect(shouldRunMaskedDenoise({ contentType: 'marketplace_gig', indexable: true, words: 2000 })).toBe(false)
    expect(shouldRunMaskedDenoise({ contentType: 'legal_guide', indexable: false, words: 2000 })).toBe(false)
    expect(shouldRunMaskedDenoise({ contentType: 'legal_guide', indexable: true, words: 400 })).toBe(false)
    expect(shouldRunMaskedDenoise({ contentType: 'legal_guide', indexable: true, words: 900 })).toBe(true)
  })
})

describe('collectDenoiseSpans', () => {
  it('masks the later overlapping H2 body and the pasted FAQ question', () => {
    const doc = millDoc()
    const geometry = evaluateProseGeometry(doc, { contentType: 'legal_guide', indexable: true })
    const spans = collectDenoiseSpans(doc, geometry.findings)
    expect(spans.some((s) => s.code.includes('adjacent_section_overlap'))).toBe(true)
    expect(spans.some((s) => s.code.includes('faq_duplicates_h2'))).toBe(true)
    const later = spans.find((s) => s.code.includes('adjacent_section_overlap'))
    expect(later?.original).toContain(MILL)
    expect(later?.original).not.toMatch(/^##\s+Documents/m)
    const faq = spans.find((s) => s.code.includes('faq_duplicates_h2'))
    expect(faq?.original).toMatch(/^###\s+Eligibility/)
  })
})

describe('parse + splice', () => {
  it('replaces only marked spans and keeps the frozen remainder', () => {
    const doc = millDoc()
    const geometry = evaluateProseGeometry(doc, { contentType: 'legal_guide', indexable: true })
    const spans = collectDenoiseSpans(doc, geometry.findings)
    const faq = spans.find((s) => s.code.includes('faq_duplicates_h2'))
    expect(faq).toBeTruthy()
    const parsed = parseSpanReplacements(`
===SPAN_1===
### What belongs in the file besides the heading?
`)
    expect(parsed.get('SPAN_1')).toMatch(/What belongs/)
    const one = spans.filter((s) => s.id === faq!.id)
    const { content, applied } = applySpanReplacements(doc, one, new Map([[faq!.id, '### What belongs in the file besides the heading?']]))
    expect(applied).toBe(1)
    expect(content).toContain('https://www.uscis.gov/')
    expect(content).toContain('## Documents')
    expect(content).toContain('### What belongs in the file besides the heading?')
    expect(content).not.toMatch(/^### Eligibility$/m)
    expect(content).toContain(PAD.slice(0, 80))
  })

  it('rejects invented URLs and heading edits', () => {
    const span = {
      id: 'SPAN_1',
      code: 'adjacent_section_overlap_severe',
      t: 'high' as const,
      start: 0,
      end: 20,
      original: 'Keep Form I-20 with the passport. You must file.',
      instruction: 'x',
    }
    const whole = '# T\n\nKeep Form I-20 with the passport. You must file.\n\nhttps://www.uscis.gov/\n'
    expect(replacementAllowed(span, 'Keep Form I-20. See https://evil.example/i-20. You must file.', whole)).toBe(false)
    expect(replacementAllowed(span, '## New heading\n\nKeep Form I-20. You must file.', whole)).toBe(false)
    expect(replacementAllowed(span, 'Keep Form I-20 with the passport. You must file on the live list.', whole)).toBe(true)
  })
})

describe('runMaskedDenoise', () => {
  it('inpaints mill spans, freezes facts, and stops when geometry is clean enough', async () => {
    const doc = millDoc()
    const r = await runMaskedDenoise({
      content: doc,
      contentType: 'legal_guide',
      thesis: 'The live list is the file.',
      primaryKeyword: 'student visa documents',
      generateText: async (system, prompt) => {
        expect(system).toBe(DENOISE_SYSTEM)
        expect(prompt).toMatch(/CFG/)
        const blocks = [...prompt.matchAll(/<<<(SPAN_\d+)>>>\n([\s\S]*?)\n<<<END_\1>>>/g)]
        expect(blocks.length).toBeGreaterThan(0)
        return blocks
          .map(([, id, body]) => {
            if (/^###\s+/m.test(body.trim())) {
              return `===${id}===\n### What belongs in the file that the heading did not cover?`
            }
            return `===${id}===\nKeep Form I-20 with the passport. Officers must see matching names on the bank letter.\n\nDo not restate eligibility. File only after the live list confirms the set.`
          })
          .join('\n')
      },
    })
    expect(r.applied).toBe(true)
    expect(r.rejected).toBe(false)
    expect(r.passes).toBeGreaterThanOrEqual(1)
    expect(r.content).toContain('https://www.uscis.gov/')
    expect(r.content).toContain('Form I-20')
    expect(r.content).toMatch(/not legal advice/)
    expect(r.content).toContain('## Eligibility')
    expect(r.content).toContain('## Documents')
    expect(r.content).not.toMatch(/^### Eligibility$/m)
    expect(r.content).toContain(PAD.slice(0, 80))
  })

  it('keeps the original when the model invents a citation', async () => {
    const doc = millDoc()
    const r = await runMaskedDenoise({
      content: doc,
      contentType: 'legal_guide',
      generateText: async () =>
        '===SPAN_1===\nSee https://forums.example/i-20 for a sample approval. You must file.\n',
    })
    expect(r.applied).toBe(false)
    expect(r.content).toBe(doc)
  })
})

describe('pipeline wiring', () => {
  it('runs masked denoise after throughline on JSON, stream, and author-revise', () => {
    const json = readFileSync(path.join(process.cwd(), 'lib/seoFactory/pipeline.ts'), 'utf8')
    const stream = readFileSync(path.join(process.cwd(), 'lib/seoFactory/pipelineStream.ts'), 'utf8')
    const revise = readFileSync(
      path.join(process.cwd(), 'app/api/content-studio/author-revise/route.ts'),
      'utf8',
    )
    expect(json.lastIndexOf('runFactoryMaskedDenoise')).toBeGreaterThan(json.lastIndexOf('runFactoryThroughline'))
    expect(stream.lastIndexOf('runFactoryMaskedDenoise')).toBeGreaterThan(stream.lastIndexOf('runFactoryThroughline'))
    expect(revise).toContain('runFactoryMaskedDenoise')
    expect(revise.indexOf('runFactoryMaskedDenoise')).toBeGreaterThan(revise.indexOf('runThroughline'))
  })
})
