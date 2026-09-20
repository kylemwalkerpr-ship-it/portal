/**
 * P6 — no unverified path may set `seo_interlinks.status = 'applied'`.
 *
 * Exhaustive repository audit:
 *   · the only writers of `seo_interlinks` are server-side modules;
 *   · the only file that can write `status: 'applied'` is the live-proof
 *     verifier, and its applied patch must carry the full proof contract;
 *   · no browser/client component writes to the table (the Realtime
 *     subscription is read-only), which is what makes the migration's
 *     least-privilege grants safe.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SCAN_ROOTS = ['lib', 'app', 'scripts', 'components']
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs'])

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (CODE_EXTENSIONS.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

const FILES = SCAN_ROOTS.flatMap((root) => walk(path.join(ROOT, root)))
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/')
const read = (file: string) => fs.readFileSync(file, 'utf8')

const SEQUEL_WRITE_RE = /\.from\(\s*['"]seo_interlinks['"]\s*\)[\s\S]{0,400}?\.(update|upsert|insert|delete)\s*\(/i
const APPLIED_STATUS_RE = /status:\s*['"]applied['"]/

describe('A) every seo_interlinks write is server/admin code', () => {
  const writers = FILES.filter((file) => SEQUEL_WRITE_RE.test(read(file))).map(rel).sort()

  it('names exactly the allowed server-side writer modules', () => {
    expect(writers).toEqual(['lib/seoEngine/interlink.ts', 'lib/seoFactory/interlinkVerification.ts'])
  })

  it('the planner writer can only upsert plan metadata (no applied status)', () => {
    const body = read(path.join(ROOT, 'lib/seoEngine/interlink.ts'))
    expect(body).not.toMatch(APPLIED_STATUS_RE)
    expect(body).not.toMatch(/\.from\(\s*['"]seo_interlinks['"]\s*\)\s*[\s\S]{0,200}?\.update\s*\(/)
  })

  it('no client component writes to seo_interlinks', () => {
    const clientWriters = FILES.filter(
      (file) => read(file).includes("'use client'") && SEQUEL_WRITE_RE.test(read(file)),
    )
    expect(clientWriters.map(rel)).toEqual([])
    // The Content Studio browser dependency is the read-only Realtime list.
    const studio = read(path.join(ROOT, 'components/design/admin-content-studio.tsx'))
    expect(studio).toContain("'seo_interlinks',")
    expect(studio).not.toContain(".from('seo_interlinks')")
  })
})

describe('B) the only applied writer carries the full proof contract', () => {
  const appliedWriters = FILES.filter((file) => APPLIED_STATUS_RE.test(read(file))).map(rel).sort()

  it('names exactly the live-proof verifier', () => {
    expect(appliedWriters).toEqual(['lib/seoFactory/interlinkVerification.ts'])
  })

  it('writes status applied together with applied_at, source_url, present state, verified_at and evidence', () => {
    const body = read(path.join(ROOT, 'lib/seoFactory/interlinkVerification.ts'))
    const appliedIndex = body.indexOf("status: 'applied'")
    expect(appliedIndex).toBeGreaterThan(0)
    const patch = body.slice(appliedIndex, appliedIndex + 600)
    expect(patch).toContain('applied_at: now')
    expect(patch).toContain('source_url:')
    expect(patch).toContain("verification_state: 'present'")
    expect(patch).toContain('verified_at: now')
    expect(patch).toContain('verification_evidence:')
  })

  it('guards the applied write to planned rows only', () => {
    const body = read(path.join(ROOT, 'lib/seoFactory/interlinkVerification.ts'))
    const appliedIndex = body.indexOf("status: 'applied'")
    const tail = body.slice(appliedIndex, appliedIndex + 1200)
    expect(tail).toContain(".eq('status', 'planned')")
  })
})

describe('C) the old unguarded writers are gone', () => {
  const allCode = FILES.map((file) => ({ file: rel(file), body: read(file) }))

  it('removes markInterlinkApplied from the codebase', () => {
    expect(allCode.filter(({ body }) => body.includes('markInterlinkApplied')).map(({ file }) => file)).toEqual([])
  })

  it('removes the pre-verification recordAppliedEngineInterlinks ship helper', () => {
    expect(allCode.filter(({ body }) => body.includes('recordAppliedEngineInterlinks')).map(({ file }) => file)).toEqual([])
  })

  it('ship.ts only stages interlinks, twice, and never writes an applied status', () => {
    const ship = read(path.join(ROOT, 'lib/seoFactory/ship.ts'))
    expect(ship.match(/stageEngineInterlinksForVerification\(/g)?.length).toBe(2)
    expect(ship).not.toMatch(APPLIED_STATUS_RE)
  })
})
