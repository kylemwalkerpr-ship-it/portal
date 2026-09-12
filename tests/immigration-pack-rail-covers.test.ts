import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const rail = fs.readFileSync(path.join(root, 'components/marketplace/ImmigrationPackRail.tsx'), 'utf8')

describe('Marketplace immigration preparation pack rail covers', () => {
  test('uses audited Batches 2-4 product photography before the legacy fallback cover', () => {
    expect(rail).toContain("import { getPayhipBatches24Product } from '@/lib/payhipBatches24'")
    expect(rail).toContain('const audited = getPayhipBatches24Product(pack.slug)')
    expect(rail).toContain(
      "cover: audited?.imageUrl ?? commercial?.cover.imageUrl ?? '/shop/covers/immigration-prep-pack.svg'",
    )
  })
})
