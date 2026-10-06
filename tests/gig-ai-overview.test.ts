import {
  AI_OVERVIEW_MAX_CHARS,
  AI_OVERVIEW_MIN_CHARS,
  buildGigAiOverviewSystemPrompt,
  buildGigAiOverviewUserPrompt,
  gigAiOverviewQualityIssues,
  isValidGigAiOverview,
  resolveGigOverviewText,
  sanitizeGigAiOverview,
} from '../lib/gigAiOverview'

describe('gig curated AI overview contract', () => {
  test('strips bolted Summary/Overview labels and normalizes prose', () => {
    const raw = 'Summary: You need a final proofread before submission.\n- Grammar only\n- No rewriting'
    const cleaned = sanitizeGigAiOverview(raw)
    expect(cleaned.startsWith('Summary:')).toBe(false)
    expect(cleaned).toContain('You need a final proofread before submission.')
    expect(cleaned).toContain('Grammar only')
    expect(cleaned).not.toMatch(/^[-*]/m)
  })

  test('rejects too-short or labeled leftovers', () => {
    expect(isValidGigAiOverview('Too short')).toBe(false)
    expect(isValidGigAiOverview('x'.repeat(AI_OVERVIEW_MIN_CHARS - 1))).toBe(false)
    expect(isValidGigAiOverview('x'.repeat(AI_OVERVIEW_MAX_CHARS + 1))).toBe(false)
  })

  test('accepts a real curated overview length', () => {
    const prose =
      'You need a careful final pass on a thesis or dissertation before submission — grammar, spelling, punctuation, and consistency, without rewriting your argument. You get a tracked-changes proofread plus a short consistency note scoped to academic manuscripts.'
    expect(isValidGigAiOverview(prose)).toBe(true)
    expect(gigAiOverviewQualityIssues(prose)).toEqual([])
  })

  test('flags provider mini-bio openings that used to ship as fake AI summaries', () => {
    const bad =
      'I am a US attorney admitted in New York. I check the Form I-765 you prepared for post-completion OPT against the USCIS instructions and your I-20, then send an annotated form and a correction checklist for filing.'
    expect(gigAiOverviewQualityIssues(bad)).toContain('opens as provider mini-bio')
  })

  test('public resolver uses ai_overview only — never pitch/seo_description fallback', () => {
    expect(
      resolveGigOverviewText({
        ai_overview: null,
        pitch: 'I am a New York immigration attorney. I review your F-1 reinstatement packet.',
        seo_description: 'F-1 reinstatement review for SEVIS termination cases.',
      }),
    ).toBe('')

    const overview =
      'You need to decide whether F-1 reinstatement is the right next step after a SEVIS termination — and what the written packet should explain. You get a focused written assessment of your facts, required documents, and the argument your file still needs to make.'
    expect(
      resolveGigOverviewText({
        ai_overview: overview,
        pitch: 'I am a New York immigration attorney.',
        seo_description: 'meta',
      }),
    ).toBe(sanitizeGigAiOverview(overview))
  })

  test('prompt contract forbids bolted summary style and provider mini-bios', () => {
    const system = buildGigAiOverviewSystemPrompt('attorney')
    expect(system).toContain('standalone curated overview')
    expect(system).toContain('Never open with provider identity')
    expect(system).toContain('no "Summary:"')

    const user = buildGigAiOverviewUserPrompt({
      title: 'I will review your I-765 OPT application',
      pitch: 'I am a US attorney admitted in New York.',
      description: 'Most OPT delays come from avoidable errors on Form I-765.',
      provider_type: 'attorney',
      jurisdiction: 'us',
      tiers: [{ tier: 'basic', title: 'Form check', price: 14900, delivery_days: 3, is_active: true, features: ['Annotated form'] }],
    })
    expect(user).toContain('Pitch (card field — do not copy as overview)')
    expect(user).toContain('Long description (source of truth)')
    expect(user).toContain('Active packages')
  })
})
