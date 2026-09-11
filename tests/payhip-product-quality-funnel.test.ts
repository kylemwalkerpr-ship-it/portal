import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const exportRoute = read('app/api/admin/templates/payhip-export/[slug]/route.ts')
const bundleRoute = read('app/api/admin/templates/payhip-export-bundle/[slug]/route.ts')
const exportPdf = read('lib/payhipExportPdf.ts')
const bundleMap = read('lib/payhipProductBundles.ts')
const auditLedger = read('docs/payhip-product-commercial-audit.md')
const megaManifest = read('lib/templatePdfManifests/premium-usa-canada-study-work-mega-bundle.ts')

const expectedMegaComponents = [
  'us-f1-student-visa-ds160-i20-pack',
  'us-f1-interview-home-ties-pack',
  'us-b1b2-visitor-visa-ds160-invitation-pack',
  'us-opt-i765-application-prep-pack',
  'us-stem-opt-i765-i983-companion-pack',
  'us-i134-financial-support-companion-pack',
  'canada-study-permit-complete-pack',
  'canada-proof-of-funds-sponsor-pack',
  'canada-study-plan-letter-of-explanation-pack',
  'canada-trv-visitor-visa-pack',
  'canada-work-permit-outside-canada-pack',
  'canada-pgwp-application-pack',
  'canada-family-information-travel-history-pack',
  'us-canada-refusal-reapplication-response-pack',
  'universal-client-intake-document-review-kit',
] as const

describe('Payhip product quality funnel', () => {
  test('exports an explicit maintained buyer-facing PDF instead of a source artifact', () => {
    expect(exportRoute).toContain("import { generatePayhipProductPdf } from '@/lib/payhipExportPdf'")
    expect(exportRoute).toContain('listManifestSlugs().includes(slug)')
    expect(exportRoute).toContain("'Content-Type': 'application/pdf'")
    expect(exportRoute).toContain("'X-YouSafe-Export-Type': 'payhip-master-pdf'")
    expect(exportRoute).toContain("'X-YouSafe-PDF-Pages'")
    expect(exportRoute).toContain("'X-YouSafe-PDF-Fields'")
    expect(exportRoute).not.toContain('delivery_file')
  })

  test('retail PDFs carry preparation boundaries and registered government sources', () => {
    expect(exportPdf).toContain('independent preparation and organization resource')
    expect(exportPdf).toContain('not an official government form')
    expect(exportPdf).toContain('not legal advice')
    expect(exportPdf).toContain('not a guarantee of approval')
    expect(exportPdf).toContain('Authoritative sources to check before filing')
    expect(exportPdf).toContain('IMMIGRATION_SHOP_OFFICIAL_SOURCES')
  })

  test('fails closed when a product has no explicit maintained PDF manifest', () => {
    expect(exportRoute).toContain('explicit buyer-facing PDF manifest')
    expect(exportRoute).toContain('409')
  })

  test('defines the premium product as the exact 15 constituent immigration packs', () => {
    expect(bundleMap).toContain("'premium-usa-canada-study-work-mega-bundle'")
    for (const slug of expectedMegaComponents) {
      expect(bundleMap).toContain(`'${slug}'`)
    }
    expect(new Set(expectedMegaComponents).size).toBe(15)
  })

  test('exposes a QA-gated multiple-file upload manifest for Payhip', () => {
    expect(bundleRoute).toContain('getPayhipBundleComponents')
    expect(bundleRoute).toContain('listManifestSlugs')
    expect(bundleRoute).toContain('has_explicit_manifest')
    expect(bundleRoute).toContain("upload_mode: 'multiple-files'")
    expect(bundleRoute).toContain('qa_required: true')
    expect(bundleRoute).toContain('409')
    expect(bundleRoute).toContain('/api/admin/templates/payhip-export/')
  })

  test('keeps the integrated mega workbook as a supplementary structured manifest', () => {
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
