import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

async function canAccessChat(auth: any, chatId: string) {
  const { data: inquiry } = await auth.db
    .from('inquiries')
    .select('id, client_profile_id, email, target_attorney_profile_id')
    .eq('id', chatId)
    .maybeSingle()
  if (inquiry) {
    if (auth.role === 'admin') return true
    if (auth.role === 'client') return inquiry.client_profile_id === auth.profileId || inquiry.email === auth.profile.email
    if (auth.role === 'attorney') return inquiry.target_attorney_profile_id === auth.profileId || !inquiry.target_attorney_profile_id
  }

  const { data: order } = await auth.db
    .from('orders')
    .select('id, client_id, consultant_id')
    .eq('id', chatId)
    .maybeSingle()
  if (order) {
    if (auth.role === 'admin') return true
    return order.client_id === auth.profileId || order.consultant_id === auth.profileId
  }

  return false
}

export async function GET(_req: Request, context: { params: Promise<{ chatId: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { chatId } = await context.params
  const allowed = await canAccessChat(auth, chatId)
  if (!allowed) return fail('Forbidden.', 403)

  const { data: offers, error } = await auth.db
    .from('offers')
    .select('*, files:offer_files(*)')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

  if (error) return fail(error.message, 500)
  return ok({ offers: offers ?? [] })
}
