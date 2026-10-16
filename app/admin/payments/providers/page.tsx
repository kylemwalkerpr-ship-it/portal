import { redirect } from 'next/navigation'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirectForPortalAuthFailure } from '@/lib/auth/serverAuthRedirect'

export const dynamic = 'force-dynamic'

export default async function PaymentProvidersPage() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirectForPortalAuthFailure(auth, '/admin/payments/providers')
  if (auth.role !== 'admin') redirect('/dashboard')
  redirect('/dashboard/admin/settings?tab=payments')
}
