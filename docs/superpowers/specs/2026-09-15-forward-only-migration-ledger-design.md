# Forward-Only Migration Ledger Design

**Date:** 2026-09-15
**Repository:** `kylemwalkerpr-ship-it/portal`
**Control branch:** `architecture/migration-ledger-forward-only-20260915`
**Worktree HEAD / `origin/main` at recon:** `9cdadf040eb0cc290d011054f98aa024d179caf5` (worktree fast-forwarded to current `origin/main`; only the two Content Studio provider-parity docs landed since the previous base `c485d922`)
**Supervisor:** GPT-5.6 Sol
**Primary executor:** DeepSeek V4.1 Flash Max (`deepseek/deepseek-flash`), documentation-only pass
**Status:** Architecture approved — written spec awaiting user review

## 1. Purpose

Replace the current "replay all 69 historical migrations on every migration-path push, continue after failures" production behavior with a forward-only, hash-verified ledger that:

1. records the exact 69-file production baseline once, without executing any historical migration SQL;
2. applies only unrecorded migration files thereafter;
3. commits each new migration's SQL and its ledger row atomically;
4. stops on the first failure;
5. fails closed on any filename/hash drift.

This document is the design contract for that change. It does not implement it. The approved architecture below is preserved exactly; this document must not redesign it into Supabase CLI / `db push`.

## 2. Scope boundaries

### In scope (design only, in later implementation phases)

- A private forward-only ledger under the existing `supabase_migrations` schema.
- A frozen baseline manifest of the current 69 files with SHA-256 hashes.
- A one-time, gated, manual adoption workflow that writes only ledger rows.
- A permanent ledger-based runner for `scripts/apply-migrations.mjs`.
- Naming policy, CI sequencing, permissions, tests, verification gates, and the future native-CLI path.

### Out of scope (explicitly preserved as separate work)

- **No code, migration, workflow, test, or package changes in this task.** Exactly one design document is created.
- **No historical migration SQL is replayed, renamed, rewritten, or deleted.** All 69 files stay byte-identical.
- **No writes to `supabase_migrations.schema_migrations`.** Native history stays untouched (7 rows, `PRIMARY KEY(version)`, incomplete). Native reconciliation is a later project.
- **No `supabase db push` / Supabase CLI adoption.** Direct `db push` is unsafe today because multiple dates collide (up to 6 files on one `YYYYMMDD`) and several migrations contain DML/backfills.
- **No historical drift repair/reconciliation project.** Adoption records the 69 files as the declared baseline as-is; any real schema drift is a separate investigation.
- **No bootstrap-from-zero provisioning design.** The ledger governs the existing production database; it is not a fresh-environment replay mechanism.
- **The unresolved base-table security backlog is preserved separately.** The `PENDING` row in `docs/superpowers/seo-parity-matrix.md` ("base-table grants/RLS are not least-privilege") is not absorbed or remediated by this project.
- Ad-hoc runners (`scripts/run-migration.mjs`, `scripts/apply-content-studio-migrations.mjs`) and the non-`migrations/` SQL files under `supabase/` are not part of the ledger path.

## 3. Goals and non-goals

### Goals

- G1 — Exactly-once application semantics per migration identity (filename + SHA-256).
- G2 — Deterministic, auditable baseline adoption with zero migration SQL execution.
- G3 — Fail-closed behavior on any hash mismatch, missing baseline row, or naming violation.
- G4 — Atomic "SQL + ledger row" commit, with transient-only retry.
- G5 — Stop-on-first-failure so a failed dependency is never followed by dependent migrations.
- G6 — Grandfathered legacy naming/ordering preserved exactly; strict 14-digit naming for all future files.
- G7 — Production adoption independently verified read-only before the runner is switched.
- G8 — No changes to native Supabase migration tracking.

### Non-goals

- N1 — Reproducing historical migrations into a clean-room database.
- N2 — Fixing the pre-existing `20260911_marketplace_search_intelligence.sql` `42P16` replay failure or the `content_jobs_fts_index.sql` HTTP 503.
- N3 — Changing the raw Management API execution mechanism (it is kept for compatibility).
- N4 — Base-table privilege hardening (separate `PENDING` workstream).
- N5 — Migrating to native Supabase CLI tracking (documented future path only).
- N6 — Automatic rollback of applied migrations. Forward-only means corrections are new forward migrations.

## 4. Current state (verified repository facts)

All numbers below were measured in this worktree at recon.

### 4.1 Migration estate

- `supabase/migrations/` contains exactly **69** `.sql` files.
- **8** are pinned base files (`BASE_ORDER`): `content_jobs.sql`, `gsc_tokens.sql`, `seo_factory_columns.sql`, `content_jobs_event_log.sql`, `live_verify_columns.sql`, `mission_log.sql`, `war_room_daily_runs.sql`, `ai_provider_keys.sql`.
- **4** are pinned index-only files (`INDEX_ORDER`): `pg_trgm_indexes.sql`, `additional_fts_indexes.sql`, `application_fts_indexes.sql`, `content_jobs_fts_index.sql`.
- **12** total pinned nonnumeric legacy files; **57** are 8-digit timestamped files (`^\d{8}_[A-Za-z0-9_]+\.sql$`).
- Multiple calendar dates collide among the 57 timestamped files:
  - `20260817`: 6 files
  - `20260815`: 5 files; `20260816`: 5 files
  - `20260902`: 4 files
  - `20260813`, `20260903`, `20260907`, `20260911`: 3 files each
  - `20260809`, `20260811`, `20260812`, `20260819`, `20260901`, `20260904`, `20260909`, `20260915`: 2 files each
- **13** migration files contain top-level DML statements (`INSERT`/`UPDATE`/`DELETE`) — including seed writes (`20260811_table_guarantees.sql`) and engine/order writes (`20260909_client_order_cancellation.sql`). Additional DO-block backfills exist (e.g. `20260815_keyword_partition.sql` re-partitions existing rows). A schema-only reconstruction would therefore not be an equivalent historical record.
- All 69 files end with a semicolon as their last non-whitespace character.

### 4.2 Transaction-safety estate scan

- Zero occurrences of `CREATE INDEX CONCURRENTLY`, `VACUUM`, or `REINDEX` anywhere in `supabase/migrations/`.
- Zero `COMMIT` or `ROLLBACK` statements anywhere in `supabase/migrations/`.
- All `BEGIN` occurrences (21 across `20260815_keyword_partition.sql`, `content_jobs.sql`, `20260811_table_guarantees.sql`, `20260812_content_jobs_hardening.sql`, `20260813_backlink_engine.sql`, `20260809_seo_master_engine.sql`, `20260903_seo_engine_integrity.sql`, `20260903_content_jobs_target_repo_trigger.sql`) are PL/pgSQL block openers inside `DO $$ ... $$` bodies or `CREATE FUNCTION ... AS $$ BEGIN ... END $$` bodies. There are no top-level transaction-control statements that would conflict with a per-migration transaction wrapper.

### 4.3 Current runner behavior (`scripts/apply-migrations.mjs`)

- Resolves order from `migrationOrder()` (`scripts/migration-order.mjs`) — the single source of truth.
- Sends each file as its own `POST https://api.supabase.com/v1/projects/{ref}/database/query` request.
- Applies **all 69** files on every run; there is no applied-state tracking.
- Retries each file up to 3 attempts on HTTP 5xx / network error; treats any `< 500` status as final.
- On failure it records the failure, **continues to later files**, and exits 1 only at the end.
- Current ordering tiers: 8 pinned `BASE_ORDER` → 57 timestamped (lexicographic `.sort()`) → 4 pinned `INDEX_ORDER`.

### 4.4 Incident record (production run `35024648323`)

Recorded in `docs/superpowers/seo-execution-ledger.md` and `docs/superpowers/seo-parity-matrix.md`:

- Migration workflow run `35024648323` overall FAILED.
- `20260911_marketplace_search_intelligence.sql` failed with PostgreSQL `42P16` ("cannot drop columns from view") because a later metrics migration had added a view column.
- `content_jobs_fts_index.sql` hit HTTP 503 scheduled maintenance.
- `20260915_support_security_boundary.sql` had already applied successfully (`= OK`) in the same run, proving the "continue after failures" behavior masks per-file state and makes run outcome non-authoritative.
- The `content_jobs_fts_index.sql` index already exists in production despite the 503.

### 4.5 Native tracking (approved production context)

- `supabase_migrations.schema_migrations` currently has **7 rows** and `PRIMARY KEY(version)`.
- The native history is incomplete relative to the 69-file estate.
- This design must not modify it. The 7-row state is to be captured read-only at adoption time; it is not locally verifiable from the repository.

### 4.6 CI and tooling

- `.github/workflows/apply-seo-factory-migrations.yml` triggers on `push` to `main` for paths `supabase/migrations/**`, `scripts/migration-order.mjs`, `scripts/apply-migrations.mjs`, the workflow file itself; plus `workflow_dispatch`. `permissions: contents: read`; concurrency group `seo-factory-migrations-${{ github.ref }}`, `cancel-in-progress: false`.
- The workflow runs `node scripts/migration-order.mjs --check`, then `node scripts/apply-migrations.mjs` with `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` secrets.
- `tests/migration-order.test.ts` (8 tests, currently 8/8 PASS per the parity matrix) guards coverage, dependency order, tier order, chronological order, rejection of unclaimed names, and "no inline hardcoded file list in the workflow".

### 4.7 Supabase SQL execution context (production read-only evidence, 2026-09-15)

Production read-only SQL through the connected privileged Supabase management interface, against project `krggzrxxnqfsbbklatxl`, returned `current_user = postgres`, `session_user = postgres`, and `current_setting('role', true) = none`. This is corroborating evidence for the expected execution role only; it is NOT proof that the connected interface uses the identical transport/path as the GitHub runner. The actual executing scripts verify their own runtime role through their own `runSql` path before any write (INV-13; Sections 10.2, 11.1, and 14).

## 5. Approved architecture requirements (preserved)

These are the approved requirements. Implementation must satisfy them exactly.

1. Keep the existing raw Management API execution path for compatibility; do not rename/rewrite/replay historical migrations.
2. Add a private forward-only ledger under schema `supabase_migrations`, conceptually `yousafe_migration_ledger`.
3. Ledger identity is migration filename plus immutable SHA-256; also record applied timestamp and source Git SHA. Once applied: same filename + same hash skips; same filename + different hash fails closed.
4. One-time manual adoption workflow creates only the private ledger and records the exact current 69-file ordered baseline with hashes. It executes ZERO historical migration SQL.
5. Permanent runner cutover then applies only unrecorded files. Each new migration SQL plus ledger insert must commit atomically in one transaction; failure leaves no ledger row.
6. Stop on first migration failure. Do not continue to later migrations after a failed dependency.
7. Retry transient 5xx/network failures by retrying the whole atomic operation. SQL/4xx errors fail immediately.
8. Preserve all 69 legacy files exactly. From cutover onward require unique UTC 14-digit names `YYYYMMDDHHmmss_description.sql`; reject newly added 8-digit names.
9. Existing legacy ordering remains authoritative through `migrationOrder()`; the validator must distinguish grandfathered legacy filenames from future naming rules.
10. Baseline/adoption and permanent runner switch are separately gated. Production adoption must be verified read-only before runner cutover is allowed.
11. Do not modify Supabase native `supabase_migrations.schema_migrations`; the existing native history is incomplete (7 rows) and has `PRIMARY KEY(version)`. A later project may migrate clean forward history to native CLI tracking.
12. Explicitly preserve the separate unresolved base-table security backlog; this migration-runner project must not absorb it.

## 6. Invariants

- INV-1 — A migration file is identified by its basename (`<name>.sql`) and its SHA-256 over the exact file bytes as committed.
- INV-2 — Baseline files are immutable. Editing any baseline file changes its hash and must fail every run closed.
- INV-3 — The ledger is append-only. No UPDATE or DELETE path exists in runner code, and the database rejects them (Section 7.4).
- INV-4 — A ledger row for a migration exists if and only if that exact file version's SQL committed successfully in production within the same transaction.
- INV-5 — No historical migration SQL is executed by adoption, by verification, or by the runner for already-recorded files.
- INV-6 — All 69 baseline rows must be present and hash-matching before any unrecorded (future) file may be applied.
- INV-7 — The runner never continues past the first failure; no later file is attempted in that run.
- INV-8 — `migrationOrder()` remains the only ordering authority. The ledger changes *whether* a file runs, never the order in which pending files run.
- INV-9 — Transaction-blocking SQL (`BEGIN`/`COMMIT`/`ROLLBACK`, `CREATE INDEX CONCURRENTLY`, `VACUUM`, `REINDEX CONCURRENTLY`, `CREATE DATABASE`, `ALTER SYSTEM`, etc.) must never appear at top level in `supabase/migrations/**.sql`. Existing PL/pgSQL `BEGIN` blocks inside `$$` bodies are fine.
- INV-10 — Native `supabase_migrations.schema_migrations` is read-only for this project in all code paths.
- INV-11 — Secrets are never logged, hashed into artifacts, or committed.
- INV-12 — Adoption provenance (`source_git_sha`) is the frozen manifest baseline SHA (`generatedFrom.gitSha`). It is stable across idempotent re-runs and is never replaced by a later dispatch SHA.
- INV-13 — Before any adoption ledger DDL/insert or permanent-runner apply write, the actual executing script MUST query its own Management API `runSql` path for `current_user`, `session_user`, and `current_setting('role', true)`, and MUST fail closed before any write unless `current_user = 'postgres'` AND `session_user = 'postgres'`. The role setting is recorded for diagnostics (`none` is expected).

## 7. Ledger schema semantics

### 7.1 Location and naming

- Schema: `supabase_migrations` (pre-existing; adopt with `CREATE SCHEMA IF NOT EXISTS`).
- Table: `supabase_migrations.yousafe_migration_ledger`.
- The native table `supabase_migrations.schema_migrations` is not referenced by any DDL here.

### 7.2 Table definition (design DDL)

```sql
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
```

Semantics per column:

| Column | Meaning | Rules |
| --- | --- | --- |
| `filename` | Migration basename, exactly as returned by `migrationOrder()` (e.g. `20260915_support_security_boundary.sql`). Never a path. | Primary key → one row per filename. |
| `sha256` | Lowercase hex SHA-256 of the exact committed file bytes. | Immutable. Compared on every run. |
| `applied_at` | Server-side commit time (`now()` inside the applying transaction). | Never client-supplied. |
| `source_git_sha` | Provenance of the application. Adoption: the stable baseline-content SHA `generatedFrom.gitSha` from the frozen manifest (not the adoption dispatch SHA). Runner: `GITHUB_SHA` of the push being applied. | `text`, 40-hex lowercase, exact length enforced. |
| `applied_by` | `adoption-baseline` for the 69 recorded rows; `ci-runner` for every row applied through the permanent runner. | Distinguishes adoption evidence from runner evidence. |

No statement text, no order index, and no per-file metadata beyond the above are stored. The ledger is identity + provenance, not a migration journal.

`sha256` and `source_git_sha` are `text` with exact regex + length `CHECK` constraints. Fixed-width `char` is deliberately not used, avoiding padding/comparison semantics.

### 7.3 Row lifecycle

1. **Adoption insert** — 69 rows, `applied_by = 'adoption-baseline'`, `source_git_sha = manifest.generatedFrom.gitSha`, in one transaction with zero migration SQL.
2. **Runner insert** — one row per applied file, `applied_by = 'ci-runner'`, `source_git_sha = GITHUB_SHA`, in the same transaction as that file's SQL.
3. **Skip** — filename present with equal hash: no SQL, no write, no error.
4. **Fail closed** — filename present with different hash: immediate run failure, no SQL, no write. Also fail closed if a ledger row references a filename absent from disk.
5. **Update/delete** — impossible through application code; the database rejects it.

### 7.4 Immutability enforcement

```sql
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
```

A deliberate ledger repair requires a supervisor-reviewed DBA action (dropping the trigger or equivalent) and must be recorded in `docs/superpowers/seo-execution-ledger.md` with before/after read-only evidence. There is no application-level repair path.

### 7.5 Privileges

```sql
REVOKE ALL ON supabase_migrations.yousafe_migration_ledger
  FROM PUBLIC, anon, authenticated;
```

- No grants to `anon`, `authenticated`, or `service_role`. The only writer is the Management API SQL role used by the runner. The actual executing script verifies its own runtime role through its own `runSql` path before any write and fails closed unless `current_user = 'postgres'` and `session_user = 'postgres'` (INV-13; Sections 10.2 and 11.1). Section 4.7 is corroborating evidence only.
- The `supabase_migrations` schema is not an exposed PostgREST schema; no schema-level grant changes are made.
- RLS on this table is unnecessary given the absence of client grants; it MAY be enabled later as defense-in-depth, but MUST NOT be required for correct behavior.

## 8. Baseline manifest format

### 8.1 File

- Path: `supabase/migration-baseline.json`.
- Committed to the repository, frozen at adoption time. It describes the 69-file baseline and nothing about future files.
- Generated from a fresh `main` checkout whose SHA is recorded in `generatedFrom.gitSha`.

### 8.2 Schema

```json
{
  "manifestVersion": 1,
  "generatedAt": "<ISO-8601 UTC timestamp>",
  "generatedFrom": {
    "repository": "kylemwalkerpr-ship-it/portal",
    "gitSha": "<40-hex main commit the manifest was generated from>",
    "migrationOrderSource": "scripts/migration-order.mjs",
    "migrationCount": 69
  },
  "ledger": {
    "schema": "supabase_migrations",
    "table": "yousafe_migration_ledger"
  },
  "files": [
    { "filename": "content_jobs.sql", "sha256": "5447521c49918ab21406ece72eb6fcf0bb73c56fa8cb3f85c3faf0940fccb55b", "tier": "base", "legacy": true },
    { "filename": "20260915_support_security_boundary.sql", "sha256": "6b551ec8090ec4b727459cb7fe45ebd2b584c9dca4a93d018ceaf0de10a151e3", "tier": "timestamped", "legacy": true }
  ]
}
```

(The two `sha256` values above are real hashes of those files at this worktree HEAD and serve as format examples. The complete 69-entry hashed manifest is produced by the Phase 1 implementation.)

### 8.3 Rules

- `files` MUST contain exactly 69 entries, in exact `migrationOrder()` output order (Appendix A), each appearing once.
- `tier` is one of `base` (8 entries), `timestamped` (57), `index` (4) and MUST match the tier `migrationOrder()` assigns.
- `legacy` is `true` for all 69 baseline entries. Future files never appear in the manifest.
- `sha256` is lowercase hex, 64 characters, computed over the file's exact bytes.
- The manifest is itself reviewed and merged like code. It is not regenerated as part of normal feature work; regenerating it is a reviewed event.
- `generatedFrom.gitSha` is the stable baseline-content SHA: it is recorded as `source_git_sha` on all 69 adoption rows and MUST be an ancestor of the adoption dispatch's `expected_main_sha`.
- Adoption MUST fail closed if the manifest's file list differs from disk, if any hash mismatches, or if the count/order differs from `migrationOrder()`.

## 9. Naming policy and ordering compatibility

### 9.1 Grandfathering

- The 12 pinned nonnumeric legacy files and the 57 8-digit timestamped files remain byte-identical and keep their names permanently (requirement 8).
- 8-digit names are valid **only** if listed in `supabase/migration-baseline.json`. A newly added `^\d{8}_...\.sql` file is rejected (requirement 8).
- Nonnumeric names not among the 12 pinned files are rejected (existing `migrationOrder()` orphan behavior is preserved).

### 9.2 Future naming rule

- New files MUST match `^\d{14}_[a-z0-9_]+\.sql$`.
- The 14 digits are `YYYYMMDDHHmmss` in UTC and MUST be a valid calendar instant (month 01–12, valid day for month/year, hour 00–23, minute/second 00–59).
- Two files MUST NOT share the same 14-digit prefix (unique UTC timestamps).
- Descriptions are lowercase `[a-z0-9_]+`.

### 9.3 Validator behavior (distinguishing grandfathered from future)

Patterns are exact. The naming helper module added in Phase 1 exports the policy patterns; `scripts/migration-order.mjs` exports the ordering pattern and gains 14-digit recognition only in Phase 4:

- `TIMESTAMPED_RE = /^(?:\d{8}|\d{14})_[A-Za-z0-9_]+\.sql$/` — ordering recognition only (keeps `migrationOrder()` working for all 69 plus future 14-digit files).
- `LEGACY_TIMESTAMPED_RE = /^\d{8}_[A-Za-z0-9_]+\.sql$/`
- `FUTURE_MIGRATION_RE = /^\d{14}_[a-z0-9_]+\.sql$/`

Policy rules applied to the on-disk file set:

1. Every `.sql` file must be claimed by a tier (`migrationOrder()` orphan rule) — unchanged.
2. A pinned nonnumeric file must be exactly one of the 12 baseline names.
3. A `LEGACY_TIMESTAMPED_RE` file is accepted only if it is in the baseline manifest; otherwise `REJECT_NEW_LEGACY_NAME`.
4. A 14-digit file is accepted only if it matches `FUTURE_MIGRATION_RE`, its timestamp is a valid UTC instant, and its prefix is unique; otherwise `REJECT_FUTURE_NAME` / `REJECT_DUPLICATE_TIMESTAMP`.
5. The validator reports every violation with filename and rule ID; any violation fails the run before any apply.

`migrationOrder()` remains the ordering authority (requirement 9). Its relative order for the 69 baseline files is unchanged. Ordering recognition is extended only to admit 14-digit names into the timestamped tier.

### 9.4 Documented lexicographic interaction (not a bug to fix)

Because `_` (0x5F) sorts after digits, a 14-digit name sorts before an 8-digit name sharing the same `YYYYMMDD` prefix (e.g. `20260915120000_new.sql` < `20260915_support_security_boundary.sql`). This is harmless and deterministic under this design:

- Every baseline file is ledger-recorded before any future file can be applied (INV-6), so baseline files are always skipped.
- Pending (unrecorded) files are all 14-digit and sort chronologically among themselves.
- Do not "fix" this by rewriting the legacy sort; changing relative baseline order would violate requirement 9.

### 9.5 File-content constraints

- Files MUST NOT contain top-level transaction control (`BEGIN`/`COMMIT`/`ROLLBACK` as statements) or non-transactional commands (`CREATE INDEX CONCURRENTLY`, `VACUUM`, `REINDEX`, `REINDEX CONCURRENTLY`, `CREATE DATABASE`, `ALTER SYSTEM`). PL/pgSQL `BEGIN` inside `$$` bodies is allowed.
- Files MUST end with `;` (all 69 currently do). The runner composes each request as the file text verbatim, then a newline, the ledger `INSERT`, then `COMMIT;`.
- If a future operation genuinely requires non-transactional DDL, it is out of scope for `supabase/migrations/` under this architecture and requires a separate reviewed project.

## 10. One-time adoption flow

### 10.1 Gating

- Separate workflow: `.github/workflows/adopt-migration-ledger.yml`.
- Trigger: `workflow_dispatch` only. NEVER `push`.
- Dispatch guard: the run refuses unless `github.ref == 'refs/heads/main'`.
- Checkout: pinned to `${{ inputs.expected_main_sha }}` (`actions/checkout` with an explicit `ref`), never to the dispatching actor's local tip.
- Inputs (all required):
  - `expected_main_sha` — the 40-hex `main` commit to execute; it MUST be on `main` and MUST have the manifest baseline SHA (`generatedFrom.gitSha`) as an ancestor.
  - `confirmation` — must equal the exact literal `ADOPT-BASELINE-69`.
- Environment: `migration-ledger-adoption` with required reviewers (repository protection).
- `permissions: contents: read`.
- Concurrency: the exact production migration group used by the apply workflow — `concurrency: group: seo-factory-migrations-${{ github.ref }}`, `cancel-in-progress: false`. On `main` both workflows evaluate this to `seo-factory-migrations-refs/heads/main`, so adoption can never overlap a migration run.
- Adoption rows record `source_git_sha = generatedFrom.gitSha` (the stable baseline-content SHA), not `expected_main_sha`; `expected_main_sha` only pins the execution checkout.
- The adoption PR and the runner cutover PR are separate, separately reviewed changes (requirement 10).

### 10.2 Preflight (all read-only, fail closed)

1. Dispatch guard: `github.ref == 'refs/heads/main'`; checked-out `HEAD` equals `expected_main_sha`; `expected_main_sha` is on `main` (`git merge-base --is-ancestor <expected_main_sha> origin/main`).
2. The manifest baseline SHA (`generatedFrom.gitSha`) is an ancestor of `expected_main_sha` (`git merge-base --is-ancestor <generatedFrom.gitSha> <expected_main_sha>`), so the adopted content provably predates this dispatch.
3. Manifest exists, `manifestVersion = 1`, 69 entries, exact order equality with `migrationOrder()`; every manifest file exists on disk with matching SHA-256; no extra baseline-classified file exists (`migrationCount = 69` at adoption).
4. Read production: `SELECT to_regclass('supabase_migrations.yousafe_migration_ledger')`.
   - Absent → proceed.
   - Present and rows = 0 → proceed (idempotent DDL below).
   - Present with exactly the 69 expected rows, where every row matches the manifest on `filename` and `sha256`, `applied_by = 'adoption-baseline'` for all, and `source_git_sha = generatedFrom.gitSha` for all → `ALREADY_ADOPTED`, exit 0, no writes. Provenance is compared to the manifest baseline SHA, NOT to `expected_main_sha`.
   - Present with any other content (partial rows, extra rows, hash mismatch, or provenance mismatch) → fail closed.
5. Read-only capture of native `supabase_migrations.schema_migrations` (`version`, `name`, count) as pre-state.
6. Runtime role verification (INV-13): the adoption script queries its own Management API `runSql` path for `current_user`, `session_user`, and `current_setting('role', true)`. It records the role setting (`none` expected) and fails closed before any write unless `current_user = 'postgres'` and `session_user = 'postgres'`. No Section 10.3 DDL or Section 10.4 insert may occur unless this passes.

### 10.3 Ledger-only DDL

One request containing only Section 7.2/7.4/7.5 DDL (`CREATE SCHEMA IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`, `REVOKE`). No migration SQL.

### 10.4 Baseline recording (single request, single transaction)

```sql
BEGIN;
INSERT INTO supabase_migrations.yousafe_migration_ledger
  (filename, sha256, source_git_sha, applied_by)
VALUES
  ('content_jobs.sql', '<sha256>', '<generatedFrom.gitSha>', 'adoption-baseline'),
  -- ... all 69 rows, in migrationOrder() order ...
  ('content_jobs_fts_index.sql', '<sha256>', '<generatedFrom.gitSha>', 'adoption-baseline');
DO $$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.yousafe_migration_ledger) <> 69
     OR (SELECT count(DISTINCT filename) FROM supabase_migrations.yousafe_migration_ledger) <> 69
     OR (SELECT count(*) FROM supabase_migrations.yousafe_migration_ledger
         WHERE applied_by = 'adoption-baseline'
           AND source_git_sha = '<generatedFrom.gitSha>') <> 69 THEN
    RAISE EXCEPTION 'baseline adoption incomplete: expected exactly 69 matching adoption rows';
  END IF;
END $$;
COMMIT;
```

- Plain `INSERT` (no `ON CONFLICT`) guarantees a duplicate is a hard transaction failure, never a silent merge.
- The script MUST have no code path that reads a migration `.sql` file for execution. It reads migration files only to compute SHA-256 and to validate the manifest.
- The literal values are validated (`[a-z0-9_.]` filename, `[0-9a-f]{64}` hash, `[0-9a-f]{40}` SHA) before string composition; no user-controlled data enters the SQL.
- Every adoption row's `source_git_sha` is the frozen manifest baseline SHA `generatedFrom.gitSha`. `expected_main_sha` pins the execution checkout only and is never written to the ledger. An idempotent re-run compares row provenance to the manifest baseline SHA, not to the dispatch SHA.

### 10.5 Post-adoption verification (read-only, same run)

- Ledger: total = 69, distinct filenames = 69, every row hash-equal to the manifest, every row `applied_by = 'adoption-baseline'`, every row `source_git_sha = generatedFrom.gitSha` (the manifest baseline SHA, not the dispatch SHA).
- Native `schema_migrations`: post-state equals pre-state exactly (count and sorted versions).
- Runtime role verification (INV-13) passed before any write: `current_user = 'postgres'` and `session_user = 'postgres'`; the role setting is recorded for diagnostics.
- Emit exactly one machine-checkable summary line:
  `LEDGER ADOPTION VERIFIED: 69/69 files, source_git_sha=<generatedFrom.gitSha>, native_history_unchanged=true, runtime_role_verified=true`
- Any mismatch fails the run and must be treated as a production incident requiring supervisor review.

### 10.6 Impossible outcomes (assertions)

- Adoption cannot execute migration SQL: no migration SQL exists in any request it builds.
- Adoption cannot partially record the baseline: a single transaction with a 69-row completeness assertion.
- Adoption idempotency is exact-match only: absent/empty ledger proceeds to adoption; a full 69-row match (hash + provenance against the manifest baseline SHA) is `ALREADY_ADOPTED`; any partial, extra, hash, or provenance mismatch fails closed before writes.

## 11. Permanent apply algorithm

Implemented by the cutover version of `scripts/apply-migrations.mjs` (Management API path preserved; requirement 1). Modes: default apply; `--dry-run` = full read-only preflight + classification, zero writes; `--preflight` = read-only gate used by CI before apply (or preflight runs inline when applying).

### 11.1 Preflight (read-only, fail closed)

1. `sourceGitSha = GITHUB_SHA` in CI. Production apply requires the workflow context (`GITHUB_ACTIONS=true`); local runs are limited to `--dry-run`/`--preflight`.
2. Load and validate the manifest (Section 8).
3. `order = migrationOrder()`. Assert manifest filenames appear in `order` in the same relative order.
4. For each manifest file: file exists on disk and its SHA-256 equals the manifest hash. Any mismatch → `FAIL CLOSED: baseline hash drift`.
5. Assert no on-disk `LEGACY_TIMESTAMPED_RE` file is missing from the manifest (rejects new 8-digit names).
6. Read ledger once: `SELECT filename, sha256 FROM supabase_migrations.yousafe_migration_ledger`.
7. Cutover precondition (INV-6): every manifest filename has a ledger row with equal hash. Otherwise abort: `CUTOVER BLOCKED: baseline ledger incomplete (n/69)` — no writes, no SQL.
8. Assert every ledger row references a file present on disk (no orphan ledger rows) → else fail closed.
9. Assert native `schema_migrations` is not written: the runner contains no INSERT/UPDATE/DELETE/DDL against it; pre/post states must be equal by construction.
10. Runtime role verification (INV-13): the runner queries its own Management API `runSql` path for `current_user`, `session_user`, and `current_setting('role', true)`. It records the role setting (`none` expected) and fails closed before any apply POST unless `current_user = 'postgres'` and `session_user = 'postgres'`. This gate runs on every apply run, including a no-op run with nothing pending, and is reported read-only by `--dry-run`/`--preflight`.
11. `pending = order.filter(f => f not in ledger)`.

### 11.2 Per-file apply (atomic, transient-retry)

For each pending file, in `order`:

1. Reject the file unless it matches `FUTURE_MIGRATION_RE` (`REJECT_NEW_LEGACY_NAME` if it matches `LEGACY_TIMESTAMPED_RE`). This is defense-in-depth; INV-6 already ensures baseline files are recorded.
2. Compute `diskSha` from the file bytes.
3. Read the single ledger row for this filename (fresh, committed read).
   - Row exists, hash equal → `SKIP (applied by prior attempt)`; continue.
   - Row exists, hash different → fail closed immediately (no SQL, no write).
4. Build exactly one request body:

   ```text
   BEGIN;
   <migration file bytes verbatim>
   INSERT INTO supabase_migrations.yousafe_migration_ledger
     (filename, sha256, source_git_sha, applied_by)
   VALUES ('<filename>', '<diskSha>', '<sourceGitSha>', 'ci-runner');
   COMMIT;
   ```

5. `POST /v1/projects/{ref}/database/query` with this body. Outcome handling per Section 12.
6. On success, continue to the next pending file.
7. On any permanent failure or exhausted transient retries, **stop the run immediately**; no later file is attempted (INV-7); exit 1 with `STOPPED at <filename>`.
8. In `--dry-run`, print `WOULD APPLY <filename>` or `SKIP (recorded) <filename>` and perform no writes.

### 11.3 Post-run verification (read-only)

- Ledger contains every expected filename (all 69 baseline + all files applied in this run) with matching hashes.
- No non-expected rows were added.
- Native `schema_migrations` state equals the pre-run state (captured at preflight).
- Runtime role verification (INV-13) passed before any write: `current_user = 'postgres'` and `session_user = 'postgres'`; role setting recorded for diagnostics.
- Emit one summary line: `LEDGER APPLY OK: <n> applied, <m> skipped, source_git_sha=<GITHUB_SHA>, runtime_role_verified=true`.
- Any mismatch after a 2xx run fails the workflow (exit 1). Because ledger insert and SQL share a transaction, this should be impossible; it exists to catch infrastructure anomalies.

### 11.4 Exit codes

- `0` — success (including dry-run clean, and "nothing pending").
- `1` — any failure: naming violation, hash drift, cutover blocked, permanent SQL/4xx error, exhausted transient retries, or post-run verification mismatch. The message prefix identifies the class.

## 12. Transaction, retry, and failure behavior

### 12.1 Transaction contract

- Every apply is a single Management API request containing exactly one `BEGIN; … COMMIT;` batch: migration SQL verbatim, then the ledger `INSERT`.
- If the API rejects/aborts any statement, the whole batch rolls back: no schema change and no ledger row (requirement 5).
- Because Postgres treats the batch as one transaction, either both the migration and its ledger row commit, or neither does.
- No request ever modifies native `schema_migrations` (INV-10).
- No write request is sent unless the run's preflight has passed, including INV-13 runtime role verification (`current_user = 'postgres'` and `session_user = 'postgres'`).

### 12.2 Retry classification (exact)

| Outcome | Class | Action |
| --- | --- | --- |
| HTTP 2xx | success | Mark applied; continue to next file. |
| HTTP 5xx | transient | Retry the whole atomic operation; max 3 total attempts; backoff 1s, 2s. |
| HTTP 429 | transient | Same as 5xx. |
| Network error / timeout / status 0 | transient | Same as 5xx. |
| HTTP 4xx other than 429 (incl. SQL errors such as `42P16` reported as 400) | permanent | Fail immediately; no retry; stop the run. |
| Third transient failure | permanent | Stop the run; exit 1. |

- "Retry the whole atomic operation" means: re-run step 11.2.3 (fresh ledger read), then resend the full `BEGIN; … COMMIT;` body. This makes a lost success response safe: if attempt 1 actually committed but the response was lost, the retry's ledger read finds the row with an equal hash and treats the file as applied — no duplicate SQL, no duplicate row.
- The runner never retries only the `INSERT` or only the SQL; it never parses/rewrites migration SQL; it never splits a file into statements.

### 12.3 Stop-on-first-failure

- The pending-file loop breaks on the first permanent failure (INV-7). Files later in `order` are not attempted, so no dependent migration runs after a failed dependency (requirement 6).
- The workflow exits 1 and the run is recorded as failed overall. Unlike run `35024648323`, a per-file success inside a failed run carries no ambiguity: a file is applied iff its ledger row exists.

### 12.4 Idempotency

- Re-running a green run: every file is recorded with equal hash → all `SKIP`; zero writes; exit 0.
- Re-running after a failed run: all recorded files `SKIP`; execution resumes at the first unrecorded file.
- Adoption re-run: `ALREADY_ADOPTED` only for an exact 69-row match (filename, sha256, `applied_by = 'adoption-baseline'`, and `source_git_sha` equal to the manifest baseline SHA). Absent/empty proceeds; any partial, extra, hash, or provenance mismatch fails closed.

## 13. CI/workflow sequencing

### 13.1 Phases (each a separate reviewed PR)

| Phase | Deliverable | Production effect |
| --- | --- | --- |
| 0 (this task) | This design document only | None |
| 1 | NEW non-triggering files only: `supabase/migration-baseline.json`, a NEW naming/manifest helper module, NEW tests. MUST NOT modify `scripts/migration-order.mjs`, `scripts/apply-migrations.mjs`, `supabase/migrations/**`, or the existing apply workflow. | None |
| 2 | NEW adoption script + NEW `adopt-migration-ledger.yml` (dispatch-only, protected environment). MUST NOT touch any existing apply-trigger path. | None until manually dispatched |
| 3 | Manual adoption dispatch; independent read-only verification evidence recorded in `docs/superpowers/seo-execution-ledger.md` | 69 ledger rows; zero migration SQL |
| 4 | Only after Phase 3 is green: modify `scripts/migration-order.mjs`, `scripts/apply-migrations.mjs`, and the existing apply workflow; update the existing order test | The Phase 4 merge push runs the NEW ledger-aware workflow/code and must be a 69-skip no-op |

### 13.2 Safe sequencing (no workflow disable, no skip-ci)

The old runner replays all 69 files with continue-after-failure whenever a merge to `main` touches the existing apply workflow's `paths:`. The transition is therefore sequenced so that no triggering push happens until adoption is verified and the ledger-aware code is in place:

1. Phase 1 adds only NEW files: the baseline manifest, a new naming/manifest helper module, and new tests. It does not modify `scripts/migration-order.mjs`, `scripts/apply-migrations.mjs`, `supabase/migrations/**`, or `.github/workflows/apply-seo-factory-migrations.yml`, so merging it triggers nothing.
2. Phase 2 adds only NEW files: the adoption script and the new dispatch-only adoption workflow. It also does not touch any existing apply-trigger path.
3. Phase 3 adopts and independently verifies production read-only. Only after Phase 3 is green may Phase 4 modify `scripts/migration-order.mjs`, `scripts/apply-migrations.mjs`, and the existing apply workflow.
4. Phase 4 is the first change allowed to touch a triggering path. By then the ledger contains all 69 baseline rows, so the Phase 4 merge push runs the NEW ledger-aware workflow/code and must be a 69-skip no-op.

Explicitly rejected: disabling or pausing the existing Apply SEO Factory Migrations workflow, and `[skip ci]`-style commit-message skips. The existing workflow stays enabled and untouched through Phases 1–3.

### 13.3 Workflow changes at cutover (Phase 4)

- `apply-seo-factory-migrations.yml`:
  - Add `supabase/migration-baseline.json` to `paths:`.
  - Keep the existing concurrency group and `cancel-in-progress: false`.
  - Keep `node scripts/migration-order.mjs --check`.
  - Add naming-policy + transaction-safety validation, then `node scripts/apply-migrations.mjs --preflight` as a mandatory fail-closed gate, then `node scripts/apply-migrations.mjs` (preflight may run inline; the explicit step makes gate failure visible in the UI).
- `adopt-migration-ledger.yml`: dispatch-only, main-ref guard, checkout pinned to `expected_main_sha`, protected environment, the exact apply-workflow concurrency group (`group: seo-factory-migrations-${{ github.ref }}`, `cancel-in-progress: false`), read-only `contents` permission.
- Both workflows keep the Management API as the only production SQL path (requirement 1).

### 13.4 Required checks and branch discipline

- All changes follow branch → PR → required repository checks → merge to `main` (`AGENTS.md`). No direct pushes to `main`.
- No deployment path changes: `deploy.yml` remains the only Cloudflare publish path and is not touched.
- The apply workflow is not made a required PR check; PR-time safety comes from the existing and new Jest tests.

## 14. Security and permissions

- Ledger least privilege: `REVOKE ALL … FROM PUBLIC, anon, authenticated`; no client grants; write access only via the Management API role. The adoption script and the permanent runner each verify their own runtime identity through their own `runSql` path before any write and fail closed unless `current_user = 'postgres'` and `session_user = 'postgres'` (INV-13; Sections 10.2 and 11.1). Section 4.7 is corroborating evidence only.
- Append-only enforcement: DB trigger rejects `UPDATE`/`DELETE` (Section 7.4).
- Adoption gating: protected GitHub environment `migration-ledger-adoption` with required reviewers; dispatch-only; refuses unless `github.ref == 'refs/heads/main'`; checkout pinned to `expected_main_sha`; explicit confirmation literal; ledger provenance is the manifest baseline SHA (`generatedFrom.gitSha`).
- Runner gating: push-to-`main` only, `permissions: contents: read`, secrets scoped to the run step.
- Secrets: `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` are never printed, never written to artifacts, never embedded in manifests or ledger rows. Error logs may include only the first 400 characters of an error response body, as today.
- No production DDL is performed by this documentation task or by any Phase 0–2 code; the only production writes are adoption inserts (Phase 3) and runner-applied migrations (Phase 4+).
- The unresolved base-table grants/RLS backlog remains tracked as its own `PENDING` matrix item and is not modified by ledger work.

## 15. Rollback and recovery

| Scenario | Behavior |
| --- | --- |
| A migration's SQL fails | The atomic batch rolls back; no ledger row; run stops; rerun resumes at that file. |
| A migration's SQL succeeds but the HTTP response is lost | Next attempt's ledger read sees the committed row with equal hash → treated as applied; no duplicate SQL. |
| A migration is discovered to be wrong after it applied | Forward-only: write a new corrective migration with a new 14-digit name. Never edit the applied file (its hash is recorded). |
| A baseline file is edited | Every run fails closed at preflight (`baseline hash drift`). The edit must be reverted; baseline files are immutable. |
| Ledger row exists for a file missing from disk | Run fails closed; supervisor review required. |
| Ledger row content must be repaired | Supervisor-reviewed manual DBA action + ledger journal entry with before/after read-only evidence; no application path exists. |
| Adoption partially completes | Impossible: single transaction + completeness assertion; otherwise the transaction aborts leaving zero rows. |
| Runner cutover (Phase 4) must be corrected | Forward-fix in another Phase 4-path PR; its push runs the corrected ledger-aware workflow and stays a no-op while all 69 baseline rows are recorded. Avoid merging a revert of Phase 4, because that push would run the old replaying code. The workflow is never disabled. |
| Fresh database bootstrap needed | Out of scope (N1). The ledger is not a replay engine; provisioning a new environment requires a separate project. |

## 16. Test matrix

Tests are added across Phases 1, 2, and 4 in new or test files only; Phases 1–2 must not modify any existing apply-trigger path. `tests/migration-order.test.ts` (8 tests) keeps passing; its future-name assertion is updated in Phase 4.

| ID | Phase | Test | Level | Pass criterion |
| --- | --- | --- | --- | --- |
| T1 | 1 | Manifest completeness/order/hashes | Unit | 69 entries; exact `migrationOrder()` order; each hash equals on-disk SHA-256; tiers 8/57/4. |
| T2 | 1 | Naming validator | Unit | 14-digit valid names accepted; new 8-digit rejected; baseline 8-digit accepted; pinned accepted; invalid calendar values, uppercase descriptions, and duplicate 14-digit prefixes rejected with the exact rule IDs. |
| T3 | 4 | Skip/fail-closed classification | Unit (mocked ledger + fetch) | Recorded + equal hash → skip, zero POSTs; recorded + different hash → exit 1, zero POSTs; unrecorded → one POST. |
| T4 | 4 | Atomic request composition | Unit | Request body is exactly `BEGIN;` + file bytes + ledger `INSERT` + `COMMIT;`; one request per file; no statement splitting or rewriting. |
| T5 | 4 | Stop-on-first-failure | Unit (mocked fetch) | With file 2 returning 400, files 3+ are never requested; exit 1; message names file 2. |
| T6 | 4 | Transient retry | Unit | 503, 503, 200 → success, 3 attempts; 400 → 1 attempt; thrown network errors retried; 3 transient failures → exit 1. |
| T7 | 4 | Lost-commit retry | Unit | Attempt 1 throws after "commit" (ledger read on attempt 2 returns the row) → treated applied; exactly one ledger INSERT composed. |
| T8 | 4 | Cutover precondition | Unit | Ledger missing one baseline row → refuse before any POST (`CUTOVER BLOCKED (68/69)`); no writes. |
| T9 | 2 | Adoption script | Unit (fs/fetch mocked) | Generated requests contain no migration SQL; INSERT has exactly 69 rows with manifest-baseline provenance; completeness assertion present; exact 69-row rerun = no-op success; any partial/extra/mismatch = failure. |
| T10 | 1 | Transaction-safety scan | Unit | Reuse the `ddlOnly` stripping approach; zero top-level `BEGIN`/`COMMIT`/`ROLLBACK`; zero denied commands (`CONCURRENTLY`, `VACUUM`, `REINDEX`, `ALTER SYSTEM`, `CREATE DATABASE`); all files end with `;`. |
| T11 | 4 | Ordering compatibility | Unit | `migrationOrder()` output unchanged for the 69 (byte-for-byte order); naive alphabetical sort still rejected; a valid 14-digit name is claimed by the timestamped tier. |
| T12 | 4 | Existing `migration-order.test.ts` update | Unit | The "auto-registers a new timestamped migration" assertion reflects 14-digit future names and grandfathered baseline names; all other assertions keep passing. |
| T13 | 2 | Ledger immutability trigger | Integration (scratch DB only) | `UPDATE`/`DELETE` raise `55000`; `INSERT` succeeds. |
| T14 | 2+4 | Workflow contract | Unit (file assertions) | Apply workflow still references `scripts/migration-order.mjs` and contains no inline migration file list; adoption workflow is `workflow_dispatch` only with the protected environment and main-ref guard; neither echoes secrets. |
| T15 | 1 (extended 2, 4) | Read-only native assertion | Unit | No runner/adoption code path composes any statement against `supabase_migrations.schema_migrations`. |
| T16 | 2 | Adoption runtime role gate | Unit (runSql mocked) | Non-postgres identity (`current_user` or `session_user` ≠ `postgres`) → fail closed with zero write POSTs (no DDL, no INSERT); both `postgres` → proceeds; role setting recorded for diagnostics. |
| T17 | 4 | Runner runtime role gate | Unit (runSql mocked) | Non-postgres identity → fail closed with zero apply POSTs; both `postgres` → proceeds; the gate runs on every apply run, including a no-op run. |

No test in this table is executed by the Phase 0 documentation task. Phase 1 runs T1, T2, T10, T15; Phase 2 runs T9, T13 (scratch database only, never production), T14 (adoption workflow contract), T16; Phase 4 runs T3–T8, T11, T12, T14 (apply workflow contract), T17, and re-runs the full repository-required checks.

## 17. Production verification gates

| Gate | When | Verification (read-only unless stated) | Pass criterion |
| --- | --- | --- | --- |
| G0 | Before adoption | Query ledger existence; capture native `schema_migrations` state | Ledger absent or empty; native state captured (expected 7 rows, recorded context). |
| G1 | Adoption run | Adoption workflow output | `LEDGER ADOPTION VERIFIED: 69/69 files, source_git_sha=<generatedFrom.gitSha>, native_history_unchanged=true, runtime_role_verified=true`; workflow green. |
| G2 | Independent supervisor verification | Supervisor-run read-only SQL/script (not the adoption script) | 69 distinct rows; every hash equals the manifest; `applied_by = 'adoption-baseline'` for all; `source_git_sha` equals the manifest baseline SHA (`generatedFrom.gitSha`) for all — not the dispatch SHA; native `schema_migrations` identical to G0. |
| G3 | Before cutover merge | G2 evidence committed to `docs/superpowers/seo-execution-ledger.md` | Evidence present; runner cutover PR not merged before this. |
| G4 | First post-cutover run | Workflow run (all files recorded) | Green; zero applied, 69 skipped; runtime role preflight passed (`runtime_role_verified=true`); native state unchanged; baseline replay incident class closed. |
| G5 | First real post-cutover migration | Workflow run | Exactly one new `ci-runner` row with correct hash and `GITHUB_SHA`; runtime role preflight passed; SQL effects observable; workflow green overall. |

Any mismatch at G0–G5 stops the sequence. Adoption and cutover cannot be combined into one gate (requirement 10).

## 18. Future Supabase-native migration path (documented, not implemented)

After the ledger is authoritative and history is clean:

1. Reconcile the 69 baseline rows into native `supabase_migrations.schema_migrations` version semantics — blocked today by date collisions (up to 6 files per date) and by `PRIMARY KEY(version)`.
2. Decide the disposition of the existing 7 native rows (do not touch them in this project).
3. Only then consider `supabase migration repair` / CLI-based tracking for future files, with the ledger retained as the provenance record.
4. Native adoption is a separate project with its own design, review, and verification gates (requirement 11).

## 19. Implementation-plan decisions (non-architectural)

These are low-level choices the approved architecture does not depend on; they may be adjusted during implementation review without changing this design's semantics.

- Exact retry count and backoff (proposed: 3 total attempts, 1s/2s backoff — mirrors today's runner).
- Treating HTTP 429 as transient (proposed: yes).
- File/script naming: `supabase/migration-baseline.json`, `scripts/migration-names.mjs`, `scripts/adopt-migration-ledger.mjs`, `.github/workflows/adopt-migration-ledger.yml` (proposed).
- Naming-policy logic lives in a NEW module added in Phase 1 (required by the no-trigger sequencing); Phase 4 wires it into `migration-order.mjs --check` and the runner.
- Whether RLS is additionally enabled on the ledger table (proposed: not required given no client grants).
- Per-file post-read vs single post-run verification (proposed: single post-run read).
- Exact protected-environment name (proposed: `migration-ledger-adoption`).
- Whether the completeness assertion in adoption is a `DO` block or an equivalent single statement.

## 20. Requirement traceability

| Requirement | Sections |
| --- | --- |
| 1 — Keep Management API path; no replay/rename/rewrite | 11, 12, 2 |
| 2 — Private forward-only ledger in `supabase_migrations` | 7, 8 |
| 3 — Filename + SHA-256 identity; timestamp + source Git SHA; skip/fail-closed | 6, 7.3, 11.2, 12.4 |
| 4 — One-time adoption; zero historical SQL | 10, 16 (T9) |
| 5 — Atomic SQL + ledger insert | 12.1, 11.2 |
| 6 — Stop on first failure | 11.2, 12.3 |
| 7 — Retry transient as whole operation; 4xx/SQL immediate | 12.2, 11.2 |
| 8 — Preserve 69 files; 14-digit future names; reject new 8-digit | 9, 2 |
| 9 — `migrationOrder()` authoritative; grandfathered vs future | 9.3, 13.3 |
| 10 — Separately gated adoption/cutover; read-only verification first | 10, 13.1, 17 |
| 11 — Do not modify native `schema_migrations` | 2, 7.1, 18 |
| 12 — Preserve separate base-table security backlog | 2, 14 |

## 21. Acceptance criteria

For this Phase 0 documentation task:

1. Exactly one new file exists: `docs/superpowers/specs/2026-09-15-forward-only-migration-ledger-design.md`.
2. No code, migration, workflow, test, package, or production change is made; the file is not committed.
3. `git diff --check` exits 0; `git status --porcelain` shows only the new untracked spec.
4. The spec covers every required subject: goals/non-goals, invariants, ledger schema semantics, baseline manifest format, one-time adoption flow, permanent apply algorithm, transaction/retry/failure behavior, naming policy, CI/workflow sequencing, security/permissions, rollback/recovery, test matrix, production verification gates, future native path, and exact acceptance criteria.
5. All 12 approved architecture requirements are traceable (Section 20) and are not redesigned.
6. All repository facts stated in Section 4 match measured values at this worktree HEAD (69 / 8 / 4 / 12 / 57; 13-file DML count; collision distribution; transaction scan results; run `35024648323` outcomes as recorded).
7. The branch is `architecture/migration-ledger-forward-only-20260915`; no commit, push, PR, merge, deploy, or production DDL is performed.
8. Execution stops for supervisor review.

For the overall migration-ledger project (later phases):

1. Adoption records exactly 69 baseline rows with zero historical migration SQL executed, verified read-only by an independent party (G1–G2).
2. Every post-cutover apply commits SQL + ledger row atomically; no failure path leaves a ledger row without its SQL or vice versa.
3. A recorded migration with an equal hash is never re-executed; a recorded migration with a different hash fails the run closed.
4. A failed migration stops the run; no later pending file is attempted.
5. The adoption script and the permanent runner each verify their actual runtime identity through their own `runSql` path and fail closed before any write unless `current_user = 'postgres'` and `session_user = 'postgres'` (INV-13).
6. New migrations use unique valid UTC 14-digit names; newly added 8-digit names are rejected.
7. Native `supabase_migrations.schema_migrations` is unchanged by this project.
8. The base-table security backlog remains separately tracked and unresolved by this project.

## Appendix A — Frozen baseline order (69 files)

This is the exact `migrationOrder()` output at recon; the manifest's `files` array must match this order.

```text
 1. content_jobs.sql
 2. gsc_tokens.sql
 3. seo_factory_columns.sql
 4. content_jobs_event_log.sql
 5. live_verify_columns.sql
 6. mission_log.sql
 7. war_room_daily_runs.sql
 8. ai_provider_keys.sql
 9. 20260806_hardening.sql
10. 20260808_cannibal_merges.sql
11. 20260809_cannibal_rechecks.sql
12. 20260809_seo_master_engine.sql
13. 20260810_seo_engine_v2.sql
14. 20260811_content_jobs_archive.sql
15. 20260811_table_guarantees.sql
16. 20260812_competing_urls.sql
17. 20260812_content_jobs_hardening.sql
18. 20260813_ai_admin_provider_order.sql
19. 20260813_backlink_engine.sql
20. 20260813_rhythm_alerts.sql
21. 20260814_ai_baseten_provider.sql
22. 20260815_backlinks_json.sql
23. 20260815_competing_snippets.sql
24. 20260815_keyword_partition.sql
25. 20260815_master_engine_backfill.sql
26. 20260815_seo_intelligence.sql
27. 20260816_ai_nemotron_provider.sql
28. 20260816_content_jobs_replica_identity.sql
29. 20260816_gsc_index_coverage.sql
30. 20260816_seo_llm_visibility_v3.sql
31. 20260816_site_health_pages.sql
32. 20260817_ahrefs_snapshots.sql
33. 20260817_seo_competitive_v1.sql
34. 20260817_seo_content_semantic_v1.sql
35. 20260817_seo_eeat_v1.sql
36. 20260817_seo_local_v1.sql
37. 20260817_site_health_rls.sql
38. 20260819_content_job_reviews.sql
39. 20260819_seo_engine_runs_kind.sql
40. 20260826_nvidia_minimax_draft_default.sql
41. 20260831_keyword_provenance.sql
42. 20260901_content_job_reviews_fingerprint.sql
43. 20260901_seo_ranking_model.sql
44. 20260902_seo_cluster_plan_economics.sql
45. 20260902_seo_cluster_plan_lifecycle.sql
46. 20260902_seo_llm_fanout.sql
47. 20260902_seo_title_history.sql
48. 20260903_content_jobs_target_repo_default.sql
49. 20260903_content_jobs_target_repo_trigger.sql
50. 20260903_seo_engine_integrity.sql
51. 20260904_seo_gsc_rows.sql
52. 20260904_seo_topic_graph.sql
53. 20260906_studio_specialist_signals.sql
54. 20260907_attorney_show_bar_number.sql
55. 20260907_conversation_ai_mode.sql
56. 20260907_engine_evidence_attribution.sql
57. 20260908_marketplace_gig_jurisdiction_au.sql
58. 20260909_client_order_cancellation.sql
59. 20260909_marketplace_gig_gallery_public.sql
60. 20260911_marketplace_search_intelligence.sql
61. 20260911_marketplace_search_intelligence_metrics.sql
62. 20260911_provider_credential_visibility_controls.sql
63. 20260914_content_studio_evidence_contract.sql
64. 20260915_content_studio_execution_lease.sql
65. 20260915_support_security_boundary.sql
66. pg_trgm_indexes.sql
67. additional_fts_indexes.sql
68. application_fts_indexes.sql
69. content_jobs_fts_index.sql
```
