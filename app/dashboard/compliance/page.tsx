import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import SellerShell from '@/components/seller/SellerShell'
import SellerComplianceView from '@/components/seller/SellerComplianceView'

export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/dashboard/compliance')
  if (auth.role === 'client') redirect('/marketplace')
  if (!['attorney', 'consultant'].includes(auth.role)) redirect('/dashboard')

  return (
    <SellerShell
      title="Compliance"
      subtitle="Verification, credentials, and account standing"
    >
      <SellerComplianceView role={auth.role as 'attorney' | 'consultant'} />
    </SellerShell>
  )
}
