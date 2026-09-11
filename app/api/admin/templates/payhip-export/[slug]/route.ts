import { fail } from '@/lib/apiEnvelope'
import { generatePayhipProductPdf } from '@/lib/payhipExportPdf'
import { requireAdminUser } from '@/lib/portalAuth'
import { getTemplatePack } from '@/lib/template-packs'
import { listManifestSlugs } from '@/lib/templatePdfManifests'

function safeFilename(slug: string): string {
  return slug.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'yousafe-template'
}

/**
 * Admin-only export used to prepare buyer-facing Payhip deliverables.
 *
 * This route renders the maintained explicit PDF manifest and adds a retail
 * guidance page with the product's registered official government sources.
 * Authoring/source files are never used as the paid artifact by this route.
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

  if (!listManifestSlugs().includes(slug)) {
    return fail(
      'This template does not yet have an explicit buyer-facing PDF manifest. Keep the Payhip product on hold until one is created and reviewed.',
      409,
    )
  }

  try {
    const result = await generatePayhipProductPdf(slug)
    const out = new Uint8Array(result.bytes.byteLength)
    out.set(result.bytes)

    return new Response(out, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename(slug)}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-YouSafe-Product-Slug': slug,
        'X-YouSafe-Export-Type': 'payhip-master-pdf',
        'X-YouSafe-PDF-Pages': String(result.pageCount),
        'X-YouSafe-PDF-Fields': String(result.fieldCount),
        'X-YouSafe-Official-Sources': String(result.officialSourceCount),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payhip export failed.'
    return fail(message, 500)
  }
}
