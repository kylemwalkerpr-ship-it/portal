import { getCurrentConsultant } from '@/lib/consultant'

function dollarsFromCents(cents: unknown) {
  return Number(cents || 0) / 100
}

export async function GET() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { db, profile, consultant } = auth

  const [ordersRes, itemsRes, servicesRes, profilesRes] = await Promise.all([
    db.from('orders').select('*').eq('consultant_id', profile.id).order('created_at', { ascending: false }),
    db.from('order_items').select('*'),
    db.from('services').select('*'),
    db.from('profiles').select('id, email, full_name, country'),
  ])

  const error = ordersRes.error || itemsRes.error || servicesRes.error || profilesRes.error
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const itemsByOrder = new Map((itemsRes.data ?? []).map(item => [item.order_id, item]))
  const serviceById = new Map((servicesRes.data ?? []).map(service => [service.id, service]))
  const profileById = new Map((profilesRes.data ?? []).map(p => [p.id, p]))

  const orders = (ordersRes.data ?? []).map(order => {
    const item = itemsByOrder.get(order.id)
    const service = serviceById.get(item?.service_id)
    const student = profileById.get(order.client_id)
    const payoutCents = Number(order.consultant_payout_amount || Math.round(Number(order.total_amount || 0) * 80))
    return {
      id: order.id,
      service: service?.title || 'Service unavailable',
      student: student?.full_name || student?.email || 'Unknown student',
      country: student?.country || '—',
      status: order.status === 'queued' ? 'pending' : order.status || 'pending',
      date: order.created_at ? new Date(order.created_at).toLocaleDateString() : '—',
      deadline: '—',
      progress: order.status === 'completed' ? 100 : order.status === 'active' ? 50 : 0,
      earn: `$${dollarsFromCents(payoutCents).toFixed(2)}`,
      payoutStatus: order.payout_status || 'pending',
      consultantPayoutAmount: payoutCents,
      documents: [],
    }
  })

  return Response.json({
    consultant: {
      name: profile.full_name || consultant.full_name || consultant.name || 'Consultant',
      email: profile.email || consultant.email || '',
      bio: consultant.bio || '',
      stripeOnboardingComplete: Boolean(consultant.stripe_onboarding_complete ?? consultant.stripeOnboardingComplete),
    },
    orders,
  })
}
