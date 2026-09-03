/**
 * Brief-contract regression suite (2026-08):
 *  1. The drafting prompt carries the canonical word-count window for the
 *     content type (min–max, target) — no hardcoded "1,800+" floor that
 *     under-specs legal guides or lets 3,000-word pages ship.
 *  2. The system prompt enumerates the SHIP GATES before writing begins so
 *     the model clears hurdles in the first pass instead of failing the
 *     audit and forcing full-article rewrites.
 *  3. Refine passes are surgical: "do NOT regenerate the whole article" —
 *     fixes target only the flagged issues.
 *  4. Depth-expand / append prompts carry a HARD MAX so rescue passes stop
 *     at the ceiling.
 *  5. Baseten GLM 5.2 Fast is a first-class provider pin.
 */
import { listConfiguredContentProviders, resolveAiProviderPin } from '@/lib/contentAiProvider'
import {
  auditToRefineNotes,
  buildDepthAppendPrompt,
  buildDepthExpandPrompt,
  buildFactorySystemPrompt,
  buildFactoryUserPrompt,
} from '@/lib/seoFactory/prompts'

function systemPrompt(contentType: string) {
  return buildFactorySystemPrompt({
    plan: {
      host: 'legal.yousafeconsultancy.com',
      repo: 'caseworks',
      filePath: 'app/us/test/page.tsx',
      canonicalUrl: 'https://legal.yousafeconsultancy.com/us/test/',
      routingSource: 'registry',
      intentClass: 'informational',
      action: 'create',
      indexable: true,
    } as never,
    contentType,
    minWords: 2200,
  })
}

describe('brief contract · word count is canonical, not hardcoded', () => {
  it('legal guide prompt states 2200–2800 body words (target 2500) and rejects overshoot', () => {
    const prompt = buildFactoryUserPrompt({
      title: 'H-1B visa explained',
      topic: 'H-1B visa',
      primaryKeyword: 'h-1b visa requirements',
      region: 'US',
      contentType: 'legal_guide',
      tone: 'educational',
      gscBlock: 'GSC: none',
    })
    expect(prompt).toMatch(/LENGTH \(legal guide \/ article/)
    expect(prompt).toContain('2200–2800 body words')
    expect(prompt).toContain('target ~2500')
    expect(prompt).toContain('BOTH under 2200 (thin) and over 2800 (bloated) are rejected')
    // The old hardcoded floor that under-specified guides must be gone.
    expect(prompt).not.toContain('1,800+')
  })

  it('blog prompt carries the blog window (800–1500), not the legal-guide window', () => {
    const prompt = buildFactoryUserPrompt({
      title: 'Banking in Canada for students',
      topic: 'banking canada students',
      primaryKeyword: 'student bank account canada',
      region: 'CA',
      contentType: 'blog_post',
      tone: 'conversational',
      gscBlock: 'GSC: none',
    })
    expect(prompt).toMatch(/LENGTH \(blog \/ news summary/)
    expect(prompt).toContain('800–1500 body words')
    expect(prompt).toContain('target ~1200')
    expect(prompt).not.toContain('2200–2800')
  })

  it('regional page prompt carries 1200–2000 (target 1500)', () => {
    const prompt = buildFactoryUserPrompt({
      title: 'Student visas in Texas',
      topic: 'texas student visas',
      primaryKeyword: 'texas student visa',
      region: 'US',
      contentType: 'regional_page',
      tone: 'educational',
      gscBlock: 'GSC: none',
    })
    expect(prompt).toContain('1200–2000 body words')
    expect(prompt).toContain('target ~1500')
  })
})

describe('brief contract · SHIP GATES are prescriptive before drafting', () => {
  it('system prompt lists every hard gate so the model clears hurdles on pass one', () => {
    const sys = systemPrompt('legal_guide')
    expect(sys).toMatch(/SHIP GATES — pass ALL of these before you submit/)
    expect(sys).toMatch(/DEPTH: 2200–2800 body words \(target ~2500\)/)
    expect(sys).toMatch(/≥4 H2 sections/)
    expect(sys).toMatch(/In 60 seconds/)
    expect(sys).toMatch(/Article JSON-LD AND FAQPage JSON-LD/)
    expect(sys).toMatch(/140–160 chars/)
    expect(sys).toMatch(/at least 2 internal estate links taken VERBATIM/)
    expect(sys).toMatch(/ZERO invented, guessed, or modified URLs/)
    expect(sys).toMatch(/every short keyword appears ≥1× and ≤4×/)
    expect(sys).toMatch(/no AI clichés, no outcome promises/)
  })
})

describe('brief contract · refine passes are surgical, not full rewrites', () => {
  it('REVISION REQUIRED explicitly forbids regenerating the whole article', () => {
    const prompt = buildFactoryUserPrompt({
      title: 'H-1B visa explained',
      topic: 'H-1B visa',
      primaryKeyword: 'h-1b visa requirements',
      region: 'US',
      contentType: 'legal_guide',
      tone: 'educational',
      gscBlock: 'GSC: none',
      refineNotes: 'BLOCKER [outcome_promise]: remove affirmative promises.',
      draft: '# H-1B visa\n\n## Eligibility\n\nBody text.',
    })
    expect(prompt).toMatch(/REVISION REQUIRED — SURGICAL FIXES ONLY/)
    expect(prompt).toMatch(/do NOT regenerate the whole article/)
    expect(prompt).toMatch(/edit the smallest affected text/)
    // The old instruction demanded a complete rewrite — that phrasing is gone.
    expect(prompt).not.toMatch(/complete rewrite \(must stay as long or longer\)/)
  })

  it('auditToRefineNotes adds a hard over-length blocker when the draft exceeds max', () => {
    const notes = auditToRefineNotes({
      blockers: [],
      warnings: [],
      wordCount: 3100,
      score: 70,
      minWords: 2200,
      targetWords: 2500,
      maxWords: 2800,
    })
    expect(notes).toContain('HARD MAX 2800')
    expect(notes).toMatch(/BLOCKER OVER-LENGTH: Draft is 3100 words/)
    expect(notes).toMatch(/between 2200 and 2800 words/)
    expect(notes).toMatch(/Do NOT add new sections; tighten what exists/)
  })
})

describe('brief contract · depth rescue respects the ceiling', () => {
  it('buildDepthExpandPrompt warns against exceeding the hard max', () => {
    const prompt = buildDepthExpandPrompt({
      title: 'H-1B visa',
      topic: 'H-1B visa',
      primaryKeyword: 'h-1b visa',
      region: 'US',
      contentType: 'legal_guide',
      minWords: 2200,
      targetWords: 2500,
      maxWords: 2800,
      currentWords: 1800,
      draft: '# H-1B visa\n\nBody.',
    })
    expect(prompt).toContain('HARD MAXIMUM: 2800 body words')
    expect(prompt).toContain('the audit ALSO rejects bloated pages over the cap')
    expect(prompt).toMatch(/do not overshoot into 2800\+ territory/)
  })

  it('buildDepthAppendPrompt carries the full-page ceiling so appends do not balloon past max', () => {
    const prompt = buildDepthAppendPrompt({
      primaryKeyword: 'h-1b visa',
      region: 'US',
      minWords: 2200,
      maxWords: 2800,
      currentWords: 2000,
      existingH2s: ['Eligibility', 'Application'],
      draftExcerpt: 'Body.',
    })
    expect(prompt).toContain('HARD CEILING: the FULL page must stay at or under 2800 body words')
    expect(prompt).toMatch(/if current \+ new would exceed 2800/)
  })

  it('append prompt without maxWords stays backward-compatible (no ceiling clause)', () => {
    const prompt = buildDepthAppendPrompt({
      primaryKeyword: 'h-1b visa',
      region: 'US',
      minWords: 1200,
      currentWords: 900,
      existingH2s: ['Eligibility'],
      draftExcerpt: 'Body.',
    })
    expect(prompt).not.toContain('HARD CEILING')
  })
})
