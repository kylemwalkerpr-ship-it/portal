import { redirect } from 'next/navigation'
import { requireAdminUser } from '@/lib/portalAuth'
import { TEMPLATE_PACKS } from '@/lib/template-packs'
import { listManifestSlugs } from '@/lib/templatePdfManifests'
import PdfMakerClient from '@/components/admin/PdfMakerClient'

export const dynamic = 'force-dynamic'

export default async function PdfMakerPage() {
  const auth = await requireAdminUser()
  if ('error' in auth) {
    if (auth.status === 401) redirect('/sign-in?next=/dashboard/admin/templates/pdf-maker')
    redirect('/dashboard')
  }
  const explicit = new Set(listManifestSlugs())
  const slugs = TEMPLATE_PACKS.map((p) => ({
    slug: p.slug,
    name: p.name,
    badge: p.badge,
    hasManifest: explicit.has(p.slug),
  }))
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>PDF Maker</h1>
      <p style={{ color: '#555', marginBottom: 16 }}>
        Edit a template manifest in-memory and preview the rendered fillable PDF.
        Saving back to disk is a manual step — use Export to ship a JSON snapshot.
      </p>
      <PdfMakerClient slugs={slugs} />
    </div>
  )
}
