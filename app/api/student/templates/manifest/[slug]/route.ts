// Student: return the manifest sections & fields for a template pack slug.
// The student must own (have paid for) the slug. The UI uses this to
// render a fillable form. We strip the slug from the response so the
// client doesn't need to echo it back.
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { getManifest } from '@/lib/templatePdfManifests'
import { userOwnsSlug } from '@/lib/templateEntitlements'

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { slug } = await context.params
  if (!slug) return fail('Missing template slug.', 400)

  // Verify entitlement
  const { data: profile } = await auth.db
    .from('profiles')
    .select('email')
    .eq('id', auth.profileId)
    .single()
  const email = (profile?.email || '').toLowerCase()
  if (!email) return fail('No email on profile.', 403)

  const owns = await userOwnsSlug(auth.db, email, slug)
  if (!owns) return fail("You haven't purchased this template yet.", 403)

  const manifest = getManifest(slug)
  if (!manifest) return fail('This template does not have a fillable form yet.', 404)

  // Only return sections/fields — the client doesn't need the slug back.
  return ok({ sections: manifest.sections })
}
