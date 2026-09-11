import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

import { PAYHIP_BATCH1_COMMERCIAL } from '../lib/payhipBatch1Commercial'
import { generatePayhipProductPdf } from '../lib/payhipExportPdf'
import {
  getPayhipBundleComponents,
  PREMIUM_USA_CANADA_MEGA_BUNDLE_SLUG,
} from '../lib/payhipProductBundles'

jest.setTimeout(120_000)

type QaRow = {
  slug: string
  bytes: number
  pages: number
  fields: number
  officialSources: number
  standaloneBatch1File: boolean
}

describe('Payhip buyer-facing PDF generation', () => {
  test('all 15 mega-bundle components generate valid fillable PDFs with official sources', async () => {
    const components = getPayhipBundleComponents(PREMIUM_USA_CANADA_MEGA_BUNDLE_SLUG)
    expect(components).not.toBeNull()
    expect(components).toHaveLength(15)

    const batch1Slugs = new Set(PAYHIP_BATCH1_COMMERCIAL.map((product) => product.slug))
    expect(batch1Slugs.size).toBe(9)
    expect(batch1Slugs.has(PREMIUM_USA_CANADA_MEGA_BUNDLE_SLUG)).toBe(true)

    const exportDir = process.env.PAYHIP_ARTIFACT_EXPORT_DIR?.trim()
    const megaDir = exportDir ? path.join(exportDir, 'mega') : null
    const previewDir = exportDir ? path.join(exportDir, 'previews') : null
    const megaPreview = exportDir ? await PDFDocument.create() : null
    if (exportDir && megaDir && previewDir) {
      fs.rmSync(exportDir, { recursive: true, force: true })
      fs.mkdirSync(megaDir, { recursive: true })
      fs.mkdirSync(previewDir, { recursive: true })
    }

    const qa: QaRow[] = []

    for (const slug of components ?? []) {
      const result = await generatePayhipProductPdf(slug, new Date('2026-09-11T00:00:00Z'))
      expect(result.bytes.byteLength).toBeGreaterThan(1_000)
      expect(result.officialSourceCount).toBeGreaterThan(0)
      expect(result.pageCount).toBeGreaterThanOrEqual(3)
      expect(result.fieldCount).toBeGreaterThan(0)

      const reopened = await PDFDocument.load(result.bytes)
      expect(reopened.getPageCount()).toBe(result.pageCount)
      expect(reopened.getForm().getFields().length).toBe(result.fieldCount)
      expect(reopened.getTitle()).toBeTruthy()
      expect(reopened.getAuthor()).toBe('YouSafe Consultancy')

      const standaloneBatch1File = batch1Slugs.has(slug)
      qa.push({
        slug,
        bytes: result.bytes.byteLength,
        pages: result.pageCount,
        fields: result.fieldCount,
        officialSources: result.officialSourceCount,
        standaloneBatch1File,
      })

      if (exportDir && megaDir && previewDir && megaPreview) {
        // The Mega Bundle ZIP is contractually exactly the 15 named buyer-facing PDFs.
        fs.writeFileSync(path.join(megaDir, `${slug}.pdf`), result.bytes)

        // Its customer preview shows the cover page of every included workbook,
        // proving breadth without giving away the paid worksheets.
        const [coverPage] = await megaPreview.copyPages(reopened, [0])
        megaPreview.addPage(coverPage)

        // Batch 1 also sells eight of those components as individual products.
        if (standaloneBatch1File) {
          fs.writeFileSync(path.join(exportDir, `${slug}.pdf`), result.bytes)

          // A three-page preview gives buyers cover + preparation guidance + one
          // representative worksheet page. It is a separate teaser, never the
          // purchased deliverable.
          const preview = await PDFDocument.create()
          const indexes = Array.from({ length: Math.min(3, reopened.getPageCount()) }, (_, index) => index)
          const pages = await preview.copyPages(reopened, indexes)
          pages.forEach((page) => preview.addPage(page))
          preview.setTitle(`${reopened.getTitle() || slug} — Preview`)
          preview.setAuthor('YouSafe Consultancy')
          preview.setSubject('Customer preview — preparation resource')
          const previewBytes = await preview.save()
          const previewPath = path.join(previewDir, `${slug}-preview.pdf`)
          fs.writeFileSync(previewPath, previewBytes)
          const previewReopened = await PDFDocument.load(previewBytes)
          expect(previewReopened.getPageCount()).toBe(indexes.length)
        }
      }
    }

    if (exportDir && previewDir && megaPreview) {
      // The Mega Bundle itself is packaged by CI from the mega/ directory after
      // this test; do not emit a fake single-PDF mega artifact.
      expect(qa.filter((row) => row.standaloneBatch1File)).toHaveLength(8)

      megaPreview.setTitle('Premium USA + Canada Study/Work Mega Bundle — Preview')
      megaPreview.setAuthor('YouSafe Consultancy')
      megaPreview.setSubject('Customer preview — cover page of all 15 included workbooks')
      const megaPreviewBytes = await megaPreview.save()
      expect((await PDFDocument.load(megaPreviewBytes)).getPageCount()).toBe(15)
      fs.writeFileSync(
        path.join(previewDir, `${PREMIUM_USA_CANADA_MEGA_BUNDLE_SLUG}-preview.pdf`),
        megaPreviewBytes,
      )

      fs.writeFileSync(
        path.join(exportDir, 'qa-manifest.json'),
        JSON.stringify(
          {
            generatedAt: '2026-09-11T00:00:00Z',
            megaBundleSlug: PREMIUM_USA_CANADA_MEGA_BUNDLE_SLUG,
            megaBundleComponents: components,
            standaloneBatch1Slugs: qa.filter((row) => row.standaloneBatch1File).map((row) => row.slug),
            previewFiles: [
              `${PREMIUM_USA_CANADA_MEGA_BUNDLE_SLUG}-preview.pdf`,
              ...qa
                .filter((row) => row.standaloneBatch1File)
                .map((row) => `${row.slug}-preview.pdf`),
            ],
            files: qa,
          },
          null,
          2,
        ),
      )
    }
  })
})
