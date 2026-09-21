/**
 * P6 — no unverified path may set `seo_interlinks.status = 'applied'`.
 *
 * Exhaustive repository audit:
 *   · the only writers of `seo_interlinks` are server-side modules: the
 *     planner, the live-proof verifier and the operator-run Batch A
 *     stale-rejection CLI (`scripts/p6-batch-a-stale-rejection.mts`) plus the
 *     operator-run Batch B source-stale CLI
 *     (`scripts/p6-source-stale-rejection.mts`), whose only write is the
 *     exact-row-CAS `status='rejected'` stale disposition with a gate-creditable
 *     allowlisted reason; neither can write `applied` or any
 *     verification/proof column;
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
    expect(writers).toEqual([
      'lib/seoEngine/interlink.ts',
      'lib/seoFactory/interlinkVerification.ts',
      'scripts/p6-batch-a-stale-rejection.mts',
      'scripts/p6-source-stale-rejection.mts',
    ])
  })

  it('the Batch A operator CLI can only write the fenced rejected disposition', () => {
    const body = read(path.join(ROOT, 'scripts/p6-batch-a-stale-rejection.mts'))
    // The only write is the pure planner's patch, applied through every CAS
    // fence entry and read back so a zero-row race is a skip, never success.
    expect(body).toMatch(/update\(write\.patch\)/)
    expect(body).toContain(".select('id')")
    expect(body).toMatch(
      /entry\.op === 'eq' \? query\.eq\(entry\.column, entry\.value\) : query\.is\(entry\.column, null\)/,
    )
    expect(body).not.toMatch(APPLIED_STATUS_RE)
    expect(body).not.toMatch(/\.(upsert|insert|delete|rpc)\s*\(/)
  })

  it('the Batch B operator CLI can only write the fenced rejected disposition', () => {
    const body = read(path.join(ROOT, 'scripts/p6-source-stale-rejection.mts'))
    // Same shape as Batch A: the pure planner's patch, applied through every CAS
    // fence entry and read back so a zero-row race is a skip, never success.
    expect(body).toMatch(/update\(write\.patch\)/)
    expect(body).toContain(".select('id')")
    expect(body).toMatch(
      /entry\.op === 'eq' \? query\.eq\(entry\.column, entry\.value\) : query\.is\(entry\.column, null\)/,
    )
    expect(body).not.toMatch(APPLIED_STATUS_RE)
    expect(body).not.toMatch(/\.(upsert|insert|delete|rpc)\s*\(/)
    // The write patch itself comes from the pure module, whose reason argument
    // is validated against the ONE allowlist the read-only gate also counts.
    const pure = read(path.join(ROOT, 'scripts/p6SourceStaleRejection.ts'))
    expect(pure).toContain('P6_SOURCE_STALE_GATE_REASONS.includes(gateReason)')
    expect(pure).not.toMatch(APPLIED_STATUS_RE)
  })

  it('the applied migration keeps seo_interlinks writes service-role-only', () => {
    // Least privilege: an anon/authenticated client can only ever SELECT, so a
    // degraded (anon) key can never silently write this lane.
    const migration = read(
      path.join(ROOT, 'supabase/migrations/20260920130000_seo_interlinks_verification_truth.sql'),
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.seo_interlinks from public, anon, authenticated;/,
    )
    expect(migration).toMatch(/grant select on table public\.seo_interlinks to anon, authenticated;/)
    expect(migration).toMatch(/grant all privileges on table public\.seo_interlinks to service_role;/)
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
    // The applied patch is written through the shared guarded helper, so the
    // planned-only fence lives there (the string distance from the applied
    // patch literal to the helper is far larger than a fixed slice).
    const helperIndex = body.indexOf('async function writePlannedRowPatch')
    expect(helperIndex).toBeGreaterThan(0)
    const helper = body.slice(helperIndex, helperIndex + 1600)
    expect(helper).toContain(".eq('status', 'planned')")
    // M2: every finalizer/verdict write is additionally a compare-and-set on
    // the exact subject when finalization is job-bound.
    expect(helper).toContain('fence?.sourceJobId')
    expect(helper).toContain('fence?.sourceUrl')
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
