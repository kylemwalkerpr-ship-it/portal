import { fail, ok } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { getPayhipBundleComponents } from '@/lib/payhipProductBundles'
import { getTemplatePack } from '@/lib/template-packs'
import { getManifest, listManifestSlugs } from '@/lib/templatePdfManifests'

function exportFilename(componentSlug: string): string {
  return `${componentSlug}.pdf`
}

/**
 * Admin-only manifest for assembling multi-file Payhip products.
 *
 * Payhip supports multiple files on one digital product, so a bundle should
 * expose each maintained buyer-facing PDF separately instead of compressing
 * authoring/source material into an opaque archive.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { slug } = await context.params
  const components = getPayhipBundleComponents(slug)
  if (!components) return fail('Payhip bundle not found.', 404)

  const explicitManifestSlugs = new Set(listManifestSlugs())
  const files = components.map((componentSlug) => {
    const pack = getTemplatePack(componentSlug)
    const manifest = getManifest(componentSlug)
    return {
      slug: componentSlug,
      name: pack?.name ?? componentSlug,
      filename: exportFilename(componentSlug),
      export_url: `/api/admin/templates/payhip-export/${encodeURIComponent(componentSlug)}`,
      has_explicit_manifest: explicitManifestSlugs.has(componentSlug),
      has_manifest: Boolean(manifest),
    }
  })

  const invalid = files.filter(
    (file) => !file.has_manifest || !file.has_explicit_manifest || !getTemplatePack(file.slug),
  )
  if (invalid.length > 0) {
    return fail(
      `Bundle cannot be exported until every component has an explicit buyer-facing manifest: ${invalid
        .map((file) => file.slug)
        .join(', ')}`,
      409,
    )
  }

  const bundle = getTemplatePack(slug)
  return ok({
    slug,
    name: bundle?.name ?? slug,
    file_count: files.length,
    files,
    upload_mode: 'multiple-files',
    qa_required: true,
  })
}
