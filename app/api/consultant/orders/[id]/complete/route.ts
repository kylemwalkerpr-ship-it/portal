import { getCurrentConsultant } from '@/lib/consultant'
import { releaseEarningsForOrder } from '@/lib/earnings'

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data: order } = await auth.db
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('consultant_id', auth.profile.id)
    .single()

  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

  let { data, error } = await auth.db
    .from('orders')
    .update({ status: 'completed', escrow_status: 'released', completed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('consultant_id', auth.profile.id)
    .select('*')
    .single()

  if (error && /completed_at/i.test(error.message)) {
    const retry = await auth.db
      .from('orders')
      .update({ status: 'completed', escrow_status: 'released' })
      .eq('id', id)
      .eq('consultant_id', auth.profile.id)
      .select('*')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) return Response.json({ error: error.message }, { status: 500 })

  let earningsReleased: any[] = []
  try {
    earningsReleased = await releaseEarningsForOrder(id)
  } catch (e) { console.error('[consultant/orders/complete] releaseEarningsForOrder failed:', e) }

  return Response.json({ order: data, earningsReleased })
}
