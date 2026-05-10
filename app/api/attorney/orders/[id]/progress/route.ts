import { requireAttorney } from '@/lib/attorneyAuth'

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params
  let body: { progress?: number; status?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.progress != null) {
    const n = Number(body.progress)
    if (!Number.isFinite(n) || n < 0 || n > 100) return Response.json({ error: 'progress must be 0–100.' }, { status: 400 })
    update.progress = Math.round(n)
  }
  if (body.status === 'review') update.status = 'review'
  if (Object.keys(update).length === 0) return Response.json({ error: 'Nothing to update.' }, { status: 400 })

  const { data: order, error: updErr } = await ctx.db
    .from('orders')
    .update(update)
    .eq('id', id)
    .eq('consultant_id', ctx.profileId)
    .select('id, status, progress')
    .single()
  if (updErr || !order) return Response.json({ error: updErr?.message || 'Could not update.' }, { status: 500 })
  return Response.json({ order })
}
