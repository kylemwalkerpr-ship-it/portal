import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import AdminAttorneyApplications from '@/components/design/admin-attorney-applications'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/admin?return_to=/dashboard/admin/attorney-applications')
  if (auth.role !== 'admin') redirect('/dashboard')
  return <AdminAttorneyApplications />
}
