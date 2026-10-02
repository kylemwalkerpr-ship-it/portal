/**
 * POST /api/profile/sync-lane — RETIRED (2026-10 auth unification).
 *
 * Role used to be inferred from the sign-up URL lane / sessionStorage and
 * promoted here. Role is now chosen explicitly on /onboarding and written by
 * /api/onboarding/role or /api/provider/apply (DB is the source of truth).
 * Kept as a harmless no-op so stale cached clients don't 404.
 */
import { requirePortalUser } from '@/lib/portalAuth'

export async function POST() {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  return Response.json({ promoted: false, retired: true })
}
