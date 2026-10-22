import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createManagementSqlClient, readLedgerRows } from './supabase-management-sql.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REQUIREMENTS_PATH = join(ROOT, 'supabase/release-required-migration-receipts.json')

export async function verifyRequiredMigrationReceipts({
  root = ROOT,
  requirementsPath = REQUIREMENTS_PATH,
  env = process.env,
  readFileImpl = readFile,
  createClient = createManagementSqlClient,
  readRows = readLedgerRows,
  log = console,
} = {}) {
  const manifest = JSON.parse(await readFileImpl(requirementsPath, 'utf8'))
  if (manifest.version !== 1 || !Array.isArray(manifest.requirements)) {
    throw new Error('receipt gate: invalid requirements manifest')
  }

  const active = []
  for (const requirement of manifest.requirements) {
    if (
      typeof requirement.filename !== 'string' ||
      requirement.filename.includes('/') ||
      !/^[0-9a-f]{40}$/.test(requirement.source_git_sha)
    ) {
      throw new Error('receipt gate: invalid migration requirement')
    }
    const migrationPath = join(root, 'supabase/migrations', requirement.filename)
    try {
      const bytes = await readFileImpl(migrationPath)
      active.push({ ...requirement, migrationPath, sha256: createHash('sha256').update(bytes).digest('hex') })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        log.log(`RECEIPT GATE INACTIVE: ${requirement.filename} is absent from this checkout`)
        continue
      }
      throw error
    }
  }

  if (active.length === 0) return { active: false, verified: 0 }

  if (!env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_PROJECT_REF) {
    throw new Error('receipt gate: SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required for active requirements')
  }

  const client = createClient({
    accessToken: env.SUPABASE_ACCESS_TOKEN,
    projectRef: env.SUPABASE_PROJECT_REF,
  })
  const ledger = await readRows(client)
  if (!ledger?.exists) throw new Error('receipt gate: production migration ledger is missing')

  for (const requirement of active) {
    const row = ledger.rows.find((entry) => entry.filename === requirement.filename)
    if (!row) throw new Error(`receipt gate: ledger receipt missing for ${requirement.filename}`)
    if (row.sha256 !== requirement.sha256) {
      throw new Error(`receipt gate: sha256 mismatch for ${requirement.filename}`)
    }
    if (row.source_git_sha !== requirement.source_git_sha) {
      throw new Error(`receipt gate: source_git_sha mismatch for ${requirement.filename}`)
    }
    if (row.applied_by !== 'ci-runner') {
      throw new Error(`receipt gate: applied_by mismatch for ${requirement.filename}`)
    }
  }

  log.log(`RECEIPT GATE PASS: ${active.length} required migration receipt(s) match production ledger`)
  return { active: true, verified: active.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyRequiredMigrationReceipts().catch((error) => {
    console.error(`RECEIPT GATE FAILED: ${error.message}`)
    process.exitCode = 1
  })
}
