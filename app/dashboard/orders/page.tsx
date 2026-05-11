import { OrderKanbanPage } from '@/components/design/fiverr-workbench'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'

export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/dashboard/orders')
  if (auth.role === 'client') redirect('/marketplace')
  if (!['attorney', 'consultant'].includes(auth.role)) redirect('/dashboard')
  return <OrderKanbanPage />
}
