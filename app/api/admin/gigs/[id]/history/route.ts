import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params

  // Verify gig exists
  const { data: gig, error: gigErr } = await auth.db
    .from('gigs')
    .select('id, title, status')
    .eq('id', id)
    .single()

  if (gigErr || !gig) return fail('Gig not found.', 404)

  // Fetch version history
  const { data: history, error } = await auth.db
    .from('gig_version_history')
    .select(
      'id, gig_id, version_num, changed_by, changed_by_role, ' +
      'snapshot, change_summary, created_at'
    )
    .eq('gig_id', id)
    .order('version_num', { ascending: false })
    .limit(20)

  if (error) return fail(error.message, 500)

  const rows = history ?? []

  // Enrich with changer profile names
  const changerIds = [...new Set(rows.map((r: any) => r.changed_by).filter(Boolean))]
  let changerMap: Record<string, any> = {}

  if (changerIds.length) {
    try {
      const { data: profiles } = await auth.db
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', changerIds)
      for (const p of profiles ?? []) changerMap[p.id] = p
    } catch {
      // Non-fatal
    }
  }

  const enriched = rows.map((r: any) => ({
    ...r,
    changed_by_profile: r.changed_by
      ? changerMap[r.changed_by]
        ? {
            name: changerMap[r.changed_by].full_name,
            email: changerMap[r.changed_by].email,
            role: changerMap[r.changed_by].role,
          }
        : null
      : null,
  }))

  return ok({
    gig: { id: gig.id, title: gig.title, status: gig.status },
    history: enriched,
    total: enriched.length,
  })
}
