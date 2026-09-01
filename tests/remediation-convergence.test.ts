/**
 * Remediation convergence — the three structural defects that let the
 * "Audit & Fix" loop spin forever or silently damage a draft.
 *
 * 1. Deterministic sentence-dedupe flattened markdown lists onto one line.
 * 2. Synthesized-keyword warnings (no search-demand evidence, shipEffect
 *    `allow_with_flag`) consumed the whole AI budget and always ended
 *    `held_for_review` with the same codes — unclearable by construction.
 * 3. `sentence_start_repetition` fired on pronoun openings that
 *    `smoothSentenceRhythm` excluded from its own counting, so the gate
 *    reported a permanent blocker while the repair reported `replaced = 0`.
 */
import { applyDeterministicRepairs, smoothSentenceRhythm } from '../lib/seoFactory/editorialScaffold'
import { evaluateContentQuality } from '../lib/seoFactory/contentQualityGate'
import { runAuditEditorLoop } from '../lib/seoFactory/auditEditorLoop'
import { blocksShip, shipEffectFor } from '../lib/seoFactory/contentQualityPlaybook'
import { createContentSpec, type ContentSpec } from '../lib/seoFactory/contentSpec'
import { anchorHash } from '../lib/seoFactory/editorPatch'

describe('1. deterministic repairs preserve list structure', () => {
  it('never collapses a long markdown checklist into a paragraph', () => {
    const bullets = [
      '- Confirm the sponsor meets the minimum income requirement.',
      '- Gather six months of bank statements for the sponsor.',
      '- Obtain a certified translation of the marriage certificate.',
      '- Book the biometrics appointment at a visa application centre.',
      '- Upload the accommodation evidence before the deadline passes.',
      '- Pay the immigration health surcharge for the full visa length.',
    ]
    const body = [
      '# UK Dependent Visa Guide',
      '',
      '## Document checklist',
      '',
      ...bullets,
      '',
      '## Notes',
      '',
      'Keep certified copies of everything you send to the department.',
      '',
    ].join('\n')

    const { content } = applyDeterministicRepairs({
      content: body,
      primaryKeyword: 'uk dependent visa',
      indexable: true,
    })

    // Every bullet still starts its own line.
    for (const b of bullets) expect(content).toContain(b)
    // No BODY line carries two bullet markers (the flattening signature).
    // Frontmatter `description:` and JSON-LD legitimately inline the bullets
    // as a single summary string, so scan the body only.
    const body2 = content.replace(/^---[\s\S]*?\n---\n/, '').replace(/<script[\s\S]*?<\/script>/g, '')
    const doubled = body2
      .split('\n')
      .filter((l) => (l.match(/(?:^|\s)- [A-Z]/g) || []).length > 1)
    expect(doubled).toEqual([])
  })

  it('still removes genuine prose repetition', () => {
    const dupe = 'The sponsor must prove the minimum income requirement is met.'
    const body = [
      '# Guide',
      '',
      '## Detail',
      '',
      [dupe, dupe, dupe, 'Different sentence about the accommodation evidence supplied.',
        'Another distinct sentence about the biometrics appointment booking.'].join(' '),
      '',
    ].join('\n')
    const { content } = applyDeterministicRepairs({
      content: body,
      primaryKeyword: 'uk dependent visa',
      indexable: true,
    })
    // Third+ copy dropped; the sentence itself survives.
    const occurrences = content.split(dupe).length - 1
    expect(occurrences).toBeLessThan(3)
    expect(occurrences).toBeGreaterThan(0)
  })
})

describe('2. advisory findings never trap the loop', () => {
  const SPEC: ContentSpec = createContentSpec({
    jobId: 'job-advisory-1',
    contentType: 'legal_guide',
    region: 'uk',
    indexable: true,
    target: {
      canonicalUrl: 'https://yousafeconsultancy.com/legal/uk-dependent-visa',
      host: 'yousafeconsultancy.com',
      path: '/legal/uk-dependent-visa',
    },
    intent: {
      primaryQuery: 'uk dependent visa requirements',
      reader: 'a partner joining a UK sponsor',
      queryNeed: 'eligibility and procedure',
      stage: 'consideration',
    },
    primaryKeyword: 'uk dependent visa',
    requiredKeywords: [{ phrase: 'dependent visa', kind: 'short' }],
  })
  const DOC = '# Guide\n\n## Detail\n\nSome sufficiently long body text for the loop to operate on.\n'

  it('classifies synthesized-keyword codes as non-blocking', () => {
    for (const code of ['missing_synthesized_short_keyword', 'missing_synthesized_long_tail_keyword']) {
      expect(shipEffectFor(code)).toBe('allow_with_flag')
      expect(blocksShip(code)).toBe(false)
    }
  })

  it('keeps unregistered codes blocking (conservative default)', () => {
    expect(blocksShip('some_code_that_does_not_exist')).toBe(true)
  })

  it('clears instead of holding, reports the advisory code, and attempts ONE advisory sweep', async () => {
    let aiCalls = 0
    const result = await runAuditEditorLoop(
      { content: DOC, spec: SPEC },
      {
        evaluate: () => [{ code: 'missing_synthesized_short_keyword', severity: 'warning' }],
        requestEditorPatch: async () => {
          aiCalls++
          return null
        },
      },
    )
    expect(result.status).toBe('cleared')
    expect(result.advisoryCodes).toContain('missing_synthesized_short_keyword')
    // 2026-09-01 sweep: advisory targeted_ai codes get ONE honest AI attempt
    // (the writer can place a synthesized long-tail as an FAQ question); a
    // leftover stays advisory and never blocks ship.
    expect(aiCalls).toBe(1)
    expect(result.rounds.some((r) => r.aiRequest?.findingCodes.includes('missing_synthesized_short_keyword'))).toBe(true)
    expect(result.rounds.some((r) => r.aiResult === 'provider_failure')).toBe(true)
  })

  it('advisory sweep clears synthesized gaps when the writer AI places the term', async () => {
    let aiCalls = 0
    const result = await runAuditEditorLoop(
      { content: DOC, spec: SPEC },
      {
        evaluate: (c) =>
          c.includes('estimated tax payment help')
            ? []
            : [{ code: 'missing_synthesized_long_tail_keyword', severity: 'warning' }],
        requestEditorPatch: async ({ content }) => {
          aiCalls++
          return {
            version: 1 as const,
            operations: [
              {
                kind: 'replace' as const,
                findingCode: 'missing_synthesized_long_tail_keyword',
                anchor: 'Some sufficiently long body text for the loop to operate on.',
                expectedHash: anchorHash(content, 'Some sufficiently long body text for the loop to operate on.') || '',
                replacement: 'Some sufficiently long body text explaining estimated tax payment help requirements.',
              },
            ],
          }
        },
      },
    )
    expect(result.status).toBe('cleared')
    expect(aiCalls).toBe(1)
    expect(result.advisoryCodes).not.toContain('missing_synthesized_long_tail_keyword')
    expect(result.rounds.some((r) => r.aiResult === 'applied')).toBe(true)
  })

  it('human_only findings still hold for review (not treated as advisory)', async () => {
    const result = await runAuditEditorLoop(
      { content: DOC, spec: SPEC },
      {
        evaluate: () => [{ code: 'unverified_internal_link', severity: 'warning' }],
        requestEditorPatch: async () => null,
      },
    )
    expect(result.status).toBe('held_for_review')
    expect(result.advisoryCodes).not.toContain('unverified_internal_link')
  })
})

describe('3. sentence_start_repetition converges', () => {
  const rhythmFinding = (md: string) =>
    evaluateContentQuality({ content: md, primaryKeyword: 'visa', indexable: true })
      .findings.find((f) => f.code === 'sentence_start_repetition')

  it('repairs repeated pronoun openings the gate counts', () => {
    // "This …" ×9 — previously excluded from the repair's own counting while
    // the gate still flagged it, producing a permanent blocker.
    const sentences = Array.from(
      { length: 9 },
      (_, i) => `This process requires careful attention to the ${i} supporting document set.`,
    )
    const body = `# Guide\n\n## Detail\n\n${sentences.join(' ')}\n`

    expect(rhythmFinding(body)).toBeDefined()

    const first = smoothSentenceRhythm(body)
    expect(first.replaced).toBeGreaterThan(0)
    expect(rhythmFinding(first.content)).toBeUndefined()

    // Idempotent — a second pass must not churn the text further.
    const second = smoothSentenceRhythm(first.content)
    expect(second.replaced).toBe(0)
    expect(second.content).toBe(first.content)
  })

  it('leaves no stray capital when an adverbial prefix is spliced in', () => {
    const sentences = Array.from(
      { length: 8 },
      (_, i) => `This process requires careful attention to the ${i} supporting document set.`,
    )
    const { content } = smoothSentenceRhythm(`# G\n\n## D\n\n${sentences.join(' ')}\n`)
    // "In this case, This process…" is ungrammatical.
    expect(content).not.toMatch(/,\s+This process/)
    expect(content).toMatch(/,\s+this process/)
  })

  it('preserves acronym subjects when downcasing after a prefix', () => {
    const sentences = Array.from(
      { length: 8 },
      (_, i) => `US immigration policy${i} shifted during the ${i} review cycle overall.`,
    )
    const { content } = smoothSentenceRhythm(`# G\n\n## D\n\n${sentences.join(' ')}\n`)
    expect(content).not.toMatch(/\bus immigration/)
    expect(content).toMatch(/US immigration/)
  })
})
