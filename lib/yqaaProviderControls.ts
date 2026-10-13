export type YqaaProviderPricingPreferences = {
  negotiation_enabled: boolean
  auto_accept_pct: number | null
  flex_pct: number | null
  approval_band_pct: number | null
  max_auto_concessions: number | null
  prefer_accept: boolean
}

export const DEFAULT_YQAA_PROVIDER_PRICING_PREFERENCES: YqaaProviderPricingPreferences = {
  negotiation_enabled: true,
  auto_accept_pct: null,
  flex_pct: null,
  approval_band_pct: null,
  max_auto_concessions: null,
  prefer_accept: false,
}

export function validateProviderPricingPreferences(value: unknown):
  | { ok: true; value: YqaaProviderPricingPreferences }
  | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Preferences must be an object.' }
  const input = value as Record<string, unknown>
  const pct = (key: string): number | null | undefined => {
    if (!(key in input)) return undefined
    if (input[key] === null || input[key] === '') return null
    const n = Number(input[key])
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN
  }
  const integer = (key: string): number | null | undefined => {
    if (!(key in input)) return undefined
    if (input[key] === null || input[key] === '') return null
    const n = Number(input[key])
    return Number.isInteger(n) && n >= 0 && n <= 10 ? n : NaN
  }
  const auto = pct('auto_accept_pct')
  const flex = pct('flex_pct')
  const approval = pct('approval_band_pct')
  const concessions = integer('max_auto_concessions')
  if ([auto, flex, approval].some(Number.isNaN) || Number.isNaN(concessions)) {
    return { ok: false, error: 'Percent values must be from 0 to 100 and concessions from 0 to 10.' }
  }
  const result: YqaaProviderPricingPreferences = {
    ...DEFAULT_YQAA_PROVIDER_PRICING_PREFERENCES,
    negotiation_enabled: typeof input.negotiation_enabled === 'boolean' ? input.negotiation_enabled : true,
    auto_accept_pct: auto === undefined ? null : auto,
    flex_pct: flex === undefined ? null : flex,
    approval_band_pct: approval === undefined ? null : approval,
    max_auto_concessions: concessions === undefined ? null : concessions,
    prefer_accept: typeof input.prefer_accept === 'boolean' ? input.prefer_accept : false,
  }
  if (result.auto_accept_pct !== null && result.flex_pct !== null && result.auto_accept_pct > result.flex_pct) {
    return { ok: false, error: 'Auto-accept must be less than or equal to the flex limit.' }
  }
  if (result.flex_pct !== null && result.approval_band_pct !== null && result.flex_pct > result.approval_band_pct) {
    return { ok: false, error: 'Flex limit must be less than or equal to the approval band.' }
  }
  return { ok: true, value: result }
}

export function approvalMatchesDecision(input: {
  status: string
  providerId: string
  conversationId: string
  requestId: string
  version: number
  priceCents: number
  scopeHash: string
  gigId: string | null
  approval: any
}): boolean {
  const a = input.approval
  return Boolean(a && a.status === 'approved'
    && !a.consumed_at
    && input.status === 'provider_approval_required'
    && approvalQuoteMatchesDecision(input))
}

export function approvalQuoteMatchesDecision(input: {
  providerId: string
  conversationId: string
  requestId: string
  version: number
  priceCents: number
  scopeHash: string
  gigId: string | null
  approval: any
}): boolean {
  const a = input.approval
  return Boolean(a
    && a.provider_id === input.providerId
    && a.conversation_id === input.conversationId
    && a.request_id === input.requestId
    && Number(a.version) === input.version
    && Number(a.price_cents) === input.priceCents
    && a.scope_hash === input.scopeHash
    && (a.gig_id || null) === input.gigId)
}
