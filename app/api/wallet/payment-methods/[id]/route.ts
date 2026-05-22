/**
 * DELETE /api/wallet/payment-methods/{id}
 * Removes a saved card from NMI vault and the local database.
 */
import { getCurrentStudent } from '@/lib/student'
import { removeCard } from '@/lib/payment-methods'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) {
    return Response.json({ error: 'Missing card ID' }, { status: 400 })
  }

  try {
    await removeCard(auth.profile.id, id)
    return Response.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to remove card'
    console.error('[wallet/payment-methods DELETE]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
