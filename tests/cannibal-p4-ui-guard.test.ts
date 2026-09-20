/**
 * P4 Work Plan / Command Center UI guard.
 *
 * Destructive consolidation must be unreachable from the admin UI: no
 * `mode:'merge'` payload to /api/seo-factory/cannibal-merge, no auto-selected
 * winner by impressions, and no sweep that can emit destructive requests. These
 * are source-level assertions because the failure mode being prevented is a UI
 * affordance silently reappearing.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const CONTENT_STUDIO = readFileSync(join(ROOT, 'components/design/admin-content-studio.tsx'), 'utf8')
const COMMAND_CENTER = readFileSync(join(ROOT, 'components/design/admin-command-center.tsx'), 'utf8')
const E2E_SPEC = readFileSync(join(ROOT, 'e2e/studio-cannibal-resolve.spec.ts'), 'utf8')

const MERGE_ENDPOINT = "'/api/seo-factory/cannibal-merge'"
const PAGES_ENDPOINT = "'/api/seo-factory/cannibal-pages'"

function blockOf(source: string, name: string): string {
  const start = source.indexOf(name)
  expect(start).toBeGreaterThan(-1)
  // Slice to the next top-level `const ` declaration after the match.
  const rest = source.slice(start + name.length)
  const nextDecl = rest.search(/\n  const [a-zA-Z]/)
  return nextDecl === -1 ? rest : rest.slice(0, nextDecl)
}

describe('P4 UI guard — no destructive cannibal requests', () => {
  it('never posts mode:merge to cannibal-merge from either admin surface', () => {
    for (const source of [CONTENT_STUDIO, COMMAND_CENTER, E2E_SPEC]) {
      expect(source).not.toMatch(/mode:\s*['"`]merge['"`]/)
    }
  })

  it('removed the destructive cannibal-merge call from the Content Studio', () => {
    expect(CONTENT_STUDIO).not.toContain(MERGE_ENDPOINT)
    expect(CONTENT_STUDIO).toContain(PAGES_ENDPOINT)
  })

  it('removed the destructive cannibal-merge call from the Command Center', () => {
    expect(COMMAND_CENTER).not.toContain(MERGE_ENDPOINT)
  })

  it('Review-all is a read-only evidence sweep (cannibal-pages only)', () => {
    const sweep = blockOf(CONTENT_STUDIO, 'handleReviewAllCannibal')
    expect(sweep).toContain('reviewOneCannibal')
    expect(sweep).not.toContain('cannibal-merge')
    expect(sweep).not.toContain('setResolvedCannibalIds')
    const review = blockOf(CONTENT_STUDIO, 'reviewOneCannibal')
    expect(review).toContain(PAGES_ENDPOINT)
    expect(review).not.toContain('cannibal-merge')
  })

  it('has no "Resolve all" destructive affordance left', () => {
    expect(CONTENT_STUDIO).not.toContain('Resolve all')
    expect(CONTENT_STUDIO).not.toContain('Auto-resolve')
    expect(E2E_SPEC).not.toContain('Auto-resolve')
  })

  it('never auto-selects a winner by impressions', () => {
    for (const source of [CONTENT_STUDIO, COMMAND_CENTER]) {
      expect(source).not.toMatch(/sort\(\(a,\s*b\)\s*=>\s*\(b\.impressions/)
      expect(source).not.toContain('suggestedWinner ||')
    }
    expect(COMMAND_CENTER).toContain("setCannibalWinner((prev) => ({ ...prev, [term]: '' }))")
  })

  it('labels operator picks as informational rather than authorised', () => {
    expect(COMMAND_CENTER).toContain('the P3 owner row authorizes the winner')
    expect(COMMAND_CENTER).toContain('Review evidence')
  })
})
