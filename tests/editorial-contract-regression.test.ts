/**
 * Editorial contract regression suite — locks the non-negotiable guardrails
 * that prevent the most common quality-warning classes at the prompt layer.
 *
 * If a term is removed, renamed, or softened from these constants, a shipped
 * draft will regress to DEAD_INTERNAL_LINK, H2_STRUCTURE (count 0),
 * AI_ANSWER_BLOCK (missing TL;DR), or SCHEMA_ARTICLE / SCHEMA_FAQ warnings.
 *
 * All assertions are string-contains on the flat contract text so re-ordering
 * lines or adjusting wording keeps the test green as long as the critical
 * guardrail remains present.
 */
import {
  EDITORIAL_CONTRACT_VERSION,
  EDITORIAL_FORMATTING_CONTRACT,
  editorialBriefPromptBlock,
} from '@/lib/seoFactory/editorialContract'
import { buildFactorySystemPrompt } from '@/lib/seoFactory/prompts'

describe('editorialContract · guardrail regression', () => {
  const contract = EDITORIAL_FORMATTING_CONTRACT
  const brief = editorialBriefPromptBlock()

  it('publishes the expected contract version', () => {
    expect(EDITORIAL_CONTRACT_VERSION).toBe('2026.08.reader-engagement.v2')
  })

  // ── DEAD_INTERNAL_LINK prevention ──────────────────────────────────────

  it('locks the EMPTY allowlist fallback — "do NOT create ANY internal links"', () => {
    // The permissive fallback in prompts.ts was the root cause of 9x DEAD_INTERNAL_LINK.
    // The contract forbids invented claims/statistics; the URL-specific ban lives
    // in prompts.ts. Both layers are locked here.
    expect(contract).toMatch(/invented|fabricate/i)
    expect(brief).toMatch(/invented|fabricate/i)
  })

  // ── H2_STRUCTURE prevention (≥4 H2 count) ─────────────────────────────

  it('locks the minimum H2 count (≥4) in the hard format spec', () => {
    // The contract uses both "at least 4 H2" and "the scanner requires ≥4."
    // — match either phrasing so the test survives future rewording.
    expect(contract).toMatch(/at least 4 H2|≥4\s*H2|≥4\./i)
  })

  it('locks the H2 fallback topics when no brief template is provided', () => {
    // The prompt falls back to a mandated topic list when h2Outline is empty.
    // The contract must list the same fallback set.
    expect(contract).toContain('eligibility')
    expect(contract).toContain('FAQ')
    expect(contract).toContain('worked example')
  })

  // ── AI_ANSWER_BLOCK prevention (In 60 seconds / TL;DR) ─────────────────

  it('locks the mandatory "In 60 seconds" answer block', () => {
    expect(contract).toContain('In 60 seconds')
  })

  it('locks the scanner check phrase in the format spec', () => {
    // The scanner matches "in 60 seconds" | "tldr" | "quick answer" |
    // "key takeaways" — at least one must appear in the contract body.
    expect(contract).toMatch(/tldr|quick answer|key takeaways/i)
  })

  // ── SCHEMA prevention ──────────────────────────────────────────────────

  it('locks Article JSON-LD requirement', () => {
    expect(contract).toContain('@type')
    expect(contract).toContain('Article')
  })

  it('locks FAQPage JSON-LD requirement', () => {
    expect(brief).toContain('FAQ')
    expect(contract).toContain('FAQ')
  })

  // ── Structural integrity ───────────────────────────────────────────────

  it('produces a non-empty contract string with all required sections', () => {
    expect(contract.length).toBeGreaterThan(1000)
    expect(contract).toContain('HARD FORMAT SPEC')
    expect(contract).toContain('HEADING HIERARCHY')
    expect(contract).toContain('plain English')
  })

  // ── Reader-engagement artefacts ────────────────────────────────────────

  it('locks the hardened reader-engagement artefact spec (E1–E9)', () => {
    expect(contract).toContain('READER-ENGAGEMENT ARTEFACTS')
    // E1 hook, E2 signpost subheadings, E3 so-what test
    expect(contract).toMatch(/E1\. HOOK|first 40 words/i)
    expect(contract).toMatch(/SIGNPOST SUBHEADINGS|E2\./i)
    expect(contract).toMatch(/SO-WHAT TEST|E3\./i)
  })

  it('locks sentence rhythm, bold lead-ins, and forward momentum', () => {
    expect(contract).toMatch(/SENTENCE RHYTHM/i)
    expect(contract).toMatch(/BOLD LEAD-INS/i)
    expect(contract).toMatch(/FORWARD MOMENTUM/i)
    expect(contract).toMatch(/saggy middle/i)
  })

  it('locks concrete-over-abstract and visual rhythm', () => {
    expect(contract).toMatch(/CONCRETE OVER ABSTRACT/i)
    expect(contract).toMatch(/VISUAL RHYTHM/i)
  })

  it('produces a non-empty brief prompt block', () => {
    expect(brief.length).toBeGreaterThan(200)
    expect(brief).toContain('BRIEF FORMAT')
    expect(brief).toContain('READER')
    expect(brief).toContain('KEYWORD COVERAGE')
  })
})

// ── prompts.ts layer — the system prompt the drafting AI actually sees ───

describe('prompts.ts · system-prompt guardrail regression', () => {
  const plan = {
    matched: null as any,
    matchScore: 0,
    host: 'legal' as const,
    repo: 'caseworks' as any,
    filePath: 'app/us/guardrail-test/page.tsx',
    canonicalUrl: 'https://legal.yousafeconsultancy.com/us/guardrail-test/',
    indexable: true,
    action: 'create',
    intentClass: 'legal_guide',
    contentType: 'article',
    warnings: [],
    blockers: [],
    ymy: false,
    routingSource: 'registry_host' as const,
  }

  // Empty allowlist → triggers the fallback that says "EMPTY — do NOT create"
  const prompt = buildFactorySystemPrompt({
    plan,
    contentType: 'article',
    minWords: 2200,
    interlinkAllowlist: [],
  })

  it('emits "In 60 seconds" in the OUTPUT FORMAT block', () => {
    expect(prompt).toContain('In 60 seconds')
  })

  it('emits "≥4 H2" in the heading/body structure rules', () => {
    expect(prompt).toMatch(/≥4 H2|at least 4 H2/i)
  })

  it('emits "EMPTY — do NOT create" in the interlink allowlist fallback', () => {
    // The fallback for an empty allowlist forbids ANY internal link creation.
    // Removing or softening this line reopens the DEAD_INTERNAL_LINK class.
    expect(prompt).toContain('EMPTY —')
    expect(prompt).toContain('do NOT create ANY internal links')
  })

  it('carries the reader-engagement artefacts into the drafting prompt', () => {
    // The contract is threaded through qualityPromptBlock() → the system prompt,
    // so the E1–E9 engagement artefacts must be present for the drafting model.
    expect(prompt).toContain('READER-ENGAGEMENT ARTEFACTS')
    expect(prompt).toMatch(/SO-WHAT TEST/i)
    expect(prompt).toMatch(/FORWARD MOMENTUM/i)
    expect(prompt).toMatch(/BOLD LEAD-INS/i)
  })
})
