import { SellerDirectoryPage } from '@/components/marketplace/SellerDirectoryPage'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import { redirectForPortalAuthFailure } from '@/lib/auth/serverAuthRedirect'

export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirectForPortalAuthFailure(auth, '/sellers')

  return <SellerDirectoryPage />
}
