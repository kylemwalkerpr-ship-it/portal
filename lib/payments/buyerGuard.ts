import { parsePaymentSettingsOwnerIds } from './adminSettings'

export type BuyerGuardContext = { profileId: string; role: string }
export type BuyerGuardResult = { error: 'Unauthorized' | 'Buyer account required'; status: 401 | 403 } | null
type BuyerGuardEnv = { PAYMENT_TEST_BUYER_IDS?: string; PAYMENT_SETTINGS_OWNER_IDS?: string }

export function guardBuyer(context: BuyerGuardContext | null | undefined, env: BuyerGuardEnv = process.env as BuyerGuardEnv): BuyerGuardResult {
  if (!context?.profileId) return { error: 'Unauthorized', status: 401 }
  const allowedIds = new Set([
    ...String(env.PAYMENT_TEST_BUYER_IDS || '').split(',').map((id) => id.trim().toLowerCase()).filter(Boolean),
    ...parsePaymentSettingsOwnerIds(env.PAYMENT_SETTINGS_OWNER_IDS || ''),
  ])
  if (context.role === 'client' || context.role === 'student' || allowedIds.has(context.profileId.toLowerCase())) return null
  return { error: 'Buyer account required', status: 403 }
}
