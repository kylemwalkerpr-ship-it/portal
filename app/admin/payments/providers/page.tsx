import { redirect } from 'next/navigation'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirectForPortalAuthFailure } from '@/lib/auth/serverAuthRedirect'
import ProvidersPage from '@/components/admin/payments/ProvidersPage'

export const dynamic = 'force-dynamic'

export default async function PaymentProvidersPage() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirectForPortalAuthFailure(auth, '/admin/payments/providers')
  if (auth.role !== 'admin') redirect('/dashboard')
  return <ProvidersPage />
}
