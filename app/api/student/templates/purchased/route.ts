/**
 * GET /api/student/templates/purchased
 *
 * Returns all purchased templates for the current student with their
 * download URLs and fill session status. Used by the Documents tab
 * "Purchased Templates" section.
 *
 * Each entry includes:
 *   - slug, name, description, badge, category
 *   - purchased_at, order_id
 *   - download_url (pre-signed, short-lived — client can call
 *     /api/templates/download/:slug directly for a fresh URL)
 *   - has_fill_session — whether the student filled a form for this
 *   - fill_session_id — the completed/paid fill session if any
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { getCurrentStudent } from '@/lib/student'
import { listPaidTemplates } from '@/lib/templateEntitlements'
import { getTemplatePack } from '@/lib/template-packs'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function GET() {
  const auth = await getCurrentStudent()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { data: profile } = await auth.db
    .from('profiles')
    .select('email')
    .eq('id', auth.profile.id)
    .single()

  const email = (profile?.email || '').toLowerCase()
  if (!email) return ok({ templates: [] })

  const paid = await listPaidTemplates(auth.db, email)
  if (paid.length === 0) return ok({ templates: [] })

  const admin = createSupabaseAdminClient()

  // Fetch fill sessions for these slugs
  const slugs = paid.map(e => e.slug)
  const { data: fillSessions } = await admin
    .from('template_fill_sessions')
    .select('id, slug, status, rendered_storage_path, order_id, updated_at')
    .eq('profile_id', auth.profile.id)
    .in('slug', slugs)
    .in('status', ['completed', 'paid'])
    .order('updated_at', { ascending: false })

  // Map fill sessions by slug (newest wins)
  const fillBySlug = new Map<string, typeof fillSessions[0]>()
  for (const fs of fillSessions ?? []) {
    if (!fillBySlug.has(fs.slug)) fillBySlug.set(fs.slug, fs)
  }

  // Enrich with catalogue metadata
  const templates = paid
    .map((e) => {
      const pack = getTemplatePack(e.slug)
      if (!pack) return null

      const fill = fillBySlug.get(e.slug)

      return {
        slug: e.slug,
        name: pack.name,
        category: pack.category,
        badge: pack.badge,
        short_description: pack.short_description,
        includes: pack.includes,
        price_usd: pack.price_usd,
        purchased_at: e.purchasedAt,
        order_id: e.orderId,
        has_fill_session: !!fill,
        fill_status: fill?.status || null,
        fill_session_id: fill?.id || null,
      }
    })
    .filter(Boolean)

  return ok({ templates })
}
