/**
 * GET /api/wallet/balance
 * Returns the student's wallet balance from the Supabase student_wallets table.
 */
import { getCurrentStudent } from '@/lib/student'
import { getOrCreateWallet } from '@/lib/wallet'
import { getPlatformSettings } from '@/lib/platformConfig'

export async function GET() {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  try {
    const wallet = await getOrCreateWallet(auth.profile.id)
    const settings = await getPlatformSettings().catch(() => null)
    const topupEnabled = (settings as any)?.wallet_topup_enabled !== false
    // Return both new (balanceCents) and legacy (available/pending) shapes
    // so existing UI consumers across the estate keep working.
    return Response.json({
      balanceCents: wallet.balance_cents,
      currency: wallet.currency,
      available: wallet.balance_cents / 100,
      pending: 0,
      topupEnabled,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Wallet read failed'
    console.error('[wallet/balance]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
