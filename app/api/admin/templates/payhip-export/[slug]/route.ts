import { fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { getTemplatePack } from '@/lib/template-packs'
import { getManifest } from '@/lib/templatePdfManifests'

function safeFilename(slug: string): string {
  return slug.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'yousafe-template'
}

/**
 * Admin-only export used to prepare buyer-facing Payhip deliverables.
 *
 * This route intentionally renders the maintained TemplatePdfManifest rather
 * than serving the legacy `pack.zip` source bundle. The resulting PDF is a
 * clean, fillable master with no customer PII and can be downloaded, QA'd,
 * and uploaded to Payhip as the commercial artifact.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { slug } = await context.params
  if (!slug) return fail('Missing template slug.', 400)

  const pack = getTemplatePack(slug)
  if (!pack) return fail('Template not found.', 404)

  const manifest = getManifest(slug)
  if (!manifest) {
    return fail(
      'This template does not yet have a buyer-facing PDF manifest. Keep the Payhip product on hold until one is created and reviewed.',
      409,
    )
  }

  try {
    const { generateTemplatePdf } = await import('@/lib/pdfGenerator')
    const pdfBytes = await generateTemplatePdf({
      manifest,
      prefillValues: {},
      meta: {
        templateName: pack.name,
        templateBadge: pack.badge,
        templateDescription: pack.short_description,
        keywords: pack.includes,
        userFullName: '',
        userEmail: '',
        orderId: 'PAYHIP-MASTER',
        generationDate: new Date(),
      },
    })

    const out = new Uint8Array(pdfBytes.byteLength)
    out.set(pdfBytes)

    return new Response(out, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename(slug)}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-YouSafe-Product-Slug': slug,
        'X-YouSafe-Export-Type': 'payhip-master-pdf',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payhip export failed.'
    return fail(message, 500)
  }
}
