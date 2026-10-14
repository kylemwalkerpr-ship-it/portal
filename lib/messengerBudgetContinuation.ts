import type { AdaptivePricingDecision } from '@/lib/yqaaAdaptivePricing'
import type { CompanionDecision } from '@/lib/yqaaCompanionDecision'
import type { PricingAuthority } from '@/lib/messengerPricingAuthority'

/** First benign budget gap: explain the limit, without a quote, discount or claimed human handoff. */
export function firstBudgetLimitExplanation(args: {
  pricing: PricingAuthority; adaptive: AdaptivePricingDecision | null; companion: CompanionDecision | null;
  latestClientText: string; frustrated: boolean; budgetGapAlreadyExplained: boolean; legalEvidenceMissing: boolean; highStakes: boolean;
}): string | null {
  const {pricing, adaptive, companion} = args
  if (!['education', 'academic-writing', 'mentorship'].includes(String(pricing.intent?.categoryId || '')) ||
      pricing.status !== 'budget_too_low' || !pricing.budget || !adaptive || adaptive.channel !== 'dm' ||
      adaptive.recommended_action !== 'HOLD_VALUE' || adaptive.eligible_actions.length !== 1 || adaptive.eligible_actions[0] !== 'HOLD_VALUE' ||
      adaptive.approval_required || adaptive.approved_price_cents || adaptive.downscope_options.length ||
      adaptive.scope.depth === 'unknown' || args.frustrated || args.budgetGapAlreadyExplained ||
      args.legalEvidenceMissing || args.highStakes || !companion || companion.escalate || companion.posture === 'HANDOFF_SUPPORT' ||
      /\b(?:ask|contact|request|speak|talk|review personally|human|personally)\b[^.!?]{0,60}\b(?:provider|human|review)\b/i.test(args.latestClientText)) return null
  const currency = pricing.budget.currency.toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(pricing.budget.maxCents) || pricing.budget.maxCents <= 0) return null
  const amount = (pricing.budget.maxCents / 100).toFixed(2)
  return `I understand your maximum is ${currency} ${amount}. I can’t offer the full paid work at that amount. You can keep organizing your documents yourself, revise the budget, or ask the provider to discuss other options. If you’d like me to ask them, just say so. I haven’t requested their review yet.`
}
