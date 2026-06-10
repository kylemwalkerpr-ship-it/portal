/**
 * POST /api/student/templates/render
 *
 * Renders a template PDF — either blank (empty fillable form) or
 * filled with the student's form values. Used by the TemplateFiller
 * UI for "Download blank PDF" and "Download filled PDF" actions.
 *
 * Body:
 *   { slug: string, blank?: boolean, formValues?: Record<string, string> }
 */
import { fail } from '@/lib/apiEnvelope'
import { getCurrentStudent } from '@/lib/student'
import { getTemplatePack } from '@/lib/template-packs'
import { getManifest } from '@/lib/templatePdfManifests'
import { listPaidTemplates } from '@/lib/templateEntitlements'

export async function POST(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return fail(auth.error, auth.status)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON body.', 400)
  }

  const slug = String(body.slug || '')
  const isBlank = body.blank === true
  const formValues = body.formValues as Record<string, string> | undefined

  if (!slug) return fail('Slug is required.', 400)

  // Verify entitlement
  const { data: profile } = await auth.db
    .from('profiles')
    .select('email, full_name')
    .eq('id', auth.profile.id)
    .single()

  const email = (profile?.email || '').toLowerCase()
  const paid = await listPaidTemplates(auth.db, email)
  const owns = paid.some(e => e.slug === slug)
  if (!owns) return fail('You haven\'t purchased this template.', 403)

  const pack = getTemplatePack(slug)
  if (!pack) return fail('Template not found.', 404)

  const manifest = getManifest(slug)
  if (!manifest) return fail('No fillable form manifest for this template.', 400)

  try {
    // pdf-lib + generator are heavy; lazy-load so cold starts on other
    // routes never pay for them (Workers CPU-limit mitigation).
    const { generateTemplatePdf, buildPrefill } = await import('@/lib/pdfGenerator')
    const prefill = buildPrefill({
      userFullName: profile?.full_name || '',
      userEmail: profile?.email || '',
      templateName: pack.name,
      templateBadge: pack.badge,
      generationDate: new Date(),
    })

    // For blank: don't merge form values; for filled: merge on top
    const mergedFill = isBlank
      ? {}
      : { ...prefill, ...(formValues || {}) }

    const pdfBytes = await generateTemplatePdf({
      manifest,
      prefillValues: mergedFill,
      meta: {
        templateName: pack.name,
        templateBadge: pack.badge,
        templateDescription: pack.short_description,
        keywords: pack.includes,
        userFullName: profile?.full_name || '',
        userEmail: profile?.email || '',
        orderId: 'preview',
        generationDate: new Date(),
      },
    })

    const out = new Uint8Array(pdfBytes.byteLength)
    out.set(pdfBytes)

    const filename = isBlank ? `${slug}-blank.pdf` : `${slug}-filled.pdf`

    return new Response(out, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Render failed'
    return fail(msg, 500)
  }
}
