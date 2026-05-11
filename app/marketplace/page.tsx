import { MarketplacePage } from '@/components/design/fiverr-workbench'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'

export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/marketplace')
  if (auth.role !== 'client') redirect('/dashboard')
  return <MarketplacePage />
}
