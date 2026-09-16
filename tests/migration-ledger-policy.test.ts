/**
 * Guards the migration ledger policy module:
 *  - the frozen 69-file baseline manifest (shape, tiers, order, hashes);
 *  - baseline/future naming policy (spec §9.1–9.3);
 *  - the `--check` CLI.
 *
 * The policy module is ESM and is exercised through child subprocesses (same
 * pattern as migration-order.test.ts), so what CI runs is what is tested.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const POLICY = join(ROOT, 'scripts', 'migration-ledger-policy.mjs')
const ORDER = join(ROOT, 'scripts', 'migration-order.mjs')
const MANIFEST = join(ROOT, 'supabase', 'migration-baseline.json')

function evalPolicy<T>(body: string): T {
  const code = `
    const policy = await import(${JSON.stringify(POLICY)})
    const { migrationOrder, MIGRATIONS_DIR } = await import(${JSON.stringify(ORDER)})
    ${body}
  `
  return JSON.parse(execFileSync('node', ['--input-type=module', '--eval', code], { encoding: 'utf8' }))
}

function evalPolicyFail(body: string): { status: number; stderr: string } {
  const code = `
    const policy = await import(${JSON.stringify(POLICY)})
    const { migrationOrder, MIGRATIONS_DIR } = await import(${JSON.stringify(ORDER)})
    ${body}
  `
  const res = spawnSync('node', ['--input-type=module', '--eval', code], { encoding: 'utf8' })
  return { status: res.status ?? -1, stderr: res.stderr }
}

describe('migration ledger manifest', () => {
  it('T1.1 pins the manifest shape and provenance', () => {
    const shape = evalPolicy<{
      manifestVersion: number
      fileCount: number
      migrationCount: number
      repository: string
      migrationOrderSource: string
      ledgerSchema: string
      ledgerTable: string
    }>(`
      const manifest = policy.loadManifest()
      console.log(JSON.stringify({
        manifestVersion: policy.MANIFEST_VERSION,
        fileCount: manifest.files.length,
        migrationCount: manifest.generatedFrom.migrationCount,
        repository: manifest.generatedFrom.repository,
        migrationOrderSource: manifest.generatedFrom.migrationOrderSource,
        ledgerSchema: manifest.ledger.schema,
        ledgerTable: manifest.ledger.table,
      }))
    `)
    expect(shape).toEqual({
      manifestVersion: 1,
      fileCount: 69,
      migrationCount: 69,
      repository: 'kylemwalkerpr-ship-it/portal',
      migrationOrderSource: 'scripts/migration-order.mjs',
      ledgerSchema: 'supabase_migrations',
      ledgerTable: 'yousafe_migration_ledger',
    })
  })

  it('T1.2 splits tiers 8/57/4, marks every entry legacy, keeps names unique', () => {
    const tiers = evalPolicy<{
      base: number
      timestamped: number
      index: number
      allLegacy: boolean
      uniqueNames: boolean
    }>(`
      const manifest = policy.loadManifest()
      const counts = { base: 0, timestamped: 0, index: 0 }
      for (const entry of manifest.files) counts[entry.tier] += 1
      console.log(JSON.stringify({
        ...counts,
        allLegacy: manifest.files.every((entry) => entry.legacy === true),
        uniqueNames: new Set(manifest.files.map((entry) => entry.filename)).size === manifest.files.length,
      }))
    `)
    expect(tiers).toEqual({
      base: 8,
      timestamped: 57,
      index: 4,
      allLegacy: true,
      uniqueNames: true,
    })
  })

  it('T1.3 freezes the manifest order to migrationOrder()', () => {
    const names = evalPolicy<string[]>(`
      console.log(JSON.stringify(policy.loadManifest().files.map((entry) => entry.filename)))
    `)
    const order = evalPolicy<string[]>(`
      console.log(JSON.stringify(migrationOrder()))
    `)
    expect(names).toEqual(order)
  })

  it('T1.4 matches independently computed SHA-256 for every file', () => {
    const result = evalPolicy<{
      mismatches: string[]
      count: number
      contentJobs: string
      supportSecurityBoundary: string
    }>(`
      const { createHash } = await import('node:crypto')
      const { readFileSync: read } = await import('node:fs')
      const { join: joinPath } = await import('node:path')
      const manifest = policy.loadManifest()
      const mismatches = manifest.files
        .filter((entry) => {
          const digest = createHash('sha256')
            .update(read(joinPath(MIGRATIONS_DIR, entry.filename)))
            .digest('hex')
          return digest !== entry.sha256
        })
        .map((entry) => entry.filename)
      const sha = (name) => manifest.files.find((entry) => entry.filename === name).sha256
      console.log(JSON.stringify({
        mismatches,
        count: manifest.files.length,
        contentJobs: sha('content_jobs.sql'),
        supportSecurityBoundary: sha('20260915_support_security_boundary.sql'),
      }))
    `)
    expect(result.mismatches).toEqual([])
    expect(result.count).toBe(69)
    expect(result.contentJobs).toBe(
      '5447521c49918ab21406ece72eb6fcf0bb73c56fa8cb3f85c3faf0940fccb55b',
    )
    expect(result.supportSecurityBoundary).toBe(
      '6b551ec8090ec4b727459cb7fe45ebd2b584c9dca4a93d018ceaf0de10a151e3',
    )
  })

  it('T1.5 accepts the real manifest against the real order', () => {
    const result = evalPolicy<{ ok: boolean; violations: unknown[] }>(`
      const manifest = policy.loadManifest()
      console.log(JSON.stringify(policy.validateManifest(manifest, { order: migrationOrder() })))
    `)
    expect(result).toEqual({ ok: true, violations: [] })
  })

  it('T1.6 tolerates future 14-digit files outside the manifest (Phase 4+)', () => {
    const result = evalPolicy<{ ok: boolean; violations: unknown[] }>(`
      const manifest = policy.loadManifest()
      const order = migrationOrder()
      order.push('20270101120000_brand_new_thing.sql')
      console.log(JSON.stringify(policy.validateManifest(manifest, { order })))
    `)
    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('T1.7 reports the exact rule ID for each in-memory mutation', () => {
    const rules = evalPolicy<Record<string, string[]>>(`
      const manifest = policy.loadManifest()
      const order = migrationOrder()
      const rulesFor = (mutate) => {
        const mutated = structuredClone(manifest)
        mutate(mutated)
        return policy.validateManifest(mutated, { order }).violations.map((violation) => violation.rule)
      }
      console.log(JSON.stringify({
        hashDrift: rulesFor((m) => { m.files[0].sha256 = '0'.repeat(64) }),
        swapped: rulesFor((m) => {
          const [first, second] = [m.files[0], m.files[1]]
          m.files[0] = second
          m.files[1] = first
        }),
        tier: rulesFor((m) => { m.files[0].tier = 'index' }),
        legacy: rulesFor((m) => { m.files[0].legacy = false }),
        popped: rulesFor((m) => { m.files.pop() }),
        duplicate: rulesFor((m) => { m.files[1].filename = m.files[0].filename }),
        version: rulesFor((m) => { m.manifestVersion = 2 }),
        futureFile: rulesFor((m) => {
          m.files.push({
            filename: '20270101120000_x.sql',
            sha256: 'a'.repeat(64),
            tier: 'timestamped',
            legacy: true,
          })
        }),
      }))
    `)
    expect(rules.hashDrift).toContain('BASELINE_HASH_DRIFT')
    expect(rules.swapped).toContain('MANIFEST_ORDER_MISMATCH')
    expect(rules.tier).toContain('MANIFEST_TIER_MISMATCH')
    expect(rules.legacy).toContain('MANIFEST_LEGACY_FLAG_MISMATCH')
    expect(rules.popped).toContain('MANIFEST_COUNT_MISMATCH')
    expect(rules.duplicate).toContain('MANIFEST_DUPLICATE_FILENAME')
    expect(rules.version).toContain('MANIFEST_VERSION_MISMATCH')
    expect(rules.futureFile).toContain('MANIFEST_FUTURE_FILE')
  })

  it('T1.8 reports BASELINE_FILE_MISSING for every entry when the dir is empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'migration-ledger-policy-'))
    try {
      const result = evalPolicy<{ ok: boolean; rules: string[]; count: number }>(`
        const manifest = policy.loadManifest()
        const result = policy.validateManifest(manifest, { order: migrationOrder(), dir: ${JSON.stringify(dir)} })
        console.log(JSON.stringify({
          ok: result.ok,
          rules: result.violations.map((violation) => violation.rule),
          count: result.violations.length,
        }))
      `)
      expect(result.ok).toBe(false)
      expect(result.count).toBe(69)
      expect([...new Set(result.rules)]).toEqual(['BASELINE_FILE_MISSING'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('T1.9 requireExactEstate rejects a 70th migration; default stays tolerant', () => {
    const result = evalPolicy<{
      exactOk: boolean
      exactViolations: number
      strictRules: string[]
      strictEstateMessages: string[]
      toleratedOk: boolean
    }>(`
      const manifest = policy.loadManifest()
      const order = migrationOrder()
      const appended = [...order, '20270101120000_brand_new_thing.sql']
      const exact = policy.validateManifest(manifest, { order, requireExactEstate: true })
      const strictAppended = policy.validateManifest(manifest, { order: appended, requireExactEstate: true })
      const tolerated = policy.validateManifest(manifest, { order: appended })
      console.log(JSON.stringify({
        exactOk: exact.ok,
        exactViolations: exact.violations.length,
        strictRules: strictAppended.violations.map((violation) => violation.rule),
        strictEstateMessages: strictAppended.violations
          .filter((violation) => violation.rule === 'MANIFEST_ESTATE_CHANGED')
          .map((violation) => violation.message),
        toleratedOk: tolerated.ok,
      }))
    `)
    expect(result.exactOk).toBe(true)
    expect(result.exactViolations).toBe(0)
    expect(result.strictRules).toContain('MANIFEST_ESTATE_CHANGED')
    expect(result.strictEstateMessages[0]).toContain('found 70')
    expect(result.toleratedOk).toBe(true)
  })
})

describe('migration naming policy', () => {
  it('T2.1 pins the future/legacy/ordering patterns', () => {
    const regex = evalPolicy<Record<string, boolean>>(`
      console.log(JSON.stringify({
        futureValid: policy.FUTURE_MIGRATION_RE.test('20270101120000_brand_new_thing.sql'),
        futureLegacyShape: policy.FUTURE_MIGRATION_RE.test('20270101_brand_new_thing.sql'),
        futureUppercase: policy.FUTURE_MIGRATION_RE.test('20270101120000_Brand_New.sql'),
        futureShortPrefix: policy.FUTURE_MIGRATION_RE.test('2027010112000_brand.sql'),
        legacyBaseline: policy.LEGACY_TIMESTAMPED_RE.test('20260915_support_security_boundary.sql'),
        legacyRejectsFuture: policy.LEGACY_TIMESTAMPED_RE.test('20270101120000_brand_new_thing.sql'),
        orderingEight: policy.ORDERING_TIMESTAMPED_RE.test('20260915_support_security_boundary.sql'),
        orderingFourteen: policy.ORDERING_TIMESTAMPED_RE.test('20270101120000_brand_new_thing.sql'),
      }))
    `)
    expect(regex).toEqual({
      futureValid: true,
      futureLegacyShape: false,
      futureUppercase: false,
      futureShortPrefix: false,
      legacyBaseline: true,
      legacyRejectsFuture: false,
      orderingEight: true,
      orderingFourteen: true,
    })
  })

  it('T2.2 validates UTC calendar instants', () => {
    const checks = evalPolicy<Record<string, boolean>>(`
      const check = (digits) => policy.isValidUtcTimestampDigits(digits)
      console.log(JSON.stringify({
        valid: check('20270101120000'),
        feb28: check('20270228120000'),
        nonLeapFeb29: check('20260229120000'),
        month13: check('20261301120000'),
        hour26: check('20270101126000'),
        short: check('2027010112000'),
      }))
    `)
    expect(checks).toEqual({
      valid: true,
      feb28: true,
      nonLeapFeb29: false,
      month13: false,
      hour26: false,
      short: false,
    })
  })

  it('T2.3 applies grandfather/future rules to the on-disk order', () => {
    const result = evalPolicy<Record<string, { ok: boolean; rules: string[] }>>(`
      const manifest = {
        files: [{ filename: '20260915_baseline.sql', sha256: 'a'.repeat(64), tier: 'timestamped', legacy: true }],
      }
      const check = (order) => {
        const result = policy.validateMigrationSet({ order, manifest })
        return { ok: result.ok, rules: result.violations.map((violation) => violation.rule) }
      }
      console.log(JSON.stringify({
        baseline: check(['20260915_baseline.sql']),
        newLegacy: check(['20260915_baseline.sql', '20270101_new_thing.sql']),
        validFuture: check(['20260915_baseline.sql', '20270101120000_new_thing.sql']),
        invalidCalendar: check(['20260915_baseline.sql', '20270230120000_new.sql']),
        uppercase: check(['20260915_baseline.sql', '20270101120000_New.sql']),
        duplicateTimestamp: check([
          '20260915_baseline.sql',
          '20270101120000_new_thing.sql',
          '20270101120000_other_thing.sql',
        ]),
        unknownPinned: check(['20260915_baseline.sql', 'brand_new_thing.sql']),
      }))
    `)
    expect(result.baseline).toEqual({ ok: true, rules: [] })
    expect(result.newLegacy.rules).toContain('REJECT_NEW_LEGACY_NAME')
    expect(result.validFuture).toEqual({ ok: true, rules: [] })
    expect(result.invalidCalendar.rules).toContain('REJECT_FUTURE_NAME')
    expect(result.uppercase.rules).toContain('REJECT_FUTURE_NAME')
    expect(result.duplicateTimestamp.rules).toContain('REJECT_DUPLICATE_TIMESTAMP')
    expect(result.unknownPinned.rules).toContain('REJECT_UNKNOWN_PINNED_NAME')
  })

  it('T2.4 hashes bytes with sha256Hex', () => {
    const digest = evalPolicy<string>(`
      console.log(JSON.stringify(policy.sha256Hex('abc')))
    `)
    expect(digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('T2.5 passes the CLI --check over the real estate', () => {
    const res = spawnSync('node', [POLICY, '--check'], { encoding: 'utf8' })
    expect(res.status).toBe(0)
    expect(res.stderr).toContain(
      'migration-ledger-policy: manifest OK (69 files: 8 base, 57 timestamped, 4 index)',
    )
    expect(res.stderr).toContain('migration-ledger-policy: naming policy OK')
  })
})
