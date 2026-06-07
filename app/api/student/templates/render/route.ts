// Student: render a template pack manifest as a fillable PDF and stream the
// bytes. The student must own (have paid for) the slug. Supports both
// "blank" (no prefill) and "filled" (with submitted form values) modes.
import { fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { generateTemplatePdf } from '@/lib/pdfGenerator'
import { getManifest } from '@/lib/templatePdfManifests'
import { userOwnsSlug } from '@/lib/templateEntitlements'
import { getTemplatePack } from '@/lib/template-packs'

interface Body {
  slug: string
  blank?: boolean
  formValues?: Record<string, string>
}

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return fail('Invalid JSON body.', 400)
  }

  if (!body.slug) return fail('Template slug is required.', 400)

  const pack = getTemplatePack(body.slug)
  if (!pack) return fail('Template pack not found.', 404)

  // Verify entitlement — user must have paid for this slug.
  const { data: profile } = await auth.db
    .from('profiles')
    .select('email, full_name')
    .eq('id', auth.profileId)
    .single()
  const email = (profile?.email || '').toLowerCase()
  if (!email) return fail('No email on profile.', 403)

  const owns = await userOwnsSlug(auth.db, email, body.slug)
  if (!owns) return fail("You haven't purchased this template yet.", 403)

  const manifest = getManifest(body.slug)
  if (!manifest) return fail('This template does not have a fillable form yet.', 404)

  try {
    const prefillValues = body.blank ? {} : (body.formValues ?? {})

    const pdfBytes = await generateTemplatePdf({
      manifest,
      prefillValues,
      meta: {
        templateName: pack.name,
        templateBadge: pack.badge,
        templateDescription: pack.short_description,
        keywords: pack.includes,
        userFullName: profile?.full_name || '',
        userEmail: email,
        orderId: '',
        generationDate: new Date(),
      },
    })

    const out = new Uint8Array(pdfBytes.byteLength)
    out.set(pdfBytes)

    const filename = body.blank
      ? `${body.slug}-blank.pdf`
      : `${body.slug}-filled.pdf`

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
