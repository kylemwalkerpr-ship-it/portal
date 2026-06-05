/**
 * lib/attachments.ts
 *
 * Cross-party entitlement checks for attachments living on shared
 * domain rows (orders, inquiries, conversations). These checks run
 * BEFORE we touch storage -- if the caller fails the check, we 403
 * without revealing whether the row exists.
 *
 * Keep these helpers small and side-effect-free. They take the admin
 * client (service role, RLS-bypassing) because the routes that call
 * them have already authenticated the caller via portal/student/
 * consultant/attorney auth helpers.
 */
import type { StorageDb } from './documentStorage'

export type Role = 'admin' | 'client' | 'student' | 'consultant' | 'attorney' | 'support' | string

export type AccessCheck = {
  allowed: boolean
  /** When false, the reason for the denial. Never leaked to the caller. */
  reason?: string
}

/**
 * Orders: client/consultant/attorney named on the row, plus admins.
 * "Attorney" is included for cases where the order originated from
 * an inquiry that an attorney claimed.
 */
export async function canAccessOrderAttachment(
  db: StorageDb,
  params: { orderId: string; profileId: string; role: Role },
): Promise<AccessCheck> {
  if (params.role === 'admin' || params.role === 'support') {
    return { allowed: true }
  }
  const { data: order } = await db
    .from('orders')
    .select('id, client_id, consultant_id, attorney_id')
    .eq('id', params.orderId)
    .maybeSingle()
  if (!order) return { allowed: false, reason: 'not_found' }
  const allowed =
    order.client_id === params.profileId ||
    order.consultant_id === params.profileId ||
    (order as any).attorney_id === params.profileId
  return allowed ? { allowed: true } : { allowed: false, reason: 'not_party' }
}

/**
 * Inquiries: the client who created it OR the attorney targeted /
 * claiming it, plus admins.
 */
export async function canAccessInquiryAttachment(
  db: StorageDb,
  params: { inquiryId: string; profileId: string; role: Role; email?: string },
): Promise<AccessCheck> {
  if (params.role === 'admin' || params.role === 'support') {
    return { allowed: true }
  }
  // Some columns are conditional on which migrations have run -- pick a
  // broad SELECT and tolerate missing columns. Schema-mismatch errors
  // fall through to a deny.
  const { data: inquiry, error } = await db
    .from('inquiries')
    .select('id, client_profile_id, email, target_attorney_profile_id, claimed_by_attorney_id')
    .eq('id', params.inquiryId)
    .maybeSingle()
  if (error || !inquiry) return { allowed: false, reason: 'not_found' }

  if (params.role === 'client' || params.role === 'student') {
    const byProfile = inquiry.client_profile_id === params.profileId
    const byEmail = !!params.email && inquiry.email && inquiry.email.toLowerCase() === params.email.toLowerCase()
    return byProfile || byEmail
      ? { allowed: true }
      : { allowed: false, reason: 'not_party' }
  }
  if (params.role === 'attorney') {
    const t = (inquiry as any).target_attorney_profile_id
    const c = (inquiry as any).claimed_by_attorney_id
    return t === params.profileId || c === params.profileId
      ? { allowed: true }
      : { allowed: false, reason: 'not_party' }
  }
  return { allowed: false, reason: 'wrong_role' }
}

/**
 * Conversations: caller is one of the two participants.
 */
export async function canAccessConversationAttachment(
  db: StorageDb,
  params: { conversationId: string; profileId: string; role: Role },
): Promise<AccessCheck> {
  if (params.role === 'admin') return { allowed: true }
  const { data: conv } = await db
    .from('conversations')
    .select('participant_a, participant_b')
    .eq('id', params.conversationId)
    .maybeSingle()
  if (!conv) return { allowed: false, reason: 'not_found' }
  return conv.participant_a === params.profileId || conv.participant_b === params.profileId
    ? { allowed: true }
    : { allowed: false, reason: 'not_participant' }
}
