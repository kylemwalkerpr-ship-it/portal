import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requirePortalUser } from '@/lib/portalAuth'
import { SupportShell } from '@/components/support/SupportShell'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Support · YouSafe',
  robots: { index: false, follow: false },
}

export default async function SupportPage() {
  const auth = await requirePortalUser()
  if ('error' in auth) {
    redirect('/sign-in/student?return_to=/dashboard/support')
  }
  if (!['support', 'admin'].includes(auth.role)) {
    redirect('/dashboard')
  }
  return <SupportShell />
}
