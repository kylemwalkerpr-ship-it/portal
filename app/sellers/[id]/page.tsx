import { SellerProfilePage } from '@/components/marketplace/SellerProfilePage'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/sellers/[id]')

  const { id } = await params

  return <SellerProfilePage sellerId={id} />
}
