/**
 * GET /api/admin/consultant-applications/[id]/details
 *
 * Returns the full reviewer payload that the admin drawer renders, merging:
 *   - the consultant_applications row (the submitted form)
 *   - the linked profiles row (full_name / email / phone / role / status)
 *   - the linked consultants row (headshot, tagline, bio, languages, years,
 *     specialties, education, timezone — every enrichment column the
 *     marketplace shows)
 *   - the reviewer profile (name + email) used in the Decision section
 *
 * The drawer's table-row props are minimal (cards just have id, status,
 * email, etc.) so this endpoint is what fills the "blank" sections out.
 *
 * Self-heals: missing columns / missing rows surface as null fields. The
 * UI is expected to skip nulls rather than render placeholders.
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

const APP_COLS =
  'id, profile_id, email, full_name, phone, consultant_type, jurisdictions, registration_number, ' +
  'specialties, malpractice_insurance, profile_url, capacity, notes, status, priority, ' +
  'risk_score, risk_flags, decided_at, decided_by, decision_notes, created_at'

const CONS_COLS =
  'headshot_url, tagline, intro, bio, languages, years_experience, education, ' +
  'specialties, starting_price, offers_free_consult, video_intro_url, timezone, ' +
  'subjects, industries, available'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth
  const { id } = await context.params

  const warnings: string[] = []

  // 1. Application row. Self-heal if any of the optional columns are missing.
  let app: Record<string, unknown> | null = null
  let appRes = await db
    .from('consultant_applications')
    .select(APP_COLS)
    .eq('id', id)
    .maybeSingle()
  if (appRes.error && /column .* does not exist/i.test(appRes.error.message || '')) {
    warnings.push('consultant_applications_columns_missing')
    appRes = await db.from('consultant_applications').select('*').eq('id', id).maybeSingle()
  }
  if (appRes.error) return fail(appRes.error.message, 500)
  app = ((appRes.data as unknown) as Record<string, unknown> | null) ?? null
  if (!app) return fail('Application not found.', 404)

  const profileId = (app.profile_id as string | null) ?? null

  // 2. Linked profile + role.
  let profile: Record<string, unknown> | null = null
  if (profileId) {
    const { data } = await db
      .from('profiles')
      .select('id, email, full_name, role, status, created_at')
      .eq('id', profileId)
      .maybeSingle()
    profile = (data as Record<string, unknown> | null) ?? null
  }

  // 3. Linked consultant row (rich marketplace profile).
  let consultant: Record<string, unknown> | null = null
  if (profileId) {
    let consRes = await db
      .from('consultants')
      .select(CONS_COLS)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (consRes.error && /column .* does not exist/i.test(consRes.error.message || '')) {
      warnings.push('consultants_columns_missing')
      consRes = await db.from('consultants').select('*').eq('profile_id', profileId).maybeSingle()
    }
    if (consRes.error && /relation .* does not exist/i.test(consRes.error.message || '')) {
      warnings.push('consultants_table_missing')
    } else if (!consRes.error) {
      consultant = ((consRes.data as unknown) as Record<string, unknown> | null) ?? null
    }
  }

  // 4. Reviewer profile (for the Decision section).
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
    { application: app, profile, consultant, reviewer },
    {},
    warnings.length ? { data_warnings: warnings } : {},
  )
}
