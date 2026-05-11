import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant'].includes(auth.role)) return fail('Forbidden.', 403)

  const { data: gigs, error } = await auth.db
    .from('gigs')
    .select('*, tiers:gig_tiers(*)')
    .eq('provider_id', auth.profileId)
    .eq('provider_type', auth.role)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })

  if (error) return fail(error.message, 500)
  return ok({
    gigs: gigs ?? [],
    used: (gigs ?? []).filter((g: any) => ['draft', 'active', 'paused'].includes(g.status)).length,
    limit: 5,
  })
}
