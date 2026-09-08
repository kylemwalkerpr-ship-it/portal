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
import { editorialRegression, editorialTargetsMet, measureEditorial, superviseEditorial } from '@/lib/editorialSupervisor'
import { applyEditorialHold, editorialReport, editorialReportReady } from '@/lib/seoFactory/editorialGate'
import { applyEditorialReviewPatch } from '@/lib/seoFactory/editorialReviewPatch'
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
    const after = { ...before, metrics: { ...before.metrics, seo: { ...before.metrics.seo, score: before.metrics.seo.score - 1 } } }
    expect(editorialRegression(before, after)).toBe(true)
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
    expect(result.rounds).toBe(1)
    expect(grammarCalls).toEqual([cleanContent])
    expect(reviewCalls).toEqual([cleanContent])
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
    expect(editorialReportReady(report, body)).toBe(true)
    expect(editorialReportReady(report, `${body} changed`)).toBe(false)
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

describe('admin-inline-editor approval invariant', () => {
  it('does not auto-run Audit & Fix from a green ship gate', () => {
    const source = readFileSync(path.join(process.cwd(), 'components/design/admin-inline-editor.tsx'), 'utf8')
    expect(source).not.toContain('void handleFixAll()')
    expect(source).toContain('Audit & Fix is explicit')
  })
})

function cleanBody(): string {
  return `# Student visa guide\n\n## In 60 seconds\n\nStudents must check the official requirements before applying.\n\n## Eligibility\n\nApplicants must provide the required documents before submitting.`
}
