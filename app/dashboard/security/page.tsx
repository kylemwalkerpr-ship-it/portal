import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import SecurityHubView from '@/components/SecurityHubView'

export const metadata = {
  title: 'Account security · YouSafe',
  robots: { index: false, follow: false },
}

// Universal security hub — accessible to every signed-in role
// (student / attorney / consultant / admin). Phones the same
// PhoneVerificationCard and TwoFactorCard the attorney/consultant
// compliance page uses, so security state stays in one place.
//
// For attorneys + consultants, the compliance page (gig-publishing
// gate) ALSO embeds these cards inline, so they don't have to
// page-hop to fix a compliance gap. This page is the canonical
// "Account security" surface buyers and sellers both can reach.
export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/dashboard/security')

  return <SecurityHubView role={auth.role} />
}
