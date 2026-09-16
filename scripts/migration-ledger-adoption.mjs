import { migrationOrder, MIGRATIONS_DIR } from './migration-order.mjs'
import {
  MANIFEST_PATH,
  loadManifest,
  validateManifest,
  validateMigrationSet,
} from './migration-ledger-policy.mjs'
import {
  classifyResult,
  verifyPostgresRuntimeRole,
  readNativeMigrationHistory,
  readLedgerRows,
} from './supabase-management-sql.mjs'

export class AdoptionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AdoptionError'
  }
}

const FILENAME_RE = /^[a-z0-9_.]+\.sql$/
const SHA256_RE = /^[0-9a-f]{64}$/
const GIT_SHA_RE = /^[0-9a-f]{40}$/

export function composeLedgerDdl() {
  return `CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.yousafe_migration_ledger (
  filename       text        NOT NULL,
  sha256         text        NOT NULL,
  applied_at     timestamptz NOT NULL DEFAULT now(),
  source_git_sha text        NOT NULL,
  applied_by     text        NOT NULL,
  CONSTRAINT yousafe_migration_ledger_pkey        PRIMARY KEY (filename),
  CONSTRAINT yousafe_migration_ledger_sha256_hex  CHECK (char_length(sha256) = 64 AND sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT yousafe_migration_ledger_git_hex     CHECK (char_length(source_git_sha) = 40 AND source_git_sha ~ '^[0-9a-f]{40}$'),
  CONSTRAINT yousafe_migration_ledger_applied_by  CHECK (applied_by IN ('adoption-baseline', 'ci-runner'))
);
CREATE OR REPLACE FUNCTION supabase_migrations.yousafe_migration_ledger_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'yousafe_migration_ledger is append-only; % is not permitted', TG_OP
    USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS yousafe_migration_ledger_immutable
  ON supabase_migrations.yousafe_migration_ledger;
CREATE TRIGGER yousafe_migration_ledger_immutable
  BEFORE UPDATE OR DELETE ON supabase_migrations.yousafe_migration_ledger
  FOR EACH ROW EXECUTE FUNCTION supabase_migrations.yousafe_migration_ledger_immutable();
REVOKE ALL ON supabase_migrations.yousafe_migration_ledger
  FROM PUBLIC, anon, authenticated;`
}

export function composeBaselineInsert({ rows, sourceGitSha }) {
  if (!Array.isArray(rows) || rows.length !== 69) {
    throw new AdoptionError(`ADOPTION FAILED: expected exactly 69 baseline rows, got ${rows?.length}`)
  }
  if (!GIT_SHA_RE.test(sourceGitSha ?? '')) {
    throw new AdoptionError(`ADOPTION FAILED: sourceGitSha must be 40 lowercase hex`)
  }
  for (const row of rows) {
    if (!FILENAME_RE.test(row.filename ?? '')) throw new AdoptionError(`ADOPTION FAILED: invalid filename literal: ${row.filename}`)
    if (!SHA256_RE.test(row.sha256 ?? '')) throw new AdoptionError(`ADOPTION FAILED: invalid sha256 literal for ${row.filename}`)
  }
  const values = rows
    .map((row) => `  ('${row.filename}', '${row.sha256}', '${sourceGitSha}', 'adoption-baseline')`)
    .join(',\n')
  return `BEGIN;
INSERT INTO supabase_migrations.yousafe_migration_ledger
  (filename, sha256, source_git_sha, applied_by)
VALUES
${values};
DO $$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.yousafe_migration_ledger) <> 69
     OR (SELECT count(DISTINCT filename) FROM supabase_migrations.yousafe_migration_ledger) <> 69
     OR (SELECT count(*) FROM supabase_migrations.yousafe_migration_ledger
         WHERE applied_by = 'adoption-baseline'
           AND source_git_sha = '${sourceGitSha}') <> 69 THEN
    RAISE EXCEPTION 'baseline adoption incomplete: expected exactly 69 matching adoption rows';
  END IF;
END $$;
COMMIT;`
}

function exactMatch(manifest, ledgerRows) {
  if (ledgerRows.length !== 69) return false
  const byName = new Map(ledgerRows.map((row) => [row.filename, row]))
  if (byName.size !== 69) return false
  return manifest.files.every((file) => {
    const row = byName.get(file.filename)
    return (
      row !== undefined &&
      row.sha256 === file.sha256 &&
      row.applied_by === 'adoption-baseline' &&
      row.source_git_sha === manifest.generatedFrom.gitSha
    )
  })
}

export async function runAdoption({
  client,
  manifestPath = MANIFEST_PATH,
  migrationsDir = MIGRATIONS_DIR,
  expectedMainSha,
  assertAncestor,
  log = () => {},
}) {
  if (!GIT_SHA_RE.test(expectedMainSha ?? '')) {
    throw new AdoptionError('ADOPTION FAILED: expectedMainSha must be 40 lowercase hex')
  }
  if (typeof assertAncestor !== 'function') {
    throw new AdoptionError('ADOPTION FAILED: assertAncestor must be injected')
  }

  let order
  try {
    order = migrationOrder({ dir: migrationsDir })
  } catch (err) {
    throw new AdoptionError(
      `ADOPTION FAILED: baseline-estate-changed: migrationOrder() failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  const manifest = loadManifest(manifestPath)
  const manifestCheck = validateManifest(manifest, { order, dir: migrationsDir, requireExactEstate: true })
  if (!manifestCheck.ok) {
    const estate = manifestCheck.violations.find((v) => v.rule === 'MANIFEST_ESTATE_CHANGED')
    if (estate) {
      throw new AdoptionError(`ADOPTION FAILED: baseline-estate-changed: ${estate.message}; no 70th migration may exist before adoption`)
    }
    throw new AdoptionError(`ADOPTION FAILED: manifest invalid: ${manifestCheck.violations.map((v) => `${v.rule} ${v.filename ?? ''}`).join('; ')}`)
  }
  const namingCheck = validateMigrationSet({ order, manifest })
  if (!namingCheck.ok) {
    throw new AdoptionError(`ADOPTION FAILED: naming policy invalid: ${namingCheck.violations.map((v) => `${v.rule} ${v.filename}`).join('; ')}`)
  }
  if (!(await assertAncestor(manifest.generatedFrom.gitSha, expectedMainSha))) {
    throw new AdoptionError('ADOPTION FAILED: manifest baseline sha is not an ancestor of expected_main_sha')
  }

  const ledgerBefore = await readLedgerRows(client)
  if (ledgerBefore.exists && ledgerBefore.rows.length > 0) {
    if (exactMatch(manifest, ledgerBefore.rows)) {
      const summaryLine = `LEDGER ADOPTION ALREADY COMPLETE: 69/69 files, source_git_sha=${manifest.generatedFrom.gitSha}, writes=0`
      log(summaryLine)
      return { status: 'ALREADY_ADOPTED', sourceGitSha: manifest.generatedFrom.gitSha, inserted: 0, summaryLine }
    }
    throw new AdoptionError(`ADOPTION FAILED: ledger state mismatch (${ledgerBefore.rows.length} rows present); refusing to write`)
  }

  const nativePre = await readNativeMigrationHistory(client)
  const role = await verifyPostgresRuntimeRole(client)
  if (!role.ok) {
    throw new AdoptionError(
      `ADOPTION FAILED: runtime role is not postgres (current_user=${role.currentUser}, session_user=${role.sessionUser}); no writes sent`,
    )
  }
  log(
    `RUNTIME ROLE VERIFIED: current_user=${role.currentUser}, session_user=${role.sessionUser}, role=${role.role ?? 'null'}`,
  )

  const ddlResult = await client.execute(composeLedgerDdl())
  if (!ddlResult.ok) {
    throw new AdoptionError(`ADOPTION FAILED: ledger DDL failed (HTTP ${ddlResult.status}): ${String(ddlResult.body).slice(0, 400)}`)
  }

  const insertSql = composeBaselineInsert({
    rows: manifest.files.map((file) => ({ filename: file.filename, sha256: file.sha256 })),
    sourceGitSha: manifest.generatedFrom.gitSha,
  })

  // The plain 69-row baseline INSERT is sent exactly once and is NEVER retried:
  // a blind retry after an unknown response risks a duplicate or conflicting write.
  // A transient/unknown response is resolved by reading the ledger instead:
  //   exact 69/hash/provenance match  -> recovered successful adoption, no second INSERT
  //   absent/empty                    -> fail safely, supervised re-dispatch required
  //   partial/extra/hash/provenance mismatch -> production incident, fail closed
  let insertResult
  try {
    insertResult = await client.runSql(insertSql)
  } catch (err) {
    // Explicit interface contract: thrown network errors are status 0 (transient/unknown).
    insertResult = { ok: false, status: 0, body: String(err) }
  }
  let ledgerAfter
  let recovered = false
  if (!insertResult.ok) {
    if (classifyResult(insertResult) === 'permanent') {
      throw new AdoptionError(
        `ADOPTION FAILED: baseline insert failed permanently (HTTP ${insertResult.status}): ${String(insertResult.body).slice(0, 400)}; no retry and no second INSERT sent`,
      )
    }
    try {
      ledgerAfter = await readLedgerRows(client)
    } catch (err) {
      throw new AdoptionError(
        `ADOPTION FAILED: baseline insert response was transient/unknown and the reconciliation read failed (${err instanceof Error ? err.message : String(err)}); supervised re-dispatch is required`,
      )
    }
    if (ledgerAfter.exists && exactMatch(manifest, ledgerAfter.rows)) {
      recovered = true
    } else if (!ledgerAfter.exists || ledgerAfter.rows.length === 0) {
      throw new AdoptionError(
        'ADOPTION FAILED: baseline insert response was transient/unknown and the ledger is absent/empty; no blind retry was performed — supervised re-dispatch is required',
      )
    } else {
      throw new AdoptionError(
        'ADOPTION FAILED: baseline insert response was transient/unknown and the ledger is partial/extra/mismatched; production incident — failing closed',
      )
    }
  } else {
    ledgerAfter = await readLedgerRows(client)
  }

  if (!ledgerAfter.exists || !exactMatch(manifest, ledgerAfter.rows)) {
    throw new AdoptionError('ADOPTION FAILED: post-run ledger verification failed; treat as incident')
  }
  const nativePost = await readNativeMigrationHistory(client)
  if (JSON.stringify(nativePre) !== JSON.stringify(nativePost)) {
    throw new AdoptionError('ADOPTION FAILED: native schema_migrations changed; treat as incident')
  }

  const summaryLine = recovered
    ? `LEDGER ADOPTION VERIFIED (lost-response recovered): 69/69 files, source_git_sha=${manifest.generatedFrom.gitSha}, native_history_unchanged=true, runtime_role_verified=true, baseline_insert_requests=1`
    : `LEDGER ADOPTION VERIFIED: 69/69 files, source_git_sha=${manifest.generatedFrom.gitSha}, native_history_unchanged=true, runtime_role_verified=true`
  log(summaryLine)
  return { status: 'ADOPTED', sourceGitSha: manifest.generatedFrom.gitSha, inserted: 69, recovered, summaryLine }
}
