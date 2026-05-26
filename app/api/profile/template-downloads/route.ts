import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { listPaidTemplates } from '@/lib/templateEntitlements'
import { getTemplatePack } from '@/lib/template-packs'

// Returns every template pack the signed-in user has paid for, with
// metadata pulled from the static catalogue. Used by the student
// dashboard's "My Templates" surface as the source of truth for which
// download buttons to show.
//
// Match is by email — anonymous template_orders rows attach by email
// at checkout, and the authenticated user's profile.email is the
// canonical handle. If the signed-in user has multiple emails on
// their Clerk account, we'd need to widen this — but today
// profile.email is the primary email mirrored from Clerk.
export async function GET() {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { data: profile } = await auth.db
    .from('profiles')
    .select('email')
    .eq('id', auth.profileId)
    .single()
  const email = (profile?.email || '').toLowerCase()
  if (!email) return ok({ entitlements: [] })

  const paid = await listPaidTemplates(auth.db, email)

  // Enrich with catalogue metadata so the UI doesn't need a second
  // round-trip per item. Skip slugs that aren't in the catalogue
  // (defensive: a stale order from a deprecated pack shouldn't 500
  // the dashboard).
  const enriched = paid
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
        downloadHref: `/api/templates/download/${encodeURIComponent(e.slug)}`,
      }
    })
    .filter(Boolean)

  return ok({ entitlements: enriched })
}
