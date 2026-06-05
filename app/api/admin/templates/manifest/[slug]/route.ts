// Admin: fetch the in-memory manifest for a slug. Returns the canonical
// per-slug manifest, or the catalogue-includes fallback if there isn't one.
import { fail, ok } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { getManifest, listManifestSlugs } from '@/lib/templatePdfManifests'

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { slug } = await context.params
  if (!slug) return fail('Missing slug.', 400)
  const manifest = getManifest(slug)
  if (!manifest) return fail('No manifest for slug.', 404)
  const explicit = listManifestSlugs().includes(slug)
  return ok({ manifest, isExplicit: explicit })
}
