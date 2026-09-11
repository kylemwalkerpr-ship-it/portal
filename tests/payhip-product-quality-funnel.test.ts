import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const exportRoute = read('app/api/admin/templates/payhip-export/[slug]/route.ts')
const auditLedger = read('docs/payhip-product-commercial-audit.md')
const megaManifest = read('lib/templatePdfManifests/premium-usa-canada-study-work-mega-bundle.ts')

describe('Payhip product quality funnel', () => {
  test('exports a maintained buyer-facing PDF instead of the legacy source zip', () => {
    expect(exportRoute).toContain("import { requireAdminUser } from '@/lib/portalAuth'")
    expect(exportRoute).toContain("import { getManifest } from '@/lib/templatePdfManifests'")
    expect(exportRoute).toContain('generateTemplatePdf')
    expect(exportRoute).toContain("orderId: 'PAYHIP-MASTER'")
    expect(exportRoute).toContain("'Content-Type': 'application/pdf'")
    expect(exportRoute).toContain("'X-YouSafe-Export-Type': 'payhip-master-pdf'")
    expect(exportRoute).not.toContain('pack.delivery_file')
    expect(exportRoute).not.toContain('pack.zip')
  })

  test('fails closed when a product has no maintained PDF manifest', () => {
    expect(exportRoute).toContain("'This template does not yet have a buyer-facing PDF manifest")
    expect(exportRoute).toContain('409')
  })

  test('keeps the premium bundle backed by a real structured manifest', () => {
    expect(megaManifest).toContain("slug: 'premium-usa-canada-study-work-mega-bundle'")
    expect(megaManifest).toContain('clientIdentitySection()')
    expect(megaManifest).toContain('ds160WorksheetSection()')
    expect(megaManifest).toContain('studyPlanSection()')
    expect(megaManifest).toContain('proofOfFundsSection()')
    expect(megaManifest).toContain('refusalMatrixSection()')
    expect(megaManifest).toContain('documentTrackerSection()')
  })

  test('records the 36-product stop-ship audit contract', () => {
    expect(auditLedger).toContain('Initial catalogue ledger — 36 active Payhip products')
    expect(auditLedger).toContain('Opera Browser is the primary authenticated browser')
    expect(auditLedger).toContain('TinyFish is reserved for research where it adds material advantage')
    expect(auditLedger).toContain('No product is promoted until the **actual buyer deliverable has been opened and validated**')
    expect(auditLedger).toContain('| 1 | Ap382 | Premium USA + Canada Study/Work Template Mega Bundle')
    expect(auditLedger).toContain('| 36 | rlsyK | 50 AI Prompts for Small Business Owners')
  })
})
