import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import { listPaidTemplates } from '@/lib/templateEntitlements'
import { getTemplatePack } from '@/lib/template-packs'
import MyTemplatesView from '@/components/student/MyTemplatesView'

export const metadata = {
  title: 'My Templates · YouSafe',
  robots: { index: false, follow: false },
}

// Server-rendered re-entry point for paid template downloads. Open to
// any signed-in user (students mostly, but providers can buy templates
// too) — the entitlements helper only returns slugs they actually
// paid for, so the page is automatically empty for anyone who hasn't.
export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/dashboard/templates')

  const { data: profile } = await auth.db
    .from('profiles')
    .select('email')
    .eq('id', auth.profileId)
    .single()

  const email = (profile?.email || '').toLowerCase()
  const paid = email ? await listPaidTemplates(auth.db, email) : []
  const items = paid
    .map((e) => {
      const pack = getTemplatePack(e.slug)
      if (!pack) return null
      return {
        slug: e.slug,
        name: pack.name,
        category: pack.category,
        short_description: pack.short_description,
        includes: pack.includes,
        purchased_at: e.purchasedAt,
        order_id: e.orderId,
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => (b.purchased_at || '').localeCompare(a.purchased_at || ''))

  return <MyTemplatesView items={items} />
}
