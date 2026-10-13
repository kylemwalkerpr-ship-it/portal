import { approvalMatchesDecision, approvalQuoteMatchesDecision, validateProviderPricingPreferences } from '@/lib/yqaaProviderControls'

describe('YQAA provider controls', () => {
  const approval = {
    provider_id: 'provider-a', conversation_id: 'conversation-a', request_id: 'request-a',
    version: 2, price_cents: 8400, scope_hash: 'scope-a', gig_id: 'gig-a', status: 'approved', consumed_at: null,
  }
  const decision = {
    status: 'provider_approval_required', providerId: 'provider-a', conversationId: 'conversation-a',
    requestId: 'request-a', version: 2, priceCents: 8400, scopeHash: 'scope-a', gigId: 'gig-a', approval,
  }

  it('accepts only a durable approval for the exact provider, conversation, version, scope, gig, and price', () => {
    expect(approvalMatchesDecision(decision)).toBe(true)
    for (const override of [
      { priceCents: 8401 }, { version: 1 }, { scopeHash: 'scope-b' }, { gigId: 'gig-b' },
      { providerId: 'provider-b' }, { conversationId: 'conversation-b' },
      { approval: { ...approval, consumed_at: '2026-10-13T00:00:00Z' } },
      { approval: { ...approval, status: 'declined' } },
      { status: 'ready' },
    ]) expect(approvalMatchesDecision({ ...decision, ...override })).toBe(false)
  })

  it('recognizes an unchanged pending quote without treating it as approval authority', () => {
    const pending = { ...approval, status: 'pending' }
    expect(approvalQuoteMatchesDecision({ ...decision, approval: pending })).toBe(true)
    expect(approvalMatchesDecision({ ...decision, approval: pending })).toBe(false)
    expect(approvalQuoteMatchesDecision({ ...decision, priceCents: 8401, approval: pending })).toBe(false)
    expect(approvalQuoteMatchesDecision({ ...decision, scopeHash: 'changed', approval: pending })).toBe(false)
  })

  it('allows explicit inheritance and validates provider-owned preference ranges', () => {
    expect(validateProviderPricingPreferences({ flex_pct: 15, auto_accept_pct: 10, approval_band_pct: 35 }).ok).toBe(true)
    expect(validateProviderPricingPreferences({ flex_pct: 10, auto_accept_pct: 15 }).ok).toBe(false)
    expect(validateProviderPricingPreferences({ flex_pct: 40, approval_band_pct: 35 }).ok).toBe(false)
    expect(validateProviderPricingPreferences({ max_auto_concessions: 11 }).ok).toBe(false)
    expect(validateProviderPricingPreferences({ flex_pct: null }).ok).toBe(true)
  })
})
