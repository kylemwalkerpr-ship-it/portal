import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import { redirectForPortalAuthFailure } from '@/lib/auth/serverAuthRedirect'
import AdminConsultantManagement from '@/components/design/admin-consultant-management'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirectForPortalAuthFailure(auth, '/dashboard/admin/consultant-applications')
  if (auth.role !== 'admin') redirect('/dashboard')
  return <AdminConsultantManagement />
}
