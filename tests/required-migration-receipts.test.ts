import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const scriptUrl = pathToFileURL(resolve(process.cwd(), 'scripts/verify-required-migration-receipts.mjs')).href
const CHILD = `
  const { verifyRequiredMigrationReceipts } = await import(process.env.RECEIPT_VERIFIER_URL)
  const input = JSON.parse(process.env.RECEIPT_GATE_CASE)
  const readRows = async () => {
    if (input.queryError) throw new Error('management query failed')
    return { exists: true, rows: input.rows }
  }
  try {
    const result = await verifyRequiredMigrationReceipts({
      root: input.root,
      requirementsPath: input.requirementsPath,
      env: input.credentials ? { SUPABASE_ACCESS_TOKEN: 'test-token', SUPABASE_PROJECT_REF: 'test-project' } : {},
      createClient: () => ({}),
      readRows,
      log: { log() {} },
    })
    process.stdout.write(JSON.stringify({ result }))
  } catch (error) {
    process.stderr.write(String(error?.message ?? error))
    process.exitCode = 1
  }
`

describe('required production migration receipt gate', () => {
  let root: string | undefined
  let requirement: { filename: string; source_git_sha: string; reason: string }
  let migrationBytes: Buffer
  let sha256: string
  const sourceSha = 'c8ef82ee0635124ad9114ca0fef675c775d1b6cc'

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'required-migration-receipts-'))
    mkdirSync(join(root, 'supabase/migrations'), { recursive: true })
    requirement = { filename: '20260923120000_p11_audit_idempotency.sql', source_git_sha: sourceSha, reason: 'reviewed' }
    migrationBytes = Buffer.from('SELECT 1;\n')
    sha256 = createHash('sha256').update(migrationBytes).digest('hex')
    writeFileSync(join(root, 'requirements.json'), JSON.stringify({ version: 1, requirements: [requirement] }))
  })

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
    root = undefined
  })

  const testRoot = () => {
    if (!root) throw new Error('test fixture root was not initialized')
    return root
  }
  const writeMigration = () => writeFileSync(join(testRoot(), 'supabase/migrations', requirement.filename), migrationBytes)
  const exactRow = () => ({ filename: requirement.filename, sha256, source_git_sha: sourceSha, applied_by: 'ci-runner' })
  const runVerifier = (input: { credentials?: boolean; rows?: unknown[]; queryError?: boolean }) => {
    const fixtureRoot = testRoot()
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], {
      encoding: 'utf8',
      env: {
        ...process.env,
        RECEIPT_VERIFIER_URL: scriptUrl,
        RECEIPT_GATE_CASE: JSON.stringify({
          root: fixtureRoot,
          requirementsPath: join(fixtureRoot, 'requirements.json'),
          ...input,
        }),
      },
    })
    if (result.error) throw result.error
    return { status: result.status, stdout: result.stdout, stderr: result.stderr }
  }

  test('skips inactive requirements without requiring credentials', async () => {
    const result = runVerifier({})
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).result).toEqual({ active: false, verified: 0 })
  })

  test('blocks when an active migration has no ledger row', async () => {
    writeMigration()
    const result = runVerifier({ credentials: true, rows: [] })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('ledger receipt missing')
  })

  test('blocks an active hash mismatch', async () => {
    writeMigration()
    const result = runVerifier({ credentials: true, rows: [{ ...exactRow(), sha256: '0'.repeat(64) }] })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('sha256 mismatch')
  })

  test('blocks an active reviewed source SHA mismatch', async () => {
    writeMigration()
    const result = runVerifier({ credentials: true, rows: [{ ...exactRow(), source_git_sha: '1'.repeat(40) }] })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('source_git_sha mismatch')
  })

  test('blocks an active applied_by mismatch', async () => {
    writeMigration()
    const result = runVerifier({ credentials: true, rows: [{ ...exactRow(), applied_by: 'adoption-baseline' }] })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('applied_by mismatch')
  })

  test('blocks management query failures', async () => {
    writeMigration()
    const result = runVerifier({ credentials: true, queryError: true })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('management query failed')
  })

  test('passes only for the exact receipt', async () => {
    writeMigration()
    const result = runVerifier({ credentials: true, rows: [exactRow()] })
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).result).toEqual({ active: true, verified: 1 })
  })

  test('the deploy workflow has a fail closed receipt gate before the deploy step', () => {
    const workflow = require('node:fs').readFileSync(join(process.cwd(), '.github/workflows/deploy.yml'), 'utf8') as string
    const gateStart = workflow.indexOf('- name: Verify required production migration receipts')
    const deployStart = workflow.indexOf('- name: Deploy via OpenNext to Cloudflare (with transient-failure retry)')
    expect(gateStart).toBeGreaterThan(-1)
    expect(deployStart).toBeGreaterThan(gateStart)
    const gate = workflow.slice(gateStart, deployStart)
    const deploy = workflow.slice(deployStart, workflow.indexOf('\n      - name:', deployStart + 1))
    expect(gate).toContain("if: github.event_name != 'pull_request'")
    expect(gate).toContain('node scripts/verify-required-migration-receipts.mjs')
    expect(gate).not.toContain('continue-on-error: true')
    expect(deploy).toContain("if: github.event_name != 'pull_request'")
    expect(deploy).not.toContain('continue-on-error: true')
    // GitHub Actions applies implicit success() to steps without an explicit status function.
    expect(gate).not.toMatch(/if:.*(?:always|failure|cancelled)\s*\(/)
    expect(deploy).not.toMatch(/if:.*(?:always|failure|cancelled)\s*\(/)
  })
})
