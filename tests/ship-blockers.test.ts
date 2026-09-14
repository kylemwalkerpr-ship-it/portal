/**
 * Every ship blocker must stay visible, and repair copy must keep one article.
 */
import { evaluateContentQuality, qualityToRefineNotes } from '@/lib/seoFactory/contentQualityGate'
import { evaluateReauditContract, capAnnotations } from '@/lib/seoFactory/reauditContract'
import { slimAuditJsonForClient } from '@/lib/seoFactory/jobShipGate'
import { auditToRefineNotes } from '@/lib/seoFactory/prompts'
import { applyShipWithhold } from '@/lib/seoFactory/resolveShipMode'
import { buildBlockersFixPrompt } from '@/lib/seoFactory/inlineAnnotations'
import {
  surfaceShipBlockers,
  refineNotesForBlockers,
  formatAllBlockerCodes,
  formatAllBlockerMessages,
} from '@/lib/seoFactory/shipBlockers'
import { assertRegisteredFindingCodes, blocksShip } from '@/lib/seoFactory/contentQualityPlaybook'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'
import type { SeoFactoryAudit } from '@/lib/seoFactory/audit'
import type { InlineAnnotation } from '@/lib/seoFactory/inlineAnnotations'

const KIT = `---
title: H-1B visa
description: Practical filing steps with official sources for H-1B petitions in 2026.
primaryKeyword: h-1b visa
---

# H-1B visa

You file after the LCA is certified.

## Eligibility

The h-1b visa is a specialty occupation category that explains who may petition in this calendar year.

## Documents

This section covers the h-1b visa paperwork you gather before the petition window opens.

## Process

USCIS issues a receipt once the certified LCA sits with Form I-129.

## FAQ

### What happens after filing?

USCIS issues a receipt you keep.

## Sources

- [USCIS](https://www.uscis.gov/)

This guide is educational only, not legal advice. Consult an attorney for your situation.
`

describe('surfaceShipBlockers', () => {
  it('keeps distinct instances of the same code and collapses exact twins', () => {
    const surfaced = surfaceShipBlockers([
      { code: 'stuffed_primary_opener_severe', message: 'H2 Eligibility', evidence: 'a', severity: 'blocker' },
      { code: 'stuffed_primary_opener_severe', message: 'H2 Documents', evidence: 'b', severity: 'blocker' },
      { code: 'stuffed_primary_opener_severe', message: 'H2 Eligibility', evidence: 'a', severity: 'blocker' },
      { code: 'missing_disclaimer', message: 'Missing disclaimer', severity: 'blocker' },
    ])
    expect(surfaced.map((b) => `${b.code}:${b.message}`)).toEqual([
      'stuffed_primary_opener_severe:H2 Eligibility',
      'stuffed_primary_opener_severe:H2 Documents',
      'missing_disclaimer:Missing disclaimer',
    ])
  })

  it('collapses an empty-evidence audit copy of a quality finding that already has evidence', () => {
    const surfaced = surfaceShipBlockers([
      { code: 'stuffed_primary_opener_severe', message: 'H2 Eligibility', evidence: 'heading=Eligibility', severity: 'blocker' },
      { code: 'stuffed_primary_opener_severe', message: 'H2 Eligibility', severity: 'blocker' },
    ])
    expect(surfaced).toHaveLength(1)
    expect(surfaced[0].evidence).toBe('heading=Eligibility')
  })

  it('never tells the writer to stuff missing shorts into the first H2', () => {
    const notes = refineNotesForBlockers([
      { code: 'missing_short_keyword', message: 'Required short keyword(s) absent: "labor condition"', fix: 'title, first H2, In 60 seconds, or as a checklist item.' },
    ]).join('\n')
    expect(notes).toContain('missing_short_keyword')
    expect(notes).not.toMatch(/title, first H2, In 60 seconds, or as a checklist item/)
    expect(notes).toMatch(/Meaning coverage beats exact-string placement/)
    expect(notes).toMatch(/Keep ONE argument/)
  })
})

describe('quality / reaudit surface every kit-opener blocker', () => {
  it('lists each kit-piece H2 in blockersData and refine notes', () => {
    const q = evaluateContentQuality({
      content: KIT,
      contentType: 'legal_guide',
      primaryKeyword: 'h-1b visa',
      indexable: true,
    })
    const kit = q.blockers.filter((b) => b.code === 'stuffed_primary_opener_severe')
    expect(kit.length).toBeGreaterThanOrEqual(2)
    expect(() => assertRegisteredFindingCodes(q.findings.filter((f) => f.code === 'stuffed_primary_opener_severe' || f.code === 'stuffed_primary_opener'))).not.toThrow()
    expect(blocksShip('stuffed_primary_opener_severe')).toBe(true)
    expect(blocksShip('stuffed_primary_opener')).toBe(false)

    const notes = qualityToRefineNotes(q)
    expect(notes).toContain('stuffed_primary_opener_severe')
    expect((notes.match(/stuffed_primary_opener_severe/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(notes).toMatch(/Keep ONE argument/)

    const reaudit = evaluateReauditContract({
      content: KIT,
      contentType: 'legal_guide',
      primaryKeyword: 'h-1b visa',
      indexable: true,
    })
    const listed = reaudit.blockersData.filter((b) => b.code === 'stuffed_primary_opener_severe')
    expect(listed.length).toBeGreaterThanOrEqual(2)
    expect(reaudit.shipReady).toBe(false)
  })

  it('lists every missing demand short, not a 6-term preview', () => {
    const shorts = Array.from({ length: 10 }, (_, i) => `qkw${i} demand`)
    const q = evaluateContentQuality({
      content: KIT,
      contentType: 'legal_guide',
      primaryKeyword: 'h-1b visa',
      indexable: true,
      requiredShortKeywords: ['h-1b visa', ...shorts],
    })
    const missing = q.blockers.find((b) => b.code === 'missing_short_keyword')
    expect(missing).toBeDefined()
    for (const term of shorts) {
      expect(missing!.message).toContain(term)
      expect(missing!.evidence).toContain(term)
    }
  })
})

describe('slimAuditJsonForClient never drops ship blockers', () => {
  it('keeps all 15 distinct blockers', () => {
    const blockers = Array.from({ length: 15 }, (_, i) => ({
      code: `blocker_${i}`,
      message: `Hold ${i}`,
      severity: 'blocker' as const,
    }))
    const slim = slimAuditJsonForClient({
      shipReady: false,
      blockers,
      blockersCount: 15,
      score: 40,
    })
    expect(Array.isArray(slim?.blockers)).toBe(true)
    expect((slim?.blockers as unknown[]).length).toBe(15)
    expect(slim?.blockersCount).toBe(15)
  })
})

describe('auditToRefineNotes lists every blocker', () => {
  it('does not truncate after 8', () => {
    const blockers = Array.from({ length: 12 }, (_, i) => ({
      code: `code_${i}`,
      message: `Problem ${i}`,
    }))
    const notes = auditToRefineNotes({
      blockers,
      warnings: [],
      wordCount: 2200,
      score: 40,
      minWords: 2200,
    })
    for (let i = 0; i < 12; i++) {
      expect(notes).toContain(`code_${i}`)
    }
  })

  it('does not truncate warnings after 8', () => {
    const warnings = Array.from({ length: 12 }, (_, i) => ({
      code: `warn_${i}`,
      message: `Soft ${i}`,
    }))
    const notes = auditToRefineNotes({
      blockers: [],
      warnings,
      wordCount: 2200,
      score: 40,
      minWords: 2200,
    })
    for (let i = 0; i < 12; i++) {
      expect(notes).toContain(`warn_${i}`)
    }
  })
})

describe('applyShipWithhold names every blocker code', () => {
  it('includes all codes in the hold reason', () => {
    const audit = {
      score: 20,
      grade: 'F',
      wordCount: 200,
      humanScore: 40,
      blockers: [
        { code: 'thin_content', message: 'thin', severity: 'blocker' as const },
        { code: 'missing_disclaimer', message: 'no disclaimer', severity: 'blocker' as const },
        { code: 'stuffed_primary_opener_severe', message: 'kit', severity: 'blocker' as const },
        { code: 'word_count', message: 'too short for a guide', severity: 'blocker' as const },
        { code: 'missing_tldr', message: 'no in 60 seconds', severity: 'blocker' as const },
        { code: 'missing_faq', message: 'no faq', severity: 'blocker' as const },
        { code: 'citations', message: 'no official url', severity: 'blocker' as const },
      ],
      warnings: [],
      passes: [],
    } as unknown as SeoFactoryAudit
    const plan = { blockers: ['ownership'] } as OwnerPlan
    const r = applyShipWithhold({
      requested: 'merge',
      shipMode: 'merge',
      audit,
      plan,
      minAudit: 80,
    })
    expect(r.gateHold).toMatch(/thin_content/)
    expect(r.gateHold).toMatch(/missing_disclaimer/)
    expect(r.gateHold).toMatch(/stuffed_primary_opener_severe/)
    expect(r.gateHold).toMatch(/missing_tldr/)
    expect(r.gateHold).toMatch(/missing_faq/)
    expect(r.gateHold).toMatch(/citations/)
    expect(formatAllBlockerCodes(audit.blockers)).toContain('citations')
    expect(formatAllBlockerMessages(audit.blockers)).toContain('no official url')
  })
})

describe('buildBlockersFixPrompt keeps every blocker and one-article repair', () => {
  it('lists 12 blockers and refuses stuffing slots', () => {
    const blockers = Array.from({ length: 12 }, (_, i) => ({
      code: i === 0 ? 'missing_short_keyword' : `code_${i}`,
      message: `Problem ${i}`,
      fix: i === 0 ? 'title, first H2, In 60 seconds, or as a checklist item.' : 'fix',
    }))
    const prompt = buildBlockersFixPrompt('# Draft\n\nBody.', blockers)
    for (let i = 0; i < 12; i++) {
      expect(prompt).toContain(i === 0 ? 'missing_short_keyword' : `code_${i}`)
    }
    expect(prompt).not.toMatch(/title, first H2, In 60 seconds, or as a checklist item/)
    expect(prompt).toMatch(/Keep ONE argument/)
    expect(prompt).toMatch(/Fix EVERY blocker listed above/)
  })
})

describe('capAnnotations never hides a distinct kit-piece H2', () => {
  it('keeps four stuffed opener instances when a flood would otherwise bury them', () => {
    const kit = ['Eligibility', 'Documents', 'Fees', 'Process'].map((h, i) => ({
      id: `kit-${i}`,
      line: 1,
      col: 1,
      endLine: 1,
      endCol: 1,
      length: 0,
      severity: 'blocker' as const,
      code: 'stuffed_primary_opener_severe',
      message: `H2 ${h}`,
      fix: 'fix',
      highlightedText: '',
    }))
    const flood: InlineAnnotation[] = Array.from({ length: 40 }, (_, i) => ({
      id: `op-${i}`,
      line: 1,
      col: 1,
      endLine: 1,
      endCol: 1,
      length: 0,
      severity: 'blocker' as const,
      code: 'outcome_promise',
      message: 'outcome_promise',
      fix: 'fix',
      highlightedText: '',
    }))
    const capped = capAnnotations([...flood, ...kit], 8, 3)
    const messages = capped.filter((a) => a.code === 'stuffed_primary_opener_severe').map((a) => a.message)
    expect(messages.sort()).toEqual(['H2 Documents', 'H2 Eligibility', 'H2 Fees', 'H2 Process'])
  })
})
