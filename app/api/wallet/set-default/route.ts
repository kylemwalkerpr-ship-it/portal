/**
 * POST /api/wallet/set-default
 * Body: { cardId }
 */
import { getCurrentStudent } from '@/lib/student'
import { setDefaultCard } from '@/lib/payment-methods'

export async function POST(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const cardId = typeof body.cardId === 'string' ? body.cardId : ''
  if (!cardId) {
    return Response.json({ error: 'Missing cardId' }, { status: 400 })
  }

  try {
    await setDefaultCard(auth.profile.id, cardId)
    return Response.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to set default'
    console.error('[wallet/set-default]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
