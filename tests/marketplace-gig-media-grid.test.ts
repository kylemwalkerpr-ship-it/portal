import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const gridCss = fs.readFileSync(path.join(root, 'app/marketplace/discovery-grid.css'), 'utf8')
const layout = fs.readFileSync(path.join(root, 'app/marketplace/layout.tsx'), 'utf8')
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260909_marketplace_gig_gallery_public.sql'), 'utf8')
const bulkCoverScript = fs.readFileSync(path.join(root, 'scripts/upload-gig-covers.mjs'), 'utf8')
const marketplaceApi = fs.readFileSync(path.join(root, 'app/api/marketplace/gigs/route.ts'), 'utf8')

describe('Marketplace gig media and discovery grid contract', () => {
  it('enforces four gig cards per row on wide desktop discovery pages', () => {
    expect(layout).toContain("import './discovery-grid.css'")
    expect(gridCss).toContain('.cw-market .ys-gig-grid')
    expect(gridCss).toContain('grid-template-columns: repeat(4, minmax(0, 1fr)) !important')
  })

  it('retains responsive grid fallbacks below desktop', () => {
    expect(gridCss).toContain('@media (max-width: 1359px)')
    expect(gridCss).toContain('repeat(3, minmax(0, 1fr))')
    expect(gridCss).toContain('@media (max-width: 768px)')
    expect(gridCss).toContain('repeat(2, minmax(0, 1fr))')
    expect(gridCss).toContain('@media (max-width: 559px)')
  })

  it('keeps the public Marketplace gig-gallery bucket invariant explicit', () => {
    expect(migration).toMatch(/values \('gig-gallery', 'gig-gallery', true\)/)
    expect(migration).toContain('set public = true')
    expect(bulkCoverScript).toContain('updateBucket("gig-gallery", { public: true })')
  })

  it('continues to expose normalized gallery and cover fields to cards', () => {
    expect(marketplaceApi).toContain('gallery_images: gallery')
    expect(marketplaceApi).toContain('cover_image_url: resolveCoverUrl(gig)')
  })
})
