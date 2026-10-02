import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { redirectToMarketAuth } from '@/lib/auth/serverAuthRedirect'
import { getClerkUserId } from '@/lib/auth'
import { normalizeReturnTo, PORTAL_ORIGIN } from '@/lib/auth/returnTo'
import { CHANGE_PASSWORD_PATH } from '@/lib/auth/mustChangePassword'
import ChangePasswordClient from './ChangePasswordClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Set a new password · YouSafe',
  robots: { index: false, follow: false },
}

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const params = await searchParams
  const returnTo = normalizeReturnTo(params.return_to ?? null) ?? `${PORTAL_ORIGIN}/dashboard`
  const userId = await getClerkUserId()
  if (!userId) {
    const self = new URL(CHANGE_PASSWORD_PATH, PORTAL_ORIGIN)
    self.searchParams.set('return_to', returnTo)
    redirectToMarketAuth(self.toString())
  }
  return <ChangePasswordClient returnTo={returnTo.includes(CHANGE_PASSWORD_PATH) ? `${PORTAL_ORIGIN}/dashboard` : returnTo} />
}
