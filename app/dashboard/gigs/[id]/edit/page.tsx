import { ProviderGigsPage } from '@/components/design/fiverr-workbench'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/dashboard/gigs')
  if (auth.role === 'client') redirect('/marketplace')
  if (!['attorney', 'consultant'].includes(auth.role)) redirect('/dashboard')
  const { id } = await params
  return <ProviderGigsPage selectedGigId={id} />
}
