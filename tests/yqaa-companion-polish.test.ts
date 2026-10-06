/**
 * Companion polish stage (rules only): leak scrub, stale-number scrub,
 * posture check, includes append and duplicate → escalate.
 */
import {
  COMPANION_LEAK_PATTERNS,
  extractReplyAmountsCents,
  leaksCompanionPricingLanguage,
  polishCompanionReply,
  polishWithRegeneration,
  safeApprovedPriceTemplate,
} from '@/lib/yqaaCompanionPolish'
import { lowBudgetEscalationReply } from '@/lib/messengerPricingAuthority'

const APPROVED = 15_000
const ALLOWED = [15_000, 10_000, 40_000]

describe('companion polish — leak scrub', () => {
  test('flags every internal-pricing leak shape', () => {
    const leaks = [
      'The floor for this scope is $250.',
      'My minimum I can send is $180.',
      'The band allows 15% off for this scope.',
      'That is below the Marketplace average.',
      'The reference mean is $300, so $250 is revenue-safe.',
      'My hourly rate for this work is $250.',
      'The complexity multiplier pushed the weighted score up.',
    ]
    for (const text of leaks) expect(leaksCompanionPricingLanguage(text)).toBe(true)
    expect(leaksCompanionPricingLanguage('Happy to narrow this down so it fits your budget 🙂')).toBe(false)
    // Word boundaries keep legitimate prose clean.
    expect(leaksCompanionPricingLanguage('Your husband can be the sponsor on this application.')).toBe(false)
    expect(COMPANION_LEAK_PATTERNS.length).toBeGreaterThan(5)
  })

  test('a leaking draft asks for one regeneration, then falls back to the approved-number template', () => {
    const draft = 'The floor for this scope is $250, so I can do $200.'
    const first = polishCompanionReply({ reply: draft, allowedAmountsCents: ALLOWED, approvedPriceCents: APPROVED })
    expect(first.action).toBe('regenerate')
    expect(first.reasons).toContain('internal_pricing_language')

    const second = polishCompanionReply({
      reply: draft,
      allowedAmountsCents: ALLOWED,
      approvedPriceCents: APPROVED,
      includes: ['30-minute call'],
      regenerated: true,
    })
    expect(second.action).toBe('fallback_template')
    expect(second.reply).toContain('$150')
    expect(second.reply.toLowerCase()).not.toContain('floor')
    expect(second.reply).not.toContain('$250')
    expect(leaksCompanionPricingLanguage(second.reply)).toBe(false)
  })

  test('the approved-number template only ever states the approved figure', () => {
    const template = safeApprovedPriceTemplate({ approvedPriceCents: 15_000, includes: ['30-minute call'] })
    expect(extractReplyAmountsCents(template)).toEqual([15_000])
    expect(leaksCompanionPricingLanguage(template)).toBe(false)
  })
})

describe('companion polish — stale-number scrub', () => {
  test('every currency amount must be in the server-allowed set', () => {
    expect(extractReplyAmountsCents('I can do $150 or 150 dollars, and your $400 budget works.')).toEqual([15_000, 15_000, 40_000])
    const clean = polishCompanionReply({
      reply: 'I can put this together for $150 for the smaller scope.',
      allowedAmountsCents: ALLOWED,
      approvedPriceCents: APPROVED,
    })
    expect(clean.action).toBe('none')
  })

  test('a stale figure is rejected, then replaced with the approved number', () => {
    const draft = 'The original figure was $812, but let us keep talking.'
    const first = polishCompanionReply({ reply: draft, allowedAmountsCents: ALLOWED, approvedPriceCents: APPROVED })
    expect(first.action).toBe('regenerate')
    expect(first.reasons.join(' ')).toContain('unapproved_amount')

    const second = polishCompanionReply({
      reply: draft,
      allowedAmountsCents: ALLOWED,
      approvedPriceCents: APPROVED,
      includes: ['Pathway overview'],
      regenerated: true,
    })
    expect(second.action).toBe('fallback_template')
    expect(second.reply).not.toContain('812')
    expect(second.reply).toContain('$150')
  })

  test('with no approved number the offending sentence is dropped', () => {
    const result = polishCompanionReply({
      reply: 'I can do $150 for that. The old quote was $812 though.',
      allowedAmountsCents: [15_000],
      approvedPriceCents: null,
      regenerated: true,
    })
    expect(result.action).toBe('fallback_template')
    expect(result.reply).not.toMatch(/812/)
    expect(result.reply).toContain('150')
  })

  test('a duplicate of a prior YQAA reply forces an escalation handoff', () => {
    const previous = 'Thanks for sharing all of that context about your application timeline and goals. Here is what usually matters most for this pathway with the documents you described.'
    const result = polishCompanionReply({
      reply: previous,
      previousAiBodies: [previous],
      allowedAmountsCents: ALLOWED,
      approvedPriceCents: APPROVED,
      escalationReply: lowBudgetEscalationReply('Provider One'),
    })
    expect(result.action).toBe('force_escalation')
    expect(result.escalate).toBe(true)
    expect(result.reply).toContain('Provider One')
  })
})

describe('companion polish — posture + includes', () => {
  test('EDUCATE must not open with a budget interrogation', () => {
    const reply = 'What budget range are you working with in USD? Once I know that I can map the pathways and documents that matter for your case.'
    const result = polishCompanionReply({ reply, posture: 'EDUCATE', allowedAmountsCents: ALLOWED })
    expect(result.action).toBe('strip_budget_ask')
    expect(result.reply.toLowerCase()).not.toContain('budget range')
    expect(result.reply).toContain('pathways')
  })

  test('DISCOVER may still ask clarifying questions that are not about money', () => {
    const reply = 'Which country are you applying from, and do you already have your sponsor documents?'
    const result = polishCompanionReply({ reply, posture: 'DISCOVER' })
    expect(result.action).toBe('none')
  })

  test('a reduced-price reply gets the includes appended', () => {
    const result = polishCompanionReply({
      reply: 'I can do this smaller scope for $150.',
      allowedAmountsCents: ALLOWED,
      approvedPriceCents: APPROVED,
      includes: ['30-minute orientation call', 'Document checklist'],
    })
    expect(result.action).toBe('append_includes')
    expect(result.reply).toContain('What that includes')
    expect(result.reply).toContain('Document checklist')
  })
})

describe('companion polish — regeneration pipeline', () => {
  test('uses the regenerated draft when it is clean', async () => {
    const result = await polishWithRegeneration(
      {
        reply: 'The floor for this scope is $250.',
        allowedAmountsCents: ALLOWED,
        approvedPriceCents: APPROVED,
      },
      () => 'I can put this together for $150 for the smaller scope.',
    )
    expect(result.action).toBe('none')
    expect(result.reply).toContain('$150')
  })

  test('falls back to the template when regeneration fails', async () => {
    const result = await polishWithRegeneration(
      {
        reply: 'Our band allows 15% off, so $250 it is.',
        allowedAmountsCents: ALLOWED,
        approvedPriceCents: APPROVED,
      },
      () => null,
    )
    expect(result.action).toBe('fallback_template')
    expect(result.reply).toContain('$150')
    expect(leaksCompanionPricingLanguage(result.reply)).toBe(false)
  })
})
