import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { data: gigs, error } = await auth.db
    .from('gigs')
    .select('*, tiers:gig_tiers(*), provider:profiles!gigs_provider_id_fkey(id, full_name, email)')
    .order('rank_score', { ascending: false })
  if (error) return fail(error.message, 500)
  return ok({ gigs: gigs ?? [] })
}
