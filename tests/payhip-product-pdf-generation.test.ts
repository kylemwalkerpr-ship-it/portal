import { PDFDocument } from 'pdf-lib'

import { generatePayhipProductPdf } from '../lib/payhipExportPdf'
import {
  getPayhipBundleComponents,
  PREMIUM_USA_CANADA_MEGA_BUNDLE_SLUG,
} from '../lib/payhipProductBundles'

jest.setTimeout(120_000)

describe('Payhip buyer-facing PDF generation', () => {
  test('all 15 mega-bundle components generate valid fillable PDFs with official sources', async () => {
    const components = getPayhipBundleComponents(PREMIUM_USA_CANADA_MEGA_BUNDLE_SLUG)
    expect(components).not.toBeNull()
    expect(components).toHaveLength(15)

    for (const slug of components ?? []) {
      const result = await generatePayhipProductPdf(slug, new Date('2026-09-10T00:00:00Z'))
      expect(result.bytes.byteLength).toBeGreaterThan(1_000)
      expect(result.officialSourceCount).toBeGreaterThan(0)
      expect(result.pageCount).toBeGreaterThanOrEqual(3)
      expect(result.fieldCount).toBeGreaterThan(0)

      const reopened = await PDFDocument.load(result.bytes)
      expect(reopened.getPageCount()).toBe(result.pageCount)
      expect(reopened.getForm().getFields().length).toBe(result.fieldCount)
      expect(reopened.getTitle()).toBeTruthy()
      expect(reopened.getAuthor()).toBe('YouSafe Consultancy')
    }
  })
})
