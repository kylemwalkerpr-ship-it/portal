// Admin: render an arbitrary manifest to a PDF and stream the bytes.
// Used by the PDF Maker preview pane. Never persists.
import { fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { generateTemplatePdf, TemplatePdfManifest } from '@/lib/pdfGenerator'

interface Body {
  manifest?: TemplatePdfManifest
  prefillValues?: Record<string, string>
  meta?: {
    templateName?: string
    templateBadge?: string
    templateDescription?: string
    keywords?: string[]
    userFullName?: string
    userEmail?: string
    orderId?: string
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return fail('Invalid JSON body.', 400)
  }

  if (!body.manifest || !Array.isArray(body.manifest.sections)) {
    return fail('Manifest is required.', 400)
  }

  try {
    const pdfBytes = await generateTemplatePdf({
      manifest: body.manifest,
      prefillValues: body.prefillValues ?? {},
      meta: {
        templateName: body.meta?.templateName || body.manifest.slug,
        templateBadge: body.meta?.templateBadge,
        templateDescription: body.meta?.templateDescription,
        keywords: body.meta?.keywords,
        userFullName: body.meta?.userFullName || 'Sample Applicant',
        userEmail: body.meta?.userEmail || auth.profile?.email || '',
        orderId: body.meta?.orderId || 'sample-order',
        generationDate: new Date(),
      },
    })
    // Build a fresh ArrayBuffer copy so the Response body is unambiguously
    // a BodyInit (some runtimes are picky about Uint8Array<ArrayBufferLike>).
    const out = new Uint8Array(pdfBytes.byteLength)
    out.set(pdfBytes)
    return new Response(out, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${body.manifest.slug || 'preview'}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Render failed'
    return fail(msg, 500)
  }
}
