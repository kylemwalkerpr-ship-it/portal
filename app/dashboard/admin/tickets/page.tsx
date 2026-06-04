import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requirePortalUser } from '@/lib/portalAuth'
import AdminTickets from '@/components/design/admin-tickets'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin · Support tickets',
  robots: { index: false, follow: false },
}

export default async function AdminTicketsPage() {
  const auth = await requirePortalUser()
  if ('error' in auth) {
    redirect('/sign-in/student?return_to=/dashboard/admin/tickets')
  }
  if (auth.role !== 'admin') {
    redirect('/dashboard')
  }
  return <AdminTickets />
}
