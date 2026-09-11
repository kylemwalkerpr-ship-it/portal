import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'lib/caseworksClusterMap.ts'), 'utf8')

const retiredPaths = [
  "path: '/us/f1-document-checklist-2026'",
  "path: '/us/f1-visa-rejection-recovery'",
  "path: '/us/opt-document-checklist-2026'",
  "path: '/ca/spousal-sponsorship-document-checklist'",
  "path: '/uk/tenancy/uk-renters-rights-act-2025-complete-guide'",
  "path: '/uk/tenancy/section-21-abolished-meaning-for-students'",
  "path: '/uk/tenancy/deposit-dispute-letter-uk-tenant'",
  "path: '/us/f1-school-transfer'",
  "path: '/us/f1-reinstatement-checklist'",
  "path: '/us/f1-status-violation'",
]

const canonicalPaths = [
  '/us/student-visas/f1-document-checklist-2026',
  '/us/student-visas/f1-rejection-recovery',
  '/us/student-visas/opt-document-checklist',
  '/ca/family/canada-spousal-sponsorship-document-checklist-2026',
  '/uk/renters-rights-international-students',
  '/uk/section-21-abolished',
  '/templates/deposit-dispute-letter-uk-tenant',
  '/us/student-visas/f1-school-transfer-mid-program',
  '/us/student-visas/sevis-termination-and-reinstatement',
  '/us/student-visas/f1-status-violation',
]

describe('MyCaseworks Marketplace rail link contract', () => {
  test('does not reintroduce retired 404 rail paths', () => {
    for (const retired of retiredPaths) expect(source).not.toContain(retired)
  })

  test('keeps the verified live canonical replacements', () => {
    for (const canonical of canonicalPaths) expect(source).toContain(canonical)
  })
})
