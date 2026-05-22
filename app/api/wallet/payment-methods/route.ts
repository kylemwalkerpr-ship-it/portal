/**
 * GET  /api/wallet/payment-methods  → list saved cards
 * POST /api/wallet/payment-methods  → vault a new card (token from Collect.js)
 */
import { getCurrentStudent } from '@/lib/student'
import { listCards, addCard } from '@/lib/payment-methods'

export async function GET() {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  try {
    const cards = await listCards(auth.profile.id)
    return Response.json({
      cards: cards.map(c => ({
        id: c.id,
        vault_id: c.vault_id,
        brand: c.brand ?? 'card',
        last4: c.last4,
        exp_month: c.exp_month,
        exp_year: c.exp_year,
        is_default: c.is_default,
      })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load cards'
    console.error('[wallet/payment-methods GET]', msg)
    return Response.json({ cards: [], _error: msg })
  }
}

export async function POST(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) {
    return Response.json({ error: 'Missing card token' }, { status: 400 })
  }

  try {
    const card = await addCard(auth.profile.id, token, {
      brand: typeof body.brand === 'string' ? body.brand : undefined,
      last4: typeof body.last4 === 'string' ? body.last4 : undefined,
      expMonth: typeof body.exp_month === 'number' ? body.exp_month : undefined,
      expYear: typeof body.exp_year === 'number' ? body.exp_year : undefined,
    })
    return Response.json({
      card: {
        id: card.id,
        vault_id: card.vault_id,
        brand: card.brand ?? 'card',
        last4: card.last4,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        is_default: card.is_default,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save card'
    console.error('[wallet/payment-methods POST]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
