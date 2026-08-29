/**
 * Bounded audit–editor loop tests (implementation brief §5 + §7.7, Milestone B).
 * Convergence, cap/stall/provider-failure holds, human_only routing, and the
 * sample gates duplicate_h2 / ahrefs_schema_invalid / unverified_internal_link.
 */
import { runAuditEditorLoop, CONTENT_LOOP_BUDGET } from '@/lib/seoFactory/auditEditorLoop'
import { createContentSpec, type ContentSpec } from '@/lib/seoFactory/contentSpec'
import { evaluateAhrefsDraft } from '@/lib/seoFactory/ahrefsIssues'
import { auditContent } from '@/lib/seoFactory/audit'
import { auditLinksSync } from '@/lib/seoFactory/linkAudit'
import { gate, severityFor, assertRegisteredFindingCodes } from '@/lib/seoFactory/contentQualityPlaybook'
import { anchorHash } from '@/lib/seoFactory/editorPatch'

const SPEC: ContentSpec = createContentSpec({
  jobId: 'job-loop-1',
  contentType: 'legal_guide',
  region: 'uk',
  indexable: true,
  target: {
    canonicalUrl: 'https://yousafeconsultancy.com/legal/uk-skilled-worker-visa',
    host: 'yousafeconsultancy.com',
    path: '/legal/uk-skilled-worker-visa',
  },
  intent: {
    primaryQuery: 'uk skilled worker visa requirements',
    reader: 'a migrant worker preparing an application',
    queryNeed: 'eligibility and procedure',
    stage: 'consideration',
  },
  primaryKeyword: 'uk skilled worker visa',
  requiredKeywords: [{ phrase: 'skilled worker visa', kind: 'short' }],
})

const BASE_DOC = `---
title: UK Skilled Worker Visa Requirements 2026 Guide
description: Eligibility, salary thresholds, documents, and the application procedure for the UK Skilled Worker visa.
robots: index,follow
---

# UK Skilled Worker Visa Requirements

## In 60 seconds

- You need a sponsoring employer

## Eligibility

You must have a sponsor. We guarantee your visa approval.

## FAQ

### Do I need IELTS?

Yes, most applicants prove English ability.

## FAQ

Yes, most applicants prove English ability.
`

function removePatch(code: string, anchor: string, content: string) {
  return {
    version: 1 as const,
    operations: [
      { kind: 'remove' as const, findingCode: code, anchor, expectedHash: anchorHash(content, anchor) || '' },
    ],
  }
}

describe('runAuditEditorLoop — convergence and holds', () => {
  it('clears deterministic findings with ZERO AI calls', async () => {
    let aiCalls = 0
    const doc = BASE_DOC
    const result = await runAuditEditorLoop(
      { content: doc, spec: SPEC },
      {
        evaluate: (c) => (c.match(/^## FAQ$/gm) || []).length > 1 ? [{ code: 'duplicate_h2', severity: 'warning' }] : [],
        deterministicRepair: (c) => ({
          content: c.replace(/\n## FAQ\n\nYes, most applicants prove English ability.\n$/, ''),
          repairs: ['removed duplicate FAQ section'],
        }),
        requestEditorPatch: async () => {
          aiCalls++
          return null
        },
      },
    )
    expect(result.status).toBe('cleared')
    expect(result.stopReason).toBe('no_open_findings')
    expect(result.rounds.some((r) => r.aiRequest)).toBe(false)
    expect(aiCalls).toBe(0)
    expect(result.leftoverCodes).toEqual([])
    expect(result.specVersion).toBe(SPEC.version)
  })

  it('clears a targeted_ai finding through one structured patch', async () => {
    const doc = BASE_DOC
    const result = await runAuditEditorLoop(
      { content: doc, spec: SPEC },
      {
        evaluate: (c) =>
          /guarantee your visa/.test(c)
            ? [{ code: 'outcome_promise', severity: 'blocker', message: 'we guarantee your visa' }]
            : [],
        requestEditorPatch: async ({ content }) => {
          const anchor = 'You must have a sponsor. We guarantee your visa approval.'
          return {
            version: 1 as const,
            operations: [
              {
                kind: 'replace' as const,
                findingCode: 'outcome_promise',
                anchor,
                expectedHash: anchorHash(content, anchor) || '',
                replacement: 'You must have a sponsor who is licensed by the Home Office.',
              },
            ],
          }
        },
      },
    )
    expect(result.status).toBe('cleared')
    expect(result.rounds.filter((r) => r.aiResult === 'applied')).toHaveLength(1)
    expect(result.rounds[0].aiRequest?.findingCodes).toEqual(['outcome_promise'])
  })

  it('holds at the stall threshold when patches make no progress', async () => {
    const doc = BASE_DOC
    const result = await runAuditEditorLoop(
      { content: doc, spec: SPEC, budget: { stallRounds: 2, maxAiPasses: 6 } },
      {
        evaluate: () => [{ code: 'ai_slop', severity: 'blocker' }],
        requestEditorPatch: async ({ content }) => ({
          version: 1 as const,
          operations: [
            {
              kind: 'replace' as const,
              findingCode: 'ai_slop',
              anchor: '- You need a sponsoring employer',
              expectedHash: anchorHash(content, '- You need a sponsoring employer') || '',
              replacement: '- You need a sponsoring employer (unchanged, still sloppy)',
            },
          ],
        }),
      },
    )
    expect(result.status).toBe('held_for_review')
    expect(result.stopReason).toBe('stalled')
    expect(result.leftoverCodes).toContain('ai_slop')
    expect(result.rounds.length).toBeLessThanOrEqual(CONTENT_LOOP_BUDGET.stallRounds + 1)
  })

  it('holds when the AI pass budget is exhausted', async () => {
    // Five sloppy marker lines; each pass legitimately clears exactly one, so
    // rounds always make progress (no stall) — the loop must still stop at
    // the shared AI pass budget (2) and hold the remainder for review.
    const markers = ['Filler line 1.', 'Filler line 2.', 'Filler line 3.', 'Filler line 4.', 'Filler line 5.']
    const doc = `${BASE_DOC}\n\n${markers.map((m) => `${m}\n`).join('')}`
    let pass = 0
    const result = await runAuditEditorLoop(
      { content: doc, spec: SPEC, budget: { maxAiPasses: 2 } },
      {
        evaluate: (c) =>
          markers.filter((m) => c.includes(m)).map((m) => ({ code: 'ai_slop', severity: 'blocker' as const, message: m })),
        requestEditorPatch: async ({ content }) => {
          pass++
          const anchor = markers[pass - 1]
          return {
            version: 1 as const,
            operations: [
              {
                kind: 'replace' as const,
                findingCode: 'ai_slop',
                anchor,
                expectedHash: anchorHash(content, anchor) || '',
                replacement: 'A clean, concrete sentence.',
              },
            ],
          }
        },
      },
    )
    expect(result.status).toBe('held_for_review')
    expect(result.stopReason).toBe('budget_exhausted')
    expect(pass).toBe(2)
    expect(result.leftoverCodes).toContain('ai_slop')
    expect(result.content).toContain('Filler line 3.')
  })

  it('returns provider_failed on provider failure with the document intact', async () => {
    const result = await runAuditEditorLoop(
      { content: BASE_DOC, spec: SPEC },
      {
        evaluate: () => [{ code: 'ai_slop', severity: 'blocker' }],
        requestEditorPatch: async () => null,
      },
    )
    expect(result.status).toBe('provider_failed')
    expect(result.content).toBe(BASE_DOC)
    expect(result.rounds[0].aiResult).toBe('provider_failure')
  })

  it('routes human_only findings straight to review without an AI call', async () => {
    let aiCalls = 0
    const result = await runAuditEditorLoop(
      { content: BASE_DOC, spec: SPEC },
      {
        evaluate: () => [{ code: 'unverified_internal_link', severity: 'warning' }],
        requestEditorPatch: async () => {
          aiCalls++
          return null
        },
      },
    )
    expect(result.status).toBe('held_for_review')
    expect(result.stopReason).toBe('human_only_findings')
    expect(result.leftoverCodes).toContain('unverified_internal_link')
    expect(aiCalls).toBe(0)
  })

  it('refuses an unknown spec version before any evaluation', async () => {
    let evaluated = false
    const result = await runAuditEditorLoop(
      { content: BASE_DOC, spec: { ...SPEC, version: '1999.01.1' } as any },
      {
        evaluate: () => {
          evaluated = true
          return []
        },
      },
    )
    expect(result.status).toBe('held_for_review')
    expect(result.stopReason).toBe('spec_invalid')
    expect(evaluated).toBe(false)
  })
})

// ── Sample gates (test matrix §7.4) ─────────────────────────────────────────

describe('sample gates produce registered codes', () => {
  const GUIDE = `---
title: UK Skilled Worker Visa Requirements 2026 Guide
description: Eligibility, salary thresholds, documents, and the application procedure for the UK Skilled Worker visa with official sources.
robots: index,follow
---

# UK Skilled Worker Visa Requirements

## In 60 seconds

- You need a licensed sponsor and a certificate of sponsorship.

## Eligibility

You need a job offer from a licensed sponsor. See [gov.uk](https://www.gov.uk/skilled-worker-visa).

## Application steps

- Apply online
- Attend your appointment

## FAQ

### Do I need IELTS?

Most applicants prove English ability.

## Sources

- https://www.gov.uk/skilled-worker-visa

<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>
`

  it('ahrefs_schema_invalid: invalid Article JSON-LD → registered warning', () => {
    const findings = evaluateAhrefsDraft(GUIDE, { indexable: true })
    const schema = findings.find((f) => f.code === 'ahrefs_schema_invalid')
    expect(schema).toBeTruthy()
    expect(schema!.severity).toBe('warning')
    expect(severityFor('ahrefs_schema_invalid')).toBe('warning')
    expect(() => assertRegisteredFindingCodes(findings)).not.toThrow()
  })

  it('duplicate_h2: repeated H2 → registered audit warning', () => {
    const audit = auditContent({
      content: GUIDE + '\n\n## FAQ\n\n### Another?\n\nYes.\n',
      contentType: 'legal_guide',
      primaryKeyword: 'uk skilled worker visa',
      indexable: true,
    })
    const dup = (audit.warnings || []).find((w) => w.code === 'duplicate_h2')
    expect(dup).toBeTruthy()
    expect(severityFor('duplicate_h2')).toBe('warning')
  })

  it('unverified_internal_link: estate URL outside the live set → registered warning', () => {
    const doc = GUIDE + '\nSee also [the hub](https://www.yousafeconsultancy.com/legal/immigration-hub).\n'
    const findings = auditLinksSync(doc, [], [], { region: 'uk', topic: 'uk skilled worker visa' })
    const unverified = findings.find((f) => f.code === 'unverified_internal_link')
    expect(unverified).toBeTruthy()
    expect(unverified!.severity).toBe('warning')
    expect(() => assertRegisteredFindingCodes(findings)).not.toThrow()
  })

  it('registry lookup works for all three sample codes', () => {
    for (const code of ['ahrefs_schema_invalid', 'duplicate_h2', 'unverified_internal_link']) {
      expect(gate(code).code).toBe(code)
      expect(gate(code).evidence.length).toBeGreaterThan(0)
    }
  })
})
