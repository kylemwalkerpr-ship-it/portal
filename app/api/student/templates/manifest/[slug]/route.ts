/**
 * GET /api/student/templates/manifest/:slug
 *
 * Returns the fillable form manifest for a template that the student
 * has purchased. Used by the TemplateFiller UI to render the form fields.
 */
import { fail, ok } from '@/lib/apiEnvelope'
import { getCurrentStudent } from '@/lib/student'
import { getManifest } from '@/lib/templatePdfManifests'
import { getTemplatePack } from '@/lib/template-packs'
import { listPaidTemplates } from '@/lib/templateEntitlements'

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { slug } = await context.params
  if (!slug) return fail('Missing slug.', 400)

  // Verify entitlement
  const { data: profile } = await auth.db
    .from('profiles')
    .select('email')
    .eq('id', auth.profile.id)
    .single()

  const email = (profile?.email || '').toLowerCase()
  const paid = await listPaidTemplates(auth.db, email)
  const owns = paid.some(e => e.slug === slug)
  if (!owns) return fail('You haven\'t purchased this template.', 403)

  const pack = getTemplatePack(slug)
  const manifest = getManifest(slug)

  if (!manifest) {
    return ok({
      slug,
      name: pack?.name || slug,
      hasManifest: false,
      sections: [],
    })
  }

  return ok({
    slug,
    name: pack?.name || slug,
    badge: pack?.badge,
    includes: pack?.includes || [],
    hasManifest: true,
    sections: manifest.sections,
    pageSize: manifest.pageSize,
  })
}
