/**
 * GET /api/admin/attorney-applications/[id]/details
 *
 * Mirror of the consultant /details endpoint, scoped to the attorney lane.
 * See app/api/admin/consultant-applications/[id]/details/route.ts for the
 * response shape and the self-heal rationale.
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

const APP_COLS =
  'id, profile_id, email, full_name, phone, credential_type, jurisdictions, bar_number, ' +
  'practice_areas, malpractice_insurance, profile_url, capacity, notes, status, priority, ' +
  'risk_score, risk_flags, decided_at, decided_by, decision_notes, created_at'

const ATT_COLS =
  'headshot_url, tagline, intro, bio, languages, years_experience, education, ' +
  'specialties, starting_price, offers_free_consult, video_intro_url, timezone'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth
  const { id } = await context.params

  const warnings: string[] = []

  let app: Record<string, unknown> | null = null
  let appRes = await db
    .from('attorney_applications')
    .select(APP_COLS)
    .eq('id', id)
    .maybeSingle()
  if (appRes.error && /column .* does not exist/i.test(appRes.error.message || '')) {
    warnings.push('attorney_applications_columns_missing')
    appRes = await db.from('attorney_applications').select('*').eq('id', id).maybeSingle()
  }
  if (appRes.error) return fail(appRes.error.message, 500)
  app = ((appRes.data as unknown) as Record<string, unknown> | null) ?? null
  if (!app) return fail('Application not found.', 404)

  const profileId = (app.profile_id as string | null) ?? null

  let profile: Record<string, unknown> | null = null
  if (profileId) {
    const { data } = await db
      .from('profiles')
      .select('id, email, full_name, role, status, created_at')
      .eq('id', profileId)
      .maybeSingle()
    profile = (data as Record<string, unknown> | null) ?? null
  }

  let attorney: Record<string, unknown> | null = null
  if (profileId) {
    let attRes = await db
      .from('attorneys')
      .select(ATT_COLS)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (attRes.error && /column .* does not exist/i.test(attRes.error.message || '')) {
      warnings.push('attorneys_columns_missing')
      attRes = await db.from('attorneys').select('*').eq('profile_id', profileId).maybeSingle()
    }
    if (attRes.error && /relation .* does not exist/i.test(attRes.error.message || '')) {
      warnings.push('attorneys_table_missing')
    } else if (!attRes.error) {
      attorney = ((attRes.data as unknown) as Record<string, unknown> | null) ?? null
    }
  }

  let reviewer: Record<string, unknown> | null = null
  const decidedBy = (app.decided_by as string | null) ?? null
  if (decidedBy) {
    const { data } = await db
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', decidedBy)
      .maybeSingle()
    reviewer = (data as Record<string, unknown> | null) ?? null
  }

  return ok(
    { application: app, profile, attorney, reviewer },
    {},
    warnings.length ? { data_warnings: warnings } : {},
  )
}
