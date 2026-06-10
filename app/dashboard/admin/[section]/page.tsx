/**
 * /dashboard/admin/<section> — real, deep-linkable URLs for every admin
 * console section. The static sibling routes (attorney-applications,
 * consultant-applications) take precedence over this dynamic segment and
 * keep their standalone renderers.
 *
 * AdminApp reads the active section from the pathname, so this server
 * component only needs to guard auth and validate the segment.
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import AdminSectionClient from '../AdminSectionClient'

export const dynamic = 'force-dynamic'

// Keep in sync with ADMIN_PAGES + FINANCIAL_TAB_ALIASES in
// components/design/admin.jsx.
const VALID_SECTIONS = new Set([
  'dashboard', 'users', 'orders', 'tickets', 'inquiries', 'analytics',
  'financials', 'gigs', 'settings',
  // Financials tab aliases
  'escrow', 'payouts', 'wallets', 'loyalty',
])

export default async function AdminSectionPage(
  { params }: { params: Promise<{ section: string }> },
) {
  const { section } = await params
  if (!VALID_SECTIONS.has(section)) redirect('/dashboard/admin/dashboard')

  const auth = await requirePortalUser()
  if ('error' in auth) redirect(`/sign-in/admin?return_to=/dashboard/admin/${section}`)
  if (auth.role !== 'admin') redirect('/dashboard')

  return <AdminSectionClient />
}
