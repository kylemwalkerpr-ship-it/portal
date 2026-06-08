/**
 * GET /api/student/templates/manifest/:slug
 *
 * Returns the fillable form manifest (field definitions only) for a template.
 *
 * FILL-BEFORE-PAY: the manifest is just the list of form fields — not the
 * deliverable — so it is returned to ANY authenticated student, purchased or
 * not. This lets a prospective buyer open the form, fill it (with AI help),
 * and preview it on-screen for free. The downloadable/printable filled PDF
 * stays gated behind payment (see fill/[sessionId]/checkout). The `owns` flag
 * tells the UI whether to paywall the download.
 */
import { fail, ok } from '@/lib/apiEnvelope'
import { getCurrentStudent } from '@/lib/student'
import { getManifest } from '@/lib/templatePdfManifests'
import { getTemplatePack, getTemplatePackPriceCents } from '@/lib/template-packs'
import { listPaidTemplates } from '@/lib/templateEntitlements'

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { slug } = await context.params
  if (!slug) return fail('Missing slug.', 400)

  const pack = getTemplatePack(slug)
  if (!pack) return fail('Template not found.', 404)

  // Entitlement is no longer a gate — it only decides whether the download is
  // free (owned) or requires payment (not owned).
  const { data: profile } = await auth.db
    .from('profiles')
    .select('email')
    .eq('id', auth.profile.id)
    .single()

  const email = (profile?.email || '').toLowerCase()
  const paid = await listPaidTemplates(auth.db, email)
  const owns = paid.some(e => e.slug === slug)

  const manifest = getManifest(slug)

  if (!manifest) {
    return ok({
      slug,
      name: pack?.name || slug,
      hasManifest: false,
      owns,
      priceCents: getTemplatePackPriceCents(slug) ?? 0,
      sections: [],
    })
  }

  return ok({
    slug,
    name: pack?.name || slug,
    badge: pack?.badge,
    includes: pack?.includes || [],
    hasManifest: true,
    owns,
    priceCents: getTemplatePackPriceCents(slug) ?? 0,
    sections: manifest.sections,
    pageSize: manifest.pageSize,
  })
}
