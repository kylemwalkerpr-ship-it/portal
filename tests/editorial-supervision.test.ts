/**
 * Editorial supervision regression tests.
 *
 * These tests protect the safety properties of the Audit & Fix design:
 * fresh findings are measured against every candidate, regressions are held,
 * model patches cannot alter protected facts/structure, and a green ship gate
 * never starts another mutation implicitly in the editor.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  buildHarperSupervisionPacket,
  editorialRegression,
  editorialTargetsMet,
  measureEditorial,
  superviseEditorial,
} from '@/lib/editorialSupervisor'
import { applyEditorialHold, editorialReport, editorialReportReady } from '@/lib/seoFactory/editorialGate'
import { applyEditorialReviewPatch } from '@/lib/seoFactory/editorialReviewPatch'
import { applyEditorialRevision } from '@/lib/seoFactory/editorialRevision'
import { contentFingerprint } from '@/lib/seoFactory/currentGate'

describe('editorialSupervisor', () => {
  const hint = { contentType: 'article', primaryKeyword: 'student visa guide' }
  const cleanGrammar = { score: 100, errors: 0, suggestions: 0, items: [] }
  const cleanContent = `# Student visa guide

## In 60 seconds

Students must check the current official requirements before applying. The guide explains the process clearly and preserves every qualification.

## Eligibility

Applicants must hold a valid offer and provide the required documents before they submit the application.

## Documents

Keep the passport, offer letter, financial evidence, and current contact details together in one file.

## Process

Review the official instructions, prepare the evidence, submit the form, and keep the receipt for later reference.

## FAQ

### Can requirements change?

Yes. Check the official source before relying on a date or fee.`

  it('requires fresh Harper output and does not manufacture a perfect score', () => {
    const snapshot = measureEditorial(cleanContent, hint, null)
    expect(snapshot.grammar).toBeNull()
    expect(editorialTargetsMet(snapshot)).toBe(false)
  })

  it('rejects a revision that worsens a measured metric', () => {
    const before = measureEditorial(cleanContent, hint, cleanGrammar)
    const after = {
      ...before,
      grammar: { ...cleanGrammar, score: 84, errors: 1, suggestions: 0, items: [{ kind: 'Grammar', problem: 'is', message: 'agreement' }] },
    }
    expect(editorialRegression(before, after)).toBe(true)
  })

  it('does not treat a 1-point SEO score drop as regression', () => {
    const before = measureEditorial(cleanContent, hint, cleanGrammar)
    const after = { ...before, metrics: { ...before.metrics, seo: { ...before.metrics.seo, score: before.metrics.seo.score - 1 } } }
    expect(editorialRegression(before, after)).toBe(false)
  })

  it('does not treat a 2-point Flesch dip as regression', () => {
    const before = measureEditorial(cleanContent, hint, cleanGrammar)
    const after = {
      ...before,
      metrics: {
        ...before.metrics,
        readability: { ...before.metrics.readability, score: before.metrics.readability.score - 2 },
      },
    }
    expect(editorialRegression(before, after)).toBe(false)
  })

  it('treats a new quality blocker as regression', () => {
    const before = measureEditorial(cleanContent, hint, cleanGrammar)
    const after = { ...before, blockers: [...before.blockers, 'new_blocker_code'] }
    expect(editorialRegression(before, after)).toBe(true)
  })

  it('turns Harper plus SEO, AI-write and Flesch measurements into executable directives', () => {
    const base = measureEditorial(cleanContent, hint, {
      score: 92,
      errors: 1,
      suggestions: 1,
      items: [{ kind: 'Grammar', problem: 'requirements is', message: 'Use subject-verb agreement.', fix: 'requirements are' }],
      styleItems: [{ kind: 'Style', problem: 'utilize', message: 'Prefer a plainer word.', fix: 'use' }],
    })
    const snapshot = {
      ...base,
      voice: 88,
      findings: [{ code: 'robotic_voice', severity: 'warning' as const, message: 'Repeated generic openings.', fix: 'Vary sentence openings.' }],
      metrics: {
        ...base.metrics,
        seo: { ...base.metrics.seo, score: 90, fail: ['Use the primary phrase naturally in reader-facing prose.'] },
        readability: { ...base.metrics.readability, score: 42, target: 55, pass: false, fixes: [{ quote: 'A very long sentence', reason: 'Sentence is too dense.', suggestion: 'Split it into two sentences.' }] },
      },
    }
    const packet = buildHarperSupervisionPacket(snapshot as any)
    const again = buildHarperSupervisionPacket(snapshot as any)
    expect(packet.version).toBe(2)
    expect(packet.fingerprint).toBe(base.fingerprint)
    expect(packet.pending.map((d) => d.id)).toEqual(packet.directives.map((d) => d.id))
    expect(again.directives.map((d) => d.id)).toEqual(packet.directives.map((d) => d.id))
    expect(packet.nonNegotiables.some((rule) => /DEMAND keywords/i.test(rule))).toBe(true)
    const lanes = new Set(packet.directives.map((d) => d.lane))
    for (const need of ['grammar', 'seo', 'ai_write', 'flesch'] as const) {
      expect(lanes.has(need)).toBe(true)
    }
    expect(packet.directives.some((d) => d.evidence === 'requirements is')).toBe(true)
    expect(packet.directives.some((d) => d.id === 'harper-grammar-001')).toBe(false)
    const grammarDir = packet.directives.find((d) => d.lane === 'grammar')
    expect(grammarDir?.id).toMatch(/^harper-grammar-[0-9a-f]{8}$/)
    expect(grammarDir?.mustApply).toBe(true)
    const styleDir = packet.directives.find((d) => d.lane === 'style')
    expect(styleDir?.mustApply).toBe(false)
    expect(packet.unmet).not.toContain('style')
    expect(packet.unmet).toEqual(expect.arrayContaining(['grammar', 'seo', 'flesch']))
  })

  it('does not add a generic natural-prose directive when voice is below 100 with no findings', () => {
    const base = measureEditorial(cleanContent, hint, cleanGrammar)
    const snapshot = { ...base, voice: 80, findings: [], blockers: [] }
    const packet = buildHarperSupervisionPacket(snapshot as any)
    expect(packet.directives.some((d) => /more natural/i.test(d.instruction))).toBe(false)
    expect(packet.unmet).not.toContain('ai_write')
  })

  it('keeps Harper autofix even when Flesch dips', async () => {
    const autofixed = cleanContent.replace(
      'Review the official instructions, prepare the evidence, submit the form, and keep the receipt for later reference.',
      'Review the official instructions and subsequently prepare the required evidence before you submit the form and retain the receipt for later reference in accordance with the process.',
    )
    const beforeSnap = measureEditorial(cleanContent, hint, { score: 84, errors: 2, suggestions: 0, items: [] })
    const afterSnap = measureEditorial(autofixed, hint, { score: 100, errors: 0, suggestions: 0, items: [] })
    expect(afterSnap.metrics.readability.score).toBeLessThanOrEqual(beforeSnap.metrics.readability.score)
    const result = await superviseEditorial({ content: cleanContent, hint }, {
      grammar: async (content) => (
        content === autofixed
          ? { score: 100, errors: 0, suggestions: 0, items: [] }
          : { score: 84, errors: 2, suggestions: 0, items: [{ kind: 'Grammar', problem: 'requirements is', message: 'agreement' }] }
      ),
      autofix: async () => ({ content: autofixed }),
      review: async (content) => ({ content, clean: true }),
    })
    expect(result.content).toBe(autofixed)
  })

  it('re-audits every accepted revision instead of reusing old findings', async () => {
    const grammarCalls: string[] = []
    const reviewCalls: string[] = []
    const result = await superviseEditorial({ content: cleanContent, hint }, {
      grammar: async (content) => {
        grammarCalls.push(content)
        return cleanGrammar
      },
      autofix: async (content) => ({ content }),
      review: async (content) => {
        reviewCalls.push(content)
        return { content, clean: true }
      },
    })
    expect(result.rounds).toBeLessThanOrEqual(1)
    expect(grammarCalls).toEqual([cleanContent])
    if (result.rounds === 1) expect(reviewCalls).toEqual([cleanContent])
  })
})

describe('editorialGate', () => {
  it('holds a response when the report is absent or belongs to another body', () => {
    const response: { shipReady?: boolean; blockers?: number; blockersData?: Array<{ code: string; message: string; fix?: string }> } = {
      shipReady: true,
      blockers: 0,
    }
    applyEditorialHold(response, cleanBody(), { status: 'cleared', fingerprint: 'wrong' })
    expect(response.shipReady).toBe(false)
    expect(response.blockers).toBe(1)
    expect(response.blockersData?.[0].code).toBe('editorial_review_pending')
  })

  it('accepts only a cleared report for the exact final body', () => {
    const body = cleanBody()
    const result = {
      content: body,
      snapshot: {
        fingerprint: contentFingerprint(body),
        grammar: { score: 100, errors: 0, suggestions: 0, items: [] },
        metrics: {
          seo: { score: 100 },
          readability: { score: 70, target: 60, pass: true },
        },
        voice: 100,
        findings: [],
        blockers: [],
      } as any,
      rounds: 1,
      status: 'cleared' as const,
      reason: 'ok',
    }
    const report = editorialReport(result)
    expect(report.fingerprint).toBe(contentFingerprint(body))
    expect(report.supervisor).toBe('harper-editorial-v1')
    expect(report.grammarErrors).toBe(0)
    expect(editorialReportReady(report, body)).toBe(true)
    expect(editorialReportReady(report, `${body} changed`)).toBe(false)
    expect(editorialReportReady({ ...report, grammarSuggestions: 1, voice: 80 }, body)).toBe(true)
    expect(editorialReportReady({ ...report, grammarErrors: 1 }, body)).toBe(false)
    expect(editorialReportReady({ ...report, voice: 54 }, body)).toBe(false)
  })
})

describe('editorialReviewPatch', () => {
  it('rejects protected markup and legal/factual token changes', () => {
    const body = cleanBody()
    const patch = JSON.stringify({ version: 1, operations: [{
      kind: 'replace', findingCode: 'editorial_review',
      anchor: 'Applicants must provide the required documents before submitting.',
      expectedHash: 'ignored',
      replacement: 'Applicants must hold a valid offer <script>alert(1)</script>.',
    }] })
    expect(() => applyEditorialReviewPatch(body, patch)).toThrow(/markup|script|legal qualification/i)
  })
})

describe('editorialRevision', () => {
  const original = `---
title: Student visa
---

# Student visa guide

See https://immi.homeaffairs.gov.au/visas and the 1624 AUD charge. Applicants must check official sources.

## Eligibility

Hold a valid offer.

## Disclaimer

This page is educational and is not legal advice.
`

  it('rejects an empty EditorialRevision when mustApply ids remain', () => {
    expect(() => applyEditorialRevision(original, {
      version: 2,
      mode: 'document',
      document: '',
      appliedIds: [],
      waivedIds: [],
    }, { mustApplyIds: ['harper-grammar-deadbeef'] })).toThrow(/empty while required Harper directives remain/i)
  })

  it('preserves an https URL and a number through a document revision', () => {
    const rewritten = `# Student visa guide

The Department lists the details at https://immi.homeaffairs.gov.au/visas. The 1624 AUD charge can change. Applicants must check official sources.

## Eligibility

You need a valid offer.

## Disclaimer

This page is educational and is not legal advice.
`
    const result = applyEditorialRevision(original, {
      version: 2,
      mode: 'document',
      document: rewritten,
      appliedIds: ['harper-grammar-deadbeef'],
      waivedIds: [],
    }, { mustApplyIds: ['harper-grammar-deadbeef'] })
    expect(result.clean).toBe(false)
    expect(result.content).toContain('https://immi.homeaffairs.gov.au/visas')
    expect(result.content).toContain('1624')
    expect(result.content).toContain('title: Student visa')
    expect(result.content).toMatch(/#+\s+Disclaimer\b|\*{0,2}Disclaimer\*{0,2}\s*:/i)
  })

  it('rejects a document revision that invents a URL or drops a number', () => {
    expect(() => applyEditorialRevision(original, {
      version: 2,
      mode: 'document',
      document: `# Student visa guide\n\nSee https://evil.example/phish. Applicants must check.\n\n## Disclaimer\n\nThis page is educational and is not legal advice.\n`,
      appliedIds: ['harper-grammar-deadbeef'],
      waivedIds: [],
    }, { mustApplyIds: ['harper-grammar-deadbeef'] })).toThrow(/URL|number|legal/i)
  })
})

describe('admin-inline-editor approval invariant', () => {
  it('does not auto-run Audit & Fix from a green ship gate', () => {
    const source = readFileSync(path.join(process.cwd(), 'components/design/admin-inline-editor.tsx'), 'utf8')
    expect(source).not.toContain('void handleFixAll()')
    expect(source).toContain('Audit & Fix is explicit')
  })

  it('keeps Markdown source usable for large drafts and gives Audit & Fix a recovery path', () => {
    const source = readFileSync(path.join(process.cwd(), 'components/design/admin-inline-editor.tsx'), 'utf8')
    expect(source).toContain("content.length > DRAFT_RENDERER_SAFE_CHARS && viewMode === 'document'")
    expect(source).toContain('inspectDraftIntegrity(content)')
    expect(source).toContain('Open Markdown source')
    expect(source).not.toContain("setError('No countable body words. Load a draft before Audit & Fix.')")
  })
})

describe('reviewer stays on the selected model', () => {
  it('Harper editorial-review is exclusive Grok-default with no capacity cascade', () => {
    const source = readFileSync(path.join(process.cwd(), 'app/api/content-studio/editorial-review/route.ts'), 'utf8')
    expect(source).toContain('exclusive: true')
    expect(source).toContain('cascadeOnCapacity: false')
    expect(source).toContain('DEFAULT_REVIEW_PIN')
  })

  it('Audit & Fix (reaudit) stays exclusive on the selected reviewer — no Entrim cascade', () => {
    const source = readFileSync(path.join(process.cwd(), 'app/api/content-studio/reaudit/route.ts'), 'utf8')
    expect(source).toContain('cascadeOnCapacity: false')
    expect(source).not.toContain('cascadeOnCapacity: Boolean(aiProvider)')
    expect(source).not.toContain('exclusive: Boolean(aiProvider)')
    expect(source).toContain('exclusive: true')
  })

  it('Harper editorial-review client wait is longer than the Grok abort window', () => {
    const source = readFileSync(path.join(process.cwd(), 'components/design/admin-inline-editor.tsx'), 'utf8')
    expect(source).not.toContain('timeoutMs: 80_000')
    expect(source).toContain('timeoutMs: 200_000')
    expect(source).toContain('reviewModel: reviewModel || DEFAULT_REVIEW_PIN')
  })
})

function cleanBody(): string {
  return `# Student visa guide\n\n## In 60 seconds\n\nStudents must check the official requirements before applying.\n\n## Eligibility\n\nApplicants must provide the required documents before submitting.`
}
