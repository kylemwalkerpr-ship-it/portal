import { requireClient } from '@/lib/clientAuth'
import { computePlatformFeeCents, getPaymentSettingsForApi } from '@/lib/fiverr'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })
  const { id } = await context.params

  const { data: chat } = await ctx.db
    .from('inquiries')
    .select('id, email, client_profile_id, target_attorney_profile_id, source, status, created_at, updated_at')
    .eq('id', id)
    .single()
  if (!chat || chat.source !== 'portal_attorney_chat') return Response.json({ error: 'Chat not found.' }, { status: 404 })
  if (chat.client_profile_id !== ctx.profileId && chat.email !== ctx.email) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  const [{ data: messages }, { data: offers }, { data: unifiedOffers }, { data: attorneyProfile }, { data: attorney }, settings] = await Promise.all([
    ctx.db.from('inquiry_messages').select('id, sender_role, sender_profile_id, body, created_at').eq('inquiry_id', id).order('created_at', { ascending: true }),
    ctx.db.from('attorney_offers').select('id, title, description, price, platform_fee, platform_fee_percent_snapshot, currency, delivery_days, status, expires_at, decided_at, order_id, created_at').eq('inquiry_id', id).order('created_at', { ascending: false }),
    ctx.db.from('offers').select('*').eq('chat_id', id).eq('recipient_id', ctx.profileId).order('created_at', { ascending: false }),
    ctx.db.from('profiles').select('id, full_name, email').eq('id', chat.target_attorney_profile_id).maybeSingle(),
    ctx.db.from('attorneys').select('profile_id, headshot_url, available').eq('profile_id', chat.target_attorney_profile_id).maybeSingle(),
    getPaymentSettingsForApi(),
  ])

  return Response.json({
    chat: {
      id: chat.id,
      attorney_profile_id: chat.target_attorney_profile_id,
      attorney_name: attorneyProfile?.full_name || 'Attorney',
      attorney_email: attorneyProfile?.email || '',
      headshot_url: attorney?.headshot_url || null,
      presence: attorney?.available === false ? 'offline' : 'online',
      last_seen: attorney?.available === false ? chat.updated_at || chat.created_at : null,
      status: chat.status,
    },
    messages: messages ?? [],
    offers: [
      ...((unifiedOffers ?? []).map((o) => {
        const effectivePrice = Number(o.discounted_price || o.price || 0)
        const platformFee = computePlatformFeeCents(effectivePrice, 'attorney', settings)
        return {
        id: o.id,
        source_type: 'unified_offer',
        title: o.title,
        description: o.description,
        original_price: Number(o.price || 0) / 100,
        price: effectivePrice / 100,
        platform_fee: platformFee / 100,
        platform_fee_percent_snapshot: settings.attorney_platform_fee_percent,
        currency: o.currency,
        delivery_days: o.delivery_days,
        revision_count: o.revisions,
        status: o.status === 'pending' ? 'sent' : o.status === 'cancelled' ? 'withdrawn' : o.status,
        expires_at: o.expires_at,
        created_at: o.created_at,
        }
      })),
      ...((offers ?? []).map((o) => ({ ...o, source_type: 'attorney_offer' }))),
    ],
  })
}
