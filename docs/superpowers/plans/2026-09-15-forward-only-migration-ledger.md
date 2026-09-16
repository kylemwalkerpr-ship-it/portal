# Forward-Only Migration Ledger Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
**Goal:** Replace the replay-all-69-migrations apply path with a forward-only, hash-verified ledger: record the frozen 69-file baseline once with zero historical SQL, then apply only unrecorded migrations atomically and stop on the first failure.
**Architecture:** A private append-only table `supabase_migrations.yousafe_migration_ledger` records `filename` + SHA-256 + provenance for the frozen 69-file baseline (one-time adoption) and for every future migration (permanent runner). Adoption is a separate dispatch-only workflow that composes only ledger DDL and a single 69-row `INSERT`; the runner composes one atomic `BEGIN; <file bytes verbatim>; ledger INSERT; COMMIT;` request per pending file, skips recorded equal-hash files, and fails closed on drift. Native `supabase_migrations.schema_migrations` is read-only, `migrationOrder()` stays the only ordering authority, and no trigger-path file is touched before Phase 4.
**Tech Stack:** Node.js 22, ESM .mjs, Jest/ts-jest child-process tests, GitHub Actions, Supabase Management API/Postgres.
**Spec:** `docs/superpowers/specs/2026-09-15-forward-only-migration-ledger-design.md`

## Global Constraints

Copied from the approved spec (Section 5 requirements, Section 6 invariants, Section 13 sequencing). These are not negotiable during implementation:

- **No historical replay/rename/rewrite.** All 69 `supabase/migrations/**.sql` files stay byte-identical forever. No historical migration SQL is executed by adoption, by verification, or by the runner for already-recorded files (INV-5, requirements 1 and 4).
- **Native `supabase_migrations.schema_migrations` is read-only.** No statement in any code path may INSERT/UPDATE/DELETE/DDL against it (INV-10, requirement 11). Native reads are SELECT-only pre/post state captures.
- **Immutable filename + SHA-256.** A migration is identified by basename + SHA-256 over exact committed bytes; baseline files are immutable; recorded + equal hash skips with no SQL/write; recorded + different hash fails closed; the ledger is append-only (INV-1/2/3/4, spec §7.3).
- **INV-13 role guard.** Before any adoption ledger DDL/insert or any permanent-runner apply write, the executing script MUST query its own Management API `runSql` path for `current_user`, `session_user`, and `current_setting('role', true)`, and MUST fail closed unless `current_user = 'postgres'` AND `session_user = 'postgres'`. The role setting is recorded for diagnostics (`none` expected). This gate runs on every apply run, including a no-op run.
- **No workflow disable, no `[skip ci]`.** The existing Apply SEO Factory Migrations workflow stays enabled and unmodified through Phases 1–3. All changes follow branch → PR → required checks → merge to `main` (AGENTS.md, spec §13.2/§13.4). No direct pushes to `main`.
- **Trigger-path discipline.** Phases 1–2 create only NEW files and MUST NOT modify `scripts/migration-order.mjs`, `scripts/apply-migrations.mjs`, `supabase/migrations/**`, or `.github/workflows/apply-seo-factory-migrations.yml`. Phase 4 is the first change allowed to touch a trigger path and must be one single reviewed PR whose merge push runs the ledger-aware code.
- **Stop-on-first-failure.** The runner never continues past the first permanent failure; no later file is attempted (INV-7, requirement 6).
- **Retry semantics.** HTTP 5xx, HTTP 429, and network/timeout/status-0 are transient and retry the whole atomic operation (fresh ledger read, then full `BEGIN; … COMMIT;` resend), max 3 total attempts, backoff 1s then 2s. HTTP 4xx (other than 429) and SQL errors are permanent and fail immediately (requirement 7, spec §12.2). Thrown network exceptions are normalized to `{ ok:false, status:0, body:String(err) }` at every injected `runSql` boundary, never left to the concrete fetch wrapper. **Adoption exception:** the one-time 69-row baseline INSERT is sent exactly once and is never retried; SELECT/query reads and the idempotent ledger DDL may retry transient failures; a transient/unknown INSERT response is reconciled by reading the ledger (exact 69-row match → recovered with no second INSERT, absent/empty → supervised re-dispatch, partial/extra/mismatch → fail closed incident).
- **Future naming.** From cutover onward, new files MUST match `^\d{14}_[a-z0-9_]+\.sql$` with a valid unique UTC `YYYYMMDDHHmmss` prefix. Newly added 8-digit names are rejected (requirement 8, spec §9).
- **Separate gates.** Adoption (Phase 3) and runner cutover (Phase 4) are separately gated; Phase 4 is forbidden until the Phase 3 read-only verification evidence is merged/accepted (requirement 10, spec §17).
- **Base-table security backlog is out of scope.** The `PENDING` base-table grants/RLS item is not absorbed or remediated by this project (requirement 12).
- **Secrets.** `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` are never printed, echoed, hashed into artifacts, or committed. Error bodies are truncated to the first 400 characters (spec §14).
- **Locked testing approach.** Do NOT import `.mjs` directly into ts-jest. All `.mjs` coverage runs through repo-consistent child Node subprocesses (`node --input-type=module --eval ...`) that import the `.mjs` module by absolute path (via `JSON.stringify(path)` exactly as `tests/migration-order.test.ts` already does) and invoke exported functions with injected fakes. No hidden production test flags.

## Frozen Baseline Reference (audited at worktree HEAD `095db025`; recon `origin/main` = `SPEC_RECON_MAIN_SHA`)

- **Recon baseline constant (locked):** `SPEC_RECON_MAIN_SHA=9cdadf040eb0cc290d011054f98aa024d179caf5` — the permanent `main` commit from which the spec branch forked. Phase 1 and Phase 4 use this SHA as the migration-estate and migration-order diff baseline. `095db02509fdd6381ca70667b474f5060a7c05f7` is retained only as the approved spec-document commit reference (it is a local documentation commit and may later be squash-merged under a different SHA); it is never the production-estate comparison anchor.
- `supabase/migrations/` = exactly 69 `.sql` files; tiers 8 base / 57 timestamped / 4 index.
- Specimen hashes (independently re-measured): `content_jobs.sql` = `5447521c49918ab21406ece72eb6fcf0bb73c56fa8cb3f85c3faf0940fccb55b`; `20260915_support_security_boundary.sql` = `6b551ec8090ec4b727459cb7fe45ebd2b584c9dca4a93d018ceaf0de10a151e3`.
- Frozen order = spec Appendix A (`docs/superpowers/specs/2026-09-15-forward-only-migration-ledger-design.md`).
- Phase mapping of the spec test matrix: **Phase 1** T1, T2, T10; **Phase 2** T9, T13 (scratch DB only, never production; Task 2.3 scratch gate), T14 (adoption workflow contract), T16; **Phase 4** T3–T8, T11, T12, T14 (apply workflow contract), T15 (runner extension), T17. **T15 phase allocation correction:** the first substantive native-history read-only assertion lives in Phase 2 beside the SQL/adoption code (Task 2.1), and Phase 4 extends the same assertion to the runner (Task 4.3). Phase 1 contains no native-history test because there is no native-writing code to guard yet; this avoids a vacuous Phase-1 test while preserving INV-10. This is a test-allocation correction only, not an architecture change.

## Execution Model

- **Phase 1** — branch `architecture/migration-ledger-phase-1` created from the audited `origin/main`; Tasks 1.1–1.4 plus Phase Gate 1 PR. Non-triggering files only.
- **Phase 2** — branch `architecture/migration-ledger-phase-2` created from `origin/main` after Phase 1 merges; Tasks 2.1–2.3 plus Phase Gate 2 PR. Non-triggering files only.
- **Phase 3** — operational only (manual adoption dispatch, independent read-only supervisor verification, docs-only evidence PR). Tasks 3.1–3.4. No source commits. Phase-4 work is forbidden until Task 3.4 is merged/accepted.
- **Phase 4** — branch `architecture/migration-ledger-phase-4` created from `origin/main` after Phase 3 merges; Tasks 4.1–4.5. All trigger-path edits (`scripts/migration-order.mjs`, `scripts/apply-migrations.mjs`, `.github/workflows/apply-seo-factory-migrations.yml`) stay on this one branch and merge as ONE PR. Never merge any Phase-4 commit separately: the merge push must be the first trigger-path event, and it must run the new ledger-aware code as a 69-skip / 0-applied no-op.
- Every task is test-first where a behavior is introduced: author/adjust the test or probe, run it and observe the stated RED failure, implement, run it and observe the stated GREEN pass, run the regression command, then commit with the exact message given.

---

# Phase 1 — Additive baseline artifacts (non-triggering)

## Task 1.1 — HARD PRECONDITION: re-audit the approved 69-file estate

**Files**
- None. Read-only gate. No file may be created or modified. No commit.

**Interfaces**
- Consumes `migrationOrder()` from `scripts/migration-order.mjs` and `MIGRATIONS_DIR`.
- Produces recorded evidence (audited `origin/main` SHA, order summary, tier split, specimen hashes) quoted into the Task 1.2 commit body.

**Steps**
- [ ] 1. Fetch current remote state: `git fetch --prune origin`.
- [ ] 2. Record the audited main SHA: `git rev-parse origin/main` → `<AUDITED_MAIN_SHA>` (40 hex). If this fails, STOP.
- [ ] 3. Prove the spec-document commit exists (approved spec reference only; never the production-estate anchor): `git rev-parse 095db02509fdd6381ca70667b474f5060a7c05f7` → `095db02509fdd6381ca70667b474f5060a7c05f7`. If not, STOP.
- [ ] 4. Prove the locked recon baseline exists and is an ancestor of the audited main:
  ```bash
  SPEC_RECON_MAIN_SHA=9cdadf040eb0cc290d011054f98aa024d179caf5
  git cat-file -e "$SPEC_RECON_MAIN_SHA^{commit}"
  git merge-base --is-ancestor "$SPEC_RECON_MAIN_SHA" origin/main && echo RECON_OK
  ```
  Expected: `RECON_OK` (exit 0). If not, STOP.
- [ ] 5. Prove migration bytes are unchanged since `SPEC_RECON_MAIN_SHA`:
  `git diff --stat "$SPEC_RECON_MAIN_SHA" origin/main -- supabase/migrations/` → empty output.
- [ ] 6. Prove the ordering source is unchanged since `SPEC_RECON_MAIN_SHA`:
  `git diff --stat "$SPEC_RECON_MAIN_SHA" origin/main -- scripts/migration-order.mjs` → empty output.
- [ ] 7. Confirm the working tree is on a branch based on `<AUDITED_MAIN_SHA>`: `git merge-base --is-ancestor origin/main HEAD && echo OK` → `OK`.
- [ ] 8. Re-audit count/order/tiers:
  `node scripts/migration-order.mjs --json` → parse and assert `order.length === 69`, `base.length === 8`, `timestamped.length === 57`, `indexes.length === 4`, and `timestampedPattern === "^\\d{8}_[A-Za-z0-9_]+\\.sql$"`.
- [ ] 9. Re-audit specimen bytes:
  `shasum -a 256 supabase/migrations/content_jobs.sql supabase/migrations/20260915_support_security_boundary.sql` → `5447…55b` and `6b55…1e3` exactly as recorded above.
- [ ] 10. **RED (prove the drift gate has teeth).** Run this probe; it must succeed by detecting the tampered byte:
  ```bash
  tmp="$(mktemp -d)"
  cp supabase/migrations/content_jobs.sql "$tmp/content_jobs.sql"
  printf '\n-- drift probe\n' >> "$tmp/content_jobs.sql"
  if shasum -a 256 "$tmp/content_jobs.sql" | grep -q '^5447521c49918ab21406ece72eb6fcf0bb73c56fa8cb3f85c3faf0940fccb55b'; then
    echo "GATE BROKEN: tampered bytes still matched"; exit 1
  fi
  echo "DRIFT PROBE OK: one appended line changes the hash"
  rm -rf "$tmp"
  ```
  Expected: `DRIFT PROBE OK: one appended line changes the hash` (exit 0).
- [ ] 11. **GREEN (full audit).** Re-run steps 5–9 together:
  ```bash
  SPEC_RECON_MAIN_SHA=9cdadf040eb0cc290d011054f98aa024d179caf5
  git diff --quiet "$SPEC_RECON_MAIN_SHA" origin/main -- supabase/migrations/ scripts/migration-order.mjs
  node -e "const {execFileSync}=require('node:child_process');const m=JSON.parse(execFileSync('node',['scripts/migration-order.mjs','--json'],{encoding:'utf8'}));if(m.order.length!==69||m.base.length!==8||m.timestamped.length!==57||m.indexes.length!==4)process.exit(1);console.log('ESTATE BASELINE CONFIRMED: 69 files (8/57/4)')"
  ```
  Expected: `ESTATE BASELINE CONFIRMED: 69 files (8/57/4)` and exit 0.
- [ ] 12. **STOP condition (mandatory).** If any of steps 2–9 or 11 deviate in count, order, or bytes, STOP immediately, do not generate the manifest, and report to the supervisor for re-baselining. Only the supervisor may re-approve a changed estate.

**RED command:** step 10 probe above — expected failure of the match (`DRIFT PROBE OK` proves the gate catches byte drift).
**GREEN command:** step 11 audit above — expected `ESTATE BASELINE CONFIRMED: 69 files (8/57/4)`, exit 0.
**Regression command:** `npx jest tests/migration-order.test.ts` → 8/8 pass; `node scripts/migration-order.mjs --check` → `migration-order: 69 migrations, all accounted for.`
**Exact commit message:** none — read-only gate, zero diff. Quote the evidence (`<AUDITED_MAIN_SHA>`, the locked `SPEC_RECON_MAIN_SHA=9cdadf04…` constant, empty diffs vs `SPEC_RECON_MAIN_SHA`, spec-doc commit `095db025` recorded as reference only, 69/8/57/4, both specimen hashes) in the Task 1.2 commit body.

## Task 1.2 — Create the frozen baseline manifest

**Files**
- Create: `supabase/migration-baseline.json`
- Create: none other. Do not modify any other file.

**Interfaces**
- File shape (spec §8.2): `{ manifestVersion: 1, generatedAt, generatedFrom: { repository, gitSha, migrationOrderSource, migrationCount }, ledger: { schema: 'supabase_migrations', table: 'yousafe_migration_ledger' }, files: [{ filename, sha256, tier, legacy }] }`.
- `files` has exactly 69 entries in exact `migrationOrder()` order; `tier` is `base` (8), `timestamped` (57), `index` (4); `legacy === true` for all.
- `generatedFrom.gitSha` is the later audited current `origin/main` SHA recorded by Task 1.1 (the frozen baseline-content SHA; it is valid only because Task 1.1 proved the migration estate and `scripts/migration-order.mjs` byte-identical to `SPEC_RECON_MAIN_SHA`, and it is never replaced by a later dispatch SHA). `SPEC_RECON_MAIN_SHA` itself is never written into the manifest.
- Only the exact generator below may write this file. Never hand-edit a hash. Regeneration is a reviewed event (spec §8.3).

**Steps**
- [ ] 1. Confirm the precondition evidence from Task 1.1 is at hand and the tree is clean: `git status --porcelain` → empty.
- [ ] 2. **RED.** `node -e "JSON.parse(require('node:fs').readFileSync('supabase/migration-baseline.json','utf8'))"` → fails with `ENOENT: no such file or directory` (the artifact and its validation input do not exist yet).
- [ ] 3. Run the exact generator command (a one-off; it is not committed):
  ```bash
  node --input-type=module --eval '
  import { createHash } from "node:crypto";
  import { readFileSync, writeFileSync } from "node:fs";
  import { execFileSync } from "node:child_process";
  import { join } from "node:path";

  const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();
  const meta = JSON.parse(run("node", ["scripts/migration-order.mjs", "--json"]));
  const gitSha = run("git", ["rev-parse", "origin/main"]);

  if (meta.order.length !== 69) {
    console.error(`ESTATE COUNT MISMATCH: expected 69, found ${meta.order.length}`);
    process.exit(1);
  }
  if (!/^[0-9a-f]{40}$/.test(gitSha)) {
    console.error(`INVALID MAIN SHA: ${gitSha}`);
    process.exit(1);
  }

  const base = new Set(meta.base);
  const indexes = new Set(meta.indexes);
  const files = meta.order.map((filename) => ({
    filename,
    sha256: createHash("sha256").update(readFileSync(join("supabase", "migrations", filename))).digest("hex"),
    tier: base.has(filename) ? "base" : indexes.has(filename) ? "index" : "timestamped",
    legacy: true,
  }));

  const manifest = {
    manifestVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedFrom: {
      repository: "kylemwalkerpr-ship-it/portal",
      gitSha,
      migrationOrderSource: "scripts/migration-order.mjs",
      migrationCount: files.length,
    },
    ledger: { schema: "supabase_migrations", table: "yousafe_migration_ledger" },
    files,
  };

  writeFileSync("supabase/migration-baseline.json", JSON.stringify(manifest, null, 2) + "\n");
  console.error(`migration-baseline: wrote ${files.length} files (base=${meta.base.length}, timestamped=${meta.timestamped.length}, index=${meta.indexes.length}), gitSha=${gitSha}`);
  '
  ```
  Expected stderr: `migration-baseline: wrote 69 files (base=8, timestamped=57, index=4), gitSha=<AUDITED_MAIN_SHA>`.
- [ ] 4. Inspect the generated file end to end: `node -e "const m=require('./supabase/migration-baseline.json');console.log(m.manifestVersion, m.files.length, m.files[0].filename, m.files[68].filename, m.generatedFrom.gitSha)"` → `1 69 content_jobs.sql content_jobs_fts_index.sql <AUDITED_MAIN_SHA>`.
- [ ] 5. **GREEN.** Verify structure and frozen values:
  ```bash
  node -e "
  const m=require('./supabase/migration-baseline.json');
  const sha=(p)=>require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(p)).digest('hex');
  if(m.manifestVersion!==1||m.files.length!==69||m.generatedFrom.migrationCount!==69)throw new Error('shape');
  if(m.files.some(f=>f.legacy!==true))throw new Error('legacy');
  if(m.files[0].sha256!==sha('supabase/migrations/'+m.files[0].filename))throw new Error('hash0');
  if(m.files[68].sha256!==sha('supabase/migrations/'+m.files[68].filename))throw new Error('hash68');
  if(m.files[0].filename!=='content_jobs.sql'||m.files[0].sha256!=='5447521c49918ab21406ece72eb6fcf0bb73c56fa8cb3f85c3faf0940fccb55b')throw new Error('specimen0');
  if(m.files[64].filename!=='20260915_support_security_boundary.sql'||m.files[64].sha256!=='6b551ec8090ec4b727459cb7fe45ebd2b584c9dca4a93d018ceaf0de10a151e3')throw new Error('specimen64');
  console.log('MANIFEST OK: 69/69 hashes on disk, tiers 8/57/4, gitSha='+m.generatedFrom.gitSha);
  "
  ```
  Expected: `MANIFEST OK: 69/69 hashes on disk, tiers 8/57/4, gitSha=<AUDITED_MAIN_SHA>`.
- [ ] 6. Verify `generatedFrom.gitSha` equals the audited main SHA: `test "$(node -p "require('./supabase/migration-baseline.json').generatedFrom.gitSha")" = "$(git rev-parse origin/main)" && echo SHA_OK`.
- [ ] 7. Verify the frozen order equals `migrationOrder()` element-wise:
  `node -e "const {execFileSync}=require('node:child_process');const m=require('./supabase/migration-baseline.json');const o=JSON.parse(execFileSync('node',['scripts/migration-order.mjs','--json'],{encoding:'utf8'})).order;if(m.files.map(f=>f.filename).join()!==o.join())process.exit(1);console.log('ORDER OK')"` → `ORDER OK`.
- [ ] 8. File-scope check: `git status --porcelain` → only `?? supabase/migration-baseline.json` (plus any untracked plan/spec docs already present on the control branch).
- [ ] 9. **Regression:** `git diff --exit-code -- supabase/migrations scripts/migration-order.mjs scripts/apply-migrations.mjs .github/workflows/apply-seo-factory-migrations.yml` → exit 0 (no trigger-path change); `npx jest tests/migration-order.test.ts` → 8/8 pass.
- [ ] 10. Commit: `git add supabase/migration-baseline.json && git commit -m "feat(migrations): freeze 69-file baseline manifest" -m "Precondition: origin/main=<AUDITED_MAIN_SHA>, migration estate and ordering source byte-identical to SPEC_RECON_MAIN_SHA=9cdadf040eb0cc290d011054f98aa024d179caf5 (spec-doc commit 095db025 recorded as reference only), 69 files (8 base / 57 timestamped / 4 index), specimen hashes content_jobs.sql=5447…55b and 20260915_support_security_boundary.sql=6b55…1e3 re-measured."` (substitute the real 40-hex SHA and full hashes).

**RED command:** step 2 → `ENOENT` failure.
**GREEN command:** step 5 → `MANIFEST OK: 69/69 hashes on disk, tiers 8/57/4, gitSha=<AUDITED_MAIN_SHA>`.
**Regression command:** step 9 (`git diff --exit-code` trigger paths; `npx jest tests/migration-order.test.ts` 8/8).
**Exact commit message:** `feat(migrations): freeze 69-file baseline manifest`

## Task 1.3 — Policy module (manifest/hash/naming) + policy tests (T1, T2)

**Files**
- Create: `scripts/migration-ledger-policy.mjs`
- Create: `tests/migration-ledger-policy.test.ts`
- Modify: none. (Task 1.4 extends the same new module with `ddlOnly` and `scanTransactionSafety`.)

**Interfaces (locked export names)**
```js
export const MANIFEST_VERSION = 1
export const FROZEN_BASELINE_COUNT = 69
export const MANIFEST_PATH = <repo>/supabase/migration-baseline.json
export const LEGACY_TIMESTAMPED_RE = /^\d{8}_[A-Za-z0-9_]+\.sql$/
export const FUTURE_MIGRATION_RE = /^\d{14}_[a-z0-9_]+\.sql$/
export const ORDERING_TIMESTAMPED_RE = /^(?:\d{8}|\d{14})_[A-Za-z0-9_]+\.sql$/
export function sha256Hex(bytes)                       // Buffer|string -> 64 lowercase hex
export function hashFile(path, { readFile = readFileSync } = {})
export function loadManifest(path = MANIFEST_PATH, { readFile = readFileSync } = {})  // throws `manifest: <cause>`
export function isValidUtcTimestampDigits(digits)      // true for a valid UTC YYYYMMDDHHmmss
export function validateManifest(manifest, { order, dir = MIGRATIONS_DIR, readFile = readFileSync, requireExactEstate = false } = {})
  // -> { ok: boolean, violations: Array<{ rule, filename, message }> }
export function validateMigrationSet({ order, manifest })
  // -> { ok: boolean, violations: Array<{ rule, filename, message }> }
```
- The module imports `BASE_ORDER`, `INDEX_ORDER`, `MIGRATIONS_DIR`, `migrationOrder` from `./migration-order.mjs` read-only (Phase 1 never modifies that file).
- `validateManifest` compares `manifest.files` names against the **baseline subset** of `order`: everything except files matching `/^\d{14}_/` that are not in the manifest (future 14-digit transactions may already exist on disk in Phase 4+ and are not baseline entries). It also verifies manifest-internal consistency, disk existence, disk SHA-256, tier, and `legacy === true`. `requireExactEstate: true` (used only by adoption) additionally asserts `order.length === FROZEN_BASELINE_COUNT` and exact element-wise equality of `order` to the manifest filenames — no 70th migration may exist at adoption time. The default remains tolerant of future files for Phase 4+.
- `validateMigrationSet` applies the grandfather/future naming rules (spec §9.3): pinned nonnumeric names must be baseline; 8-digit timestamped names must be baseline else `REJECT_NEW_LEGACY_NAME`; 14-digit names must match `FUTURE_MIGRATION_RE`, carry a valid unique UTC prefix, else `REJECT_FUTURE_NAME` / `REJECT_DUPLICATE_TIMESTAMP`.
- Exact rule IDs (used by tests and CI output): `MANIFEST_VERSION_MISMATCH`, `MANIFEST_COUNT_MISMATCH`, `MANIFEST_ORDER_MISMATCH`, `MANIFEST_ESTATE_CHANGED`, `MANIFEST_DUPLICATE_FILENAME`, `MANIFEST_TIER_MISMATCH`, `MANIFEST_LEGACY_FLAG_MISMATCH`, `MANIFEST_INVALID_HASH`, `MANIFEST_FUTURE_FILE`, `BASELINE_FILE_MISSING`, `BASELINE_HASH_DRIFT`, `REJECT_NEW_LEGACY_NAME`, `REJECT_FUTURE_NAME`, `REJECT_DUPLICATE_TIMESTAMP`, `REJECT_UNKNOWN_PINNED_NAME`.
- CLI (same file): `node scripts/migration-ledger-policy.mjs --check` runs manifest + naming validation over `migrationOrder()` and exits 1 on any violation. (Task 1.4 adds transaction-safety to the same `--check`.)

**Concrete module code**
```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { BASE_ORDER, INDEX_ORDER, MIGRATIONS_DIR, migrationOrder } from './migration-order.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const MANIFEST_VERSION = 1
export const FROZEN_BASELINE_COUNT = 69
export const MANIFEST_PATH = join(__dirname, '..', 'supabase', 'migration-baseline.json')
export const LEGACY_TIMESTAMPED_RE = /^\d{8}_[A-Za-z0-9_]+\.sql$/
export const FUTURE_MIGRATION_RE = /^\d{14}_[a-z0-9_]+\.sql$/
export const ORDERING_TIMESTAMPED_RE = /^(?:\d{8}|\d{14})_[A-Za-z0-9_]+\.sql$/

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function hashFile(path, { readFile = readFileSync } = {}) {
  return sha256Hex(readFile(path))
}

export function loadManifest(path = MANIFEST_PATH, { readFile = readFileSync } = {}) {
  try {
    return JSON.parse(readFile(path, 'utf8'))
  } catch (err) {
    throw new Error(`manifest: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function isValidUtcTimestampDigits(digits) {
  if (!/^\d{14}$/.test(digits)) return false
  const year = Number(digits.slice(0, 4))
  const month = Number(digits.slice(4, 6))
  const day = Number(digits.slice(6, 8))
  const hour = Number(digits.slice(8, 10))
  const minute = Number(digits.slice(10, 12))
  const second = Number(digits.slice(12, 14))
  if (month < 1 || month > 12) return false
  if (hour > 23 || minute > 59 || second > 59) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function validateManifest(manifest, { order, dir = MIGRATIONS_DIR, readFile = readFileSync, requireExactEstate = false } = {}) {
  const violations = []
  const push = (rule, filename, message) => violations.push({ rule, filename, message })
  if (!order) order = migrationOrder({ dir })

  if (manifest?.manifestVersion !== MANIFEST_VERSION) {
    push('MANIFEST_VERSION_MISMATCH', null, `manifestVersion must be ${MANIFEST_VERSION}`)
  }
  const files = Array.isArray(manifest?.files) ? manifest.files : []
  if (files.length !== FROZEN_BASELINE_COUNT) {
    push('MANIFEST_COUNT_MISMATCH', null, `expected ${FROZEN_BASELINE_COUNT} files, found ${files.length}`)
  }
  if (manifest?.generatedFrom?.migrationCount !== files.length) {
    push('MANIFEST_COUNT_MISMATCH', null, 'generatedFrom.migrationCount does not match files length')
  }
  const names = files.map((f) => f.filename)
  const seen = new Set()
  for (const name of names) {
    if (seen.has(name)) push('MANIFEST_DUPLICATE_FILENAME', name, 'filename appears more than once')
    seen.add(name)
  }
  const manifestNames = new Set(names)
  const baselineOrder = order.filter((f) => !(/^\d{14}_/.test(f) && !manifestNames.has(f)))
  if (baselineOrder.length !== names.length || baselineOrder.some((f, i) => f !== names[i])) {
    push('MANIFEST_ORDER_MISMATCH', null, `manifest order != baseline migrationOrder() (${baselineOrder.length} baseline files)`)
  }
  if (requireExactEstate && (order.length !== FROZEN_BASELINE_COUNT || order.some((f, i) => f !== names[i]))) {
    push('MANIFEST_ESTATE_CHANGED', null, `requireExactEstate: migrationOrder() must be exactly the ${FROZEN_BASELINE_COUNT} manifest filenames (found ${order.length})`)
  }

  const base = new Set(BASE_ORDER)
  const indexes = new Set(INDEX_ORDER)
  for (const entry of files) {
    if (/^\d{14}_/.test(entry.filename)) {
      push('MANIFEST_FUTURE_FILE', entry.filename, 'future files must never appear in the manifest')
    }
    const expectedTier = base.has(entry.filename) ? 'base' : indexes.has(entry.filename) ? 'index' : 'timestamped'
    if (entry.tier !== expectedTier) push('MANIFEST_TIER_MISMATCH', entry.filename, `tier ${entry.tier} != ${expectedTier}`)
    if (entry.legacy !== true) push('MANIFEST_LEGACY_FLAG_MISMATCH', entry.filename, 'legacy must be true')
    if (!/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) {
      push('MANIFEST_INVALID_HASH', entry.filename, 'sha256 must be 64 lowercase hex')
      continue
    }
    let disk
    try {
      disk = hashFile(join(dir, entry.filename), { readFile })
    } catch {
      push('BASELINE_FILE_MISSING', entry.filename, `missing on disk: ${entry.filename}`)
      continue
    }
    if (disk !== entry.sha256) push('BASELINE_HASH_DRIFT', entry.filename, `disk ${disk} != manifest ${entry.sha256}`)
  }
  return { ok: violations.length === 0, violations }
}

export function validateMigrationSet({ order, manifest }) {
  const violations = []
  const baselineNames = new Set((manifest?.files ?? []).map((f) => f.filename))
  const prefixes = new Map()
  for (const filename of order) {
    if (baselineNames.has(filename)) continue
    if (LEGACY_TIMESTAMPED_RE.test(filename)) {
      violations.push({ rule: 'REJECT_NEW_LEGACY_NAME', filename, message: '8-digit name is not in the frozen baseline' })
      continue
    }
    if (/^\d{14}_/.test(filename)) {
      if (!FUTURE_MIGRATION_RE.test(filename)) {
        violations.push({ rule: 'REJECT_FUTURE_NAME', filename, message: 'must match YYYYMMDDHHmmss_lowercase.sql' })
        continue
      }
      const digits = filename.slice(0, 14)
      if (!isValidUtcTimestampDigits(digits)) {
        violations.push({ rule: 'REJECT_FUTURE_NAME', filename, message: `invalid UTC timestamp ${digits}` })
        continue
      }
      const previous = prefixes.get(digits)
      if (previous) {
        violations.push({ rule: 'REJECT_DUPLICATE_TIMESTAMP', filename, message: `timestamp ${digits} already used by ${previous}` })
      } else {
        prefixes.set(digits, filename)
      }
      continue
    }
    violations.push({ rule: 'REJECT_UNKNOWN_PINNED_NAME', filename, message: 'non-timestamped name is not a pinned baseline file' })
  }
  return { ok: violations.length === 0, violations }
}

// CLI (extended in Task 1.4 with transaction safety)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--check')) {
    console.error('usage: node scripts/migration-ledger-policy.mjs --check')
    process.exit(1)
  }
  const order = migrationOrder()
  const manifest = loadManifest()
  const manifestCheck = validateManifest(manifest, { order })
  const namingCheck = validateMigrationSet({ order, manifest })
  for (const v of [...manifestCheck.violations, ...namingCheck.violations]) {
    console.error(`::error file=${v.filename ?? 'supabase/migration-baseline.json'}::${v.rule} ${v.message}`)
  }
  if (!manifestCheck.ok || !namingCheck.ok) {
    console.error(`migration-ledger-policy: FAILED (${manifestCheck.violations.length + namingCheck.violations.length} violations)`)
    process.exit(1)
  }
  console.error(`migration-ledger-policy: manifest OK (69 files: 8 base, 57 timestamped, 4 index)`)
  console.error('migration-ledger-policy: naming policy OK')
}
```

**Test harness (repo-consistent child subprocesses; never import `.mjs` into ts-jest)**
```ts
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
```

**Steps**
- [ ] 1. Author `tests/migration-ledger-policy.test.ts` first (full test list below).
- [ ] 2. **RED.** `npx jest tests/migration-ledger-policy.test.ts` → all tests fail: the child process exits non-zero with `ERR_MODULE_NOT_FOUND` for `scripts/migration-ledger-policy.mjs` (the suite cannot load its subject yet).
- [ ] 3. Create `scripts/migration-ledger-policy.mjs` exactly as specified above.
- [ ] 4. **GREEN.** `npx jest tests/migration-ledger-policy.test.ts` → all pass.

**Required assertions in `tests/migration-ledger-policy.test.ts`**
- T1.1 manifest shape: `MANIFEST_VERSION === 1`; `files.length === 69`; `generatedFrom.migrationCount === 69`; `generatedFrom.repository === 'kylemwalkerpr-ship-it/portal'`; `generatedFrom.migrationOrderSource === 'scripts/migration-order.mjs'`; `ledger.schema === 'supabase_migrations'`; `ledger.table === 'yousafe_migration_ledger'`.
- T1.2 tier split: base 8, timestamped 57, index 4; every `legacy === true`; filenames unique.
- T1.3 order equality: `manifest.files.map(f => f.filename)` deep-equals `migrationOrder()`.
- T1.4 independent hash equality: for every entry, `createHash('sha256')` of the raw file bytes (computed inside the child with `node:crypto`, not via the module) equals the manifest hash; specimen values `5447…55b` and `6b55…1e3` are hard-asserted.
- T1.5 `validateManifest(loadManifest(MANIFEST), { order })` → `{ ok: true, violations: [] }`.
- T1.6 baseline-subset tolerance: append `20270101120000_brand_new_thing.sql` to a copied `order` array → `validateManifest` still `ok: true` (future files are not baseline entries).
- T1.7 negative in-memory mutations each produce the exact rule ID: hash → `BASELINE_HASH_DRIFT`; swap two entries → `MANIFEST_ORDER_MISMATCH`; `tier: 'base'`→`'index'` → `MANIFEST_TIER_MISMATCH`; `legacy: false` → `MANIFEST_LEGACY_FLAG_MISMATCH`; `files.pop()` → `MANIFEST_COUNT_MISMATCH`; duplicate filename → `MANIFEST_DUPLICATE_FILENAME`; `manifestVersion: 2` → `MANIFEST_VERSION_MISMATCH`; insert a fake `20270101120000_x.sql` entry → `MANIFEST_FUTURE_FILE`.
- T1.8 missing file: `validateManifest(realManifest, { order, dir: <empty temp dir> })` → `BASELINE_FILE_MISSING`.
- T1.9 `requireExactEstate`: `validateManifest(realManifest, { order, requireExactEstate: true })` → `ok: true`; `validateManifest(realManifest, { order: [...order, '20270101120000_brand_new_thing.sql'], requireExactEstate: true })` → `MANIFEST_ESTATE_CHANGED` with `order.length === 70` in the message; the same appended-order call without `requireExactEstate` stays `ok: true` (Phase 4+ tolerance).
- T2.1 regexes: `FUTURE_MIGRATION_RE.test('20270101120000_brand_new_thing.sql') === true`; `.test('20270101_brand_new_thing.sql') === false`; `.test('20270101120000_Brand_New.sql') === false`; `.test('2027010112000_brand.sql') === false`; `LEGACY_TIMESTAMPED_RE.test('20260915_support_security_boundary.sql') === true` and `.test('20270101120000_brand_new_thing.sql') === false`; `ORDERING_TIMESTAMPED_RE` accepts both 8- and 14-digit shapes.
- T2.2 `isValidUtcTimestampDigits`: `'20270101120000'` true; `'20270228120000'` true; `'20260229120000'` false (2026 is not a leap year); `'20261301120000'` false; `'20270101126000'` false; `'2027010112000'` false.
- T2.3 `validateMigrationSet` with a synthetic manifest (one baseline `20260915_baseline.sql`) and synthetic orders: baseline name → ok; new `20270101_new_thing.sql` → `REJECT_NEW_LEGACY_NAME`; valid `20270101120000_new_thing.sql` → ok; invalid calendar `20270230120000_new.sql` → `REJECT_FUTURE_NAME`; uppercase `20270101120000_New.sql` → `REJECT_FUTURE_NAME`; duplicate prefix pair → `REJECT_DUPLICATE_TIMESTAMP`; unknown pinned `brand_new_thing.sql` → `REJECT_UNKNOWN_PINNED_NAME`.
- T2.4 `sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'`.
- T2.5 CLI: `node scripts/migration-ledger-policy.mjs --check` exits 0 and stderr contains `migration-ledger-policy: manifest OK (69 files: 8 base, 57 timestamped, 4 index)` and `migration-ledger-policy: naming policy OK`.

- [ ] 5. **Regression.** `npx jest tests/migration-order.test.ts tests/migration-ledger-policy.test.ts` → all pass (existing 8/8 + new suite).
- [ ] 6. File-scope check: `git status --porcelain` → only the two new files.
- [ ] 7. Commit: `git add scripts/migration-ledger-policy.mjs tests/migration-ledger-policy.test.ts && git commit -m "feat(migrations): add migration ledger policy module with tests"`

**RED command:** step 2 → `ERR_MODULE_NOT_FOUND` for `scripts/migration-ledger-policy.mjs`, suite fails.
**GREEN command:** step 4 → whole policy suite passes.
**Regression command:** step 5 → `migration-order` suite 8/8 + policy suite pass.
**Exact commit message:** `feat(migrations): add migration ledger policy module with tests`

## Task 1.4 — Transaction-safety scan (T10) + estate test

**Files**
- Modify: `scripts/migration-ledger-policy.mjs` (add `ddlOnly`, `scanTransactionSafety`, extend `--check`)
- Create: `tests/migration-transaction-safety.test.ts`

**Interfaces (locked export names — completes the Phase 1 policy surface)**
```js
export function ddlOnly(sql)                 // strip $$-bodies, comments, string literals
export function scanTransactionSafety(filename, sql)
  // -> Array<{ rule, filename, message }> with rule in
  //    TOP_LEVEL_TXN_CONTROL | DENIED_STATEMENT | MISSING_TRAILING_SEMICOLON
```
- `ddlOnly` reuses the exact stripping approach already proven in `tests/migration-order.test.ts`:
  ```js
  export function ddlOnly(sql) {
    return sql
      .replace(/\$\$[\s\S]*?\$\$/g, ' ')
      .replace(/--[^\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/'(?:[^']|'')*'/g, "''")
  }
  ```
- `scanTransactionSafety` runs over `ddlOnly(sql)` and reports `\bBEGIN\b`, `\bCOMMIT\b`, `\bROLLBACK\b` (top-level transaction control) and `CREATE INDEX CONCURRENTLY`, `REINDEX`, `VACUUM`, `CREATE DATABASE`, `ALTER SYSTEM` (denied statements); it also requires the raw text to end with `;`. PL/pgSQL `BEGIN` inside `$$` bodies is stripped and allowed (spec §9.5, INV-9).
- The `--check` CLI extends its output with `migration-ledger-policy: transaction safety OK`; any violation exits 1 with `::error` lines.

**Steps**
- [ ] 1. Author `tests/migration-transaction-safety.test.ts` first (assertions below).
- [ ] 2. **RED.** `npx jest tests/migration-transaction-safety.test.ts` → fails: the child receives `TypeError: mod.scanTransactionSafety is not a function` (the locked exports do not exist yet).
- [ ] 3. Extend `scripts/migration-ledger-policy.mjs` with `ddlOnly`, `scanTransactionSafety`, and the CLI transaction-safety section.
- [ ] 4. **GREEN.** `npx jest tests/migration-transaction-safety.test.ts` → all pass.

**Required assertions in `tests/migration-transaction-safety.test.ts`**
- T10.1 estate scan: for every filename in `migrationOrder()`, `scanTransactionSafety(filename, readFileSync(join(MIGRATIONS_DIR, filename), 'utf8'))` returns `[]`, and the raw file text matches `/;\s*$/`.
- T10.2 top-level transaction control fixtures: `'BEGIN;\nSELECT 1;\nCOMMIT;'` → `TOP_LEVEL_TXN_CONTROL`; `'ROLLBACK;'` → `TOP_LEVEL_TXN_CONTROL`.
- T10.3 denied statements fixtures → `DENIED_STATEMENT`: `'CREATE INDEX CONCURRENTLY idx ON content_jobs (id);'`, `'REINDEX TABLE content_jobs;'`, `'VACUUM (ANALYZE) content_jobs;'`, `'CREATE DATABASE scratch;'`, `"ALTER SYSTEM SET work_mem = '64MB';"`.
- T10.4 trailing semicolon: `'SELECT 1'` → `MISSING_TRAILING_SEMICOLON`.
- T10.5 PL/pgSQL allowed: `'DO $$ BEGIN PERFORM 1; END $$;'` → `[]`; `"SELECT 'COMMIT;' AS x;"` → `[]`; `'-- BEGIN;\nSELECT 1;'` → `[]`.
- T10.6 `ddlOnly` direct: `ddlOnly("DO $$ BEGIN RAISE NOTICE 'x'; END $$; -- end")` removes the `$$` body and comment.
- T10.7 CLI: `--check` stderr contains all three `… OK` lines including `migration-ledger-policy: transaction safety OK`, exit 0.

- [ ] 5. **Regression.** `npx jest tests/migration-order.test.ts tests/migration-ledger-policy.test.ts tests/migration-transaction-safety.test.ts` → all pass; `npm test` full repository suite → all pass.
- [ ] 6. File-scope check: `git status --porcelain` → only `scripts/migration-ledger-policy.mjs` modified and `tests/migration-transaction-safety.test.ts` added (plus the Task 1.3 files already committed).
- [ ] 7. Commit: `git add scripts/migration-ledger-policy.mjs tests/migration-transaction-safety.test.ts && git commit -m "feat(migrations): add transaction-safety scan and estate test"`

**RED command:** step 2 → `scanTransactionSafety is not a function` in the child, suite fails.
**GREEN command:** step 4 → transaction-safety suite passes.
**Regression command:** step 5 → all four Jest files pass; full `npm test` passes.
**Exact commit message:** `feat(migrations): add transaction-safety scan and estate test`

## Phase Gate 1 — merge requirements

- [ ] Full suite: `npm test` → green.
- [ ] Scope proof: `git diff --name-only origin/main...HEAD -- supabase/migrations scripts/migration-order.mjs scripts/apply-migrations.mjs .github/workflows/apply-seo-factory-migrations.yml` → empty (no trigger path touched).
- [ ] Mechanical checks: `git diff --check` → exit 0; `git status --porcelain` → clean.
- [ ] Push and open PR: `git push -u origin architecture/migration-ledger-phase-1` then `gh pr create --base main --head architecture/migration-ledger-phase-1 --title "feat(migrations): add forward-only ledger baseline artifacts (Phase 1)" --body "Non-triggering Phase 1: manifest, policy module, policy and transaction-safety tests. No apply-trigger path modified. Precondition evidence: origin/main=<AUDITED_MAIN_SHA>, migration estate and ordering source byte-identical to SPEC_RECON_MAIN_SHA=9cdadf040eb0cc290d011054f98aa024d179caf5; spec-doc commit 095db025 recorded as reference only."`
- [ ] RED/GREEN: `gh pr list --head architecture/migration-ledger-phase-1` → empty before creation; after creation `gh pr view architecture/migration-ledger-phase-1 --json state` → `OPEN`.
- [ ] STOP: do not merge, do not self-approve, do not dispatch anything. Supervisor reviews and merges. Phase 2 branches only from the updated `main`.

---

# Phase 2 — Additive adoption path (non-triggering)

**Branch:** `architecture/migration-ledger-phase-2` from `origin/main` after Phase 1 is merged. Creates only new files; modifies nothing that the existing apply workflow can trigger on.

## Task 2.1 — Management SQL client + adoption core + adoption tests

**Files**
- Create: `scripts/supabase-management-sql.mjs`
- Create: `scripts/migration-ledger-adoption.mjs`
- Create: `tests/migration-ledger-adoption.test.ts`
- The adoption test also satisfies the T15 allocation correction here in Phase 2: the first substantive native-history read-only assertion lives beside the SQL/adoption code.

**Interfaces (locked Phase-2 names)**
```js
// scripts/supabase-management-sql.mjs
export class ManagementSqlError extends Error                 // .status, .body
export function classifyResult(result)                        // 'success' | 'transient' | 'permanent'
export async function runQueryWithRetry(sql, { runSql, sleepFn, maxAttempts = 3, backoffMs = 1000 })
  // injected runSql may throw a network error; it is normalized to { ok:false, status:0, body:String(err) } and classified transient
export function createManagementSqlClient({ projectRef, accessToken, fetchImpl = fetch, sleepFn, maxAttempts = 3, backoffMs = 1000 })
  // -> { runSql, classifyResult, query, execute }
export async function verifyPostgresRuntimeRole(client)       // -> { ok, currentUser, sessionUser, role }
export async function readNativeMigrationHistory(client)      // -> rows (SELECT-only)
export async function readLedgerRows(client)                  // -> { exists, rows }

// scripts/migration-ledger-adoption.mjs
export class AdoptionError extends Error
export function composeLedgerDdl()                            // one request: schema + table + trigger fn + trigger + revoke
export function composeBaselineInsert({ rows, sourceGitSha }) // one request: BEGIN; 69-row INSERT; completeness DO block; COMMIT;
export async function runAdoption({ client, manifestPath, migrationsDir, expectedMainSha, assertAncestor, log })
  // baseline INSERT is sent exactly once via client.runSql (never retried); SELECT reads may retry; ledger DDL may retry (idempotent)
  // a transient/unknown INSERT response is reconciled by reading the ledger: exact 69-row match => recovered, absent/empty => supervised re-dispatch required, partial/extra/mismatch => production incident
  // -> { status: 'ADOPTED' | 'ALREADY_ADOPTED', sourceGitSha, inserted, recovered, summaryLine }
```

**Concrete module code — `scripts/supabase-management-sql.mjs`**
```js
const API = (ref) => `https://api.supabase.com/v1/projects/${ref}/database/query`
const DEFAULT_SLEEP = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const truncate = (body) => String(body ?? '').slice(0, 400)

export class ManagementSqlError extends Error {
  constructor(message, { status = 0, body = '' } = {}) {
    super(message)
    this.name = 'ManagementSqlError'
    this.status = status
    this.body = body
  }
}

export function classifyResult(result) {
  if (result.ok) return 'success'
  if (result.status === 429 || result.status >= 500 || result.status === 0) return 'transient'
  return 'permanent'
}

export function createManagementSqlClient({
  projectRef,
  accessToken,
  fetchImpl = fetch,
  sleepFn = DEFAULT_SLEEP,
  maxAttempts = 3,
  backoffMs = 1000,
}) {
  if (!projectRef || !accessToken) throw new Error('management-sql: projectRef and accessToken are required')

  const runSql = async (sql) => {
    try {
      const res = await fetchImpl(API(projectRef), {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      })
      return { ok: res.ok, status: res.status, body: await res.text() }
    } catch (err) {
      return { ok: false, status: 0, body: String(err) }
    }
  }

  const query = (sql) => runQueryWithRetry(sql, { runSql, sleepFn, maxAttempts, backoffMs })

  const execute = async (sql) => {
    let last = { ok: false, status: 0, body: 'no attempt made' }
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      last = await runSql(sql)
      const cls = classifyResult(last)
      if (cls === 'success' || cls === 'permanent' || attempt === maxAttempts) return last
      await sleepFn(backoffMs * attempt)
    }
    return last
  }

  return { runSql, classifyResult, query, execute }
}

export async function runQueryWithRetry(sql, { runSql, sleepFn = DEFAULT_SLEEP, maxAttempts = 3, backoffMs = 1000 }) {
  let last = { ok: false, status: 0, body: 'no attempt made' }
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      last = await runSql(sql)
    } catch (err) {
      // Explicit interface contract: a thrown network error is status 0 (transient),
      // never dependent on the concrete fetch wrapper swallowing it.
      last = { ok: false, status: 0, body: String(err) }
    }
    const cls = classifyResult(last)
    if (cls === 'success') {
      try {
        return JSON.parse(last.body || '[]')
      } catch {
        throw new ManagementSqlError(`query returned non-JSON body: ${truncate(last.body)}`, last)
      }
    }
    if (cls === 'permanent' || attempt === maxAttempts) {
      throw new ManagementSqlError(`query failed (HTTP ${last.status}): ${truncate(last.body)}`, last)
    }
    await sleepFn(backoffMs * attempt)
  }
}

export async function verifyPostgresRuntimeRole(client) {
  const rows = await client.query(
    `SELECT current_user, session_user, current_setting('role', true) AS role`,
  )
  const row = rows[0] ?? {}
  return {
    ok: row.current_user === 'postgres' && row.session_user === 'postgres',
    currentUser: row.current_user,
    sessionUser: row.session_user,
    role: row.role,
  }
}

export async function readNativeMigrationHistory(client) {
  return client.query(`SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`)
}

export async function readLedgerRows(client) {
  const reg = await client.query(
    `SELECT to_regclass('supabase_migrations.yousafe_migration_ledger') AS ledger_reg`,
  )
  if (!reg[0]?.ledger_reg) return { exists: false, rows: [] }
  const rows = await client.query(
    `SELECT filename, sha256, applied_by, source_git_sha FROM supabase_migrations.yousafe_migration_ledger ORDER BY filename`,
  )
  return { exists: true, rows }
}

export { truncate }
```

**Concrete module code — `scripts/migration-ledger-adoption.mjs`**
```js
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
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

const __dirname = dirname(fileURLToPath(import.meta.url))

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
```

**Concrete test harness — `tests/migration-ledger-adoption.test.ts`**
```ts
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const ADOPTION = join(ROOT, 'scripts', 'migration-ledger-adoption.mjs')
const MGMT = join(ROOT, 'scripts', 'supabase-management-sql.mjs')
const POLICY = join(ROOT, 'scripts', 'migration-ledger-policy.mjs')
const MANIFEST = join(ROOT, 'supabase', 'migration-baseline.json')
const WORKFLOW = join(ROOT, '.github', 'workflows', 'adopt-migration-ledger.yml')

function evalAdoption<T>(body: string): T {
  const code = `
    const adoption = await import(${JSON.stringify(ADOPTION)})
    const mgmt = await import(${JSON.stringify(MGMT)})
    const policy = await import(${JSON.stringify(POLICY)})
    const { readFileSync } = await import('node:fs')
    ${body}
  `
  return JSON.parse(execFileSync('node', ['--input-type=module', '--eval', code], { encoding: 'utf8' }))
}
```

The scenario code inside the child builds a fake client with the exact shape the core consumes:
```js
const manifest = policy.loadManifest(${JSON.stringify(MANIFEST)})
const rowsFor = (override = () => undefined) =>
  manifest.files.map((f) => ({
    filename: f.filename,
    sha256: override(f) ?? f.sha256,
    applied_by: 'adoption-baseline',
    source_git_sha: manifest.generatedFrom.gitSha,
  }))

function fakeClient({
  ledger = { exists: false, rows: [] },
  role = { current_user: 'postgres', session_user: 'postgres', role: null },
  native = [],
  onInsert,                 // ({ ledger, inserts }) => result; may mutate ledger then return a result or throw
} = {}) {
  const queries = []
  const executes = []
  const inserts = []
  const client = {
    async query(sql) {
      queries.push(sql)
      if (sql.includes('current_user')) return [role]
      if (sql.includes('to_regclass')) {
        return [{ ledger_reg: ledger.exists ? 'supabase_migrations.yousafe_migration_ledger' : null }]
      }
      if (sql.includes('FROM supabase_migrations.yousafe_migration_ledger')) return ledger.rows
      if (sql.includes('schema_migrations')) return native
      throw new Error('unexpected query: ' + sql)
    },
    async execute(sql) {
      executes.push(sql)
      return { ok: true, status: 200, body: '[]' }
    },
    async runSql(sql) {
      inserts.push(sql)
      if (onInsert) return onInsert({ ledger, inserts })
      return { ok: true, status: 200, body: '[]' }
    },
  }
  return { client, queries, executes, inserts }
}
```

Note the fake `ledger` is mutable: a lost-response test's `onInsert` commits the 69 rows into it, then returns a transient result or throws; the follow-up reconciliation read must observe the committed rows.

**Required assertions in `tests/migration-ledger-adoption.test.ts`**
- T9.1 zero historical SQL: with a fresh (absent) ledger and postgres role, `executes.length === 1` (the ledger DDL only) and `inserts.length === 1` (the single baseline INSERT); `executes[0]` contains `CREATE TABLE IF NOT EXISTS supabase_migrations.yousafe_migration_ledger`, contains `REVOKE ALL`, and contains no `ALTER TABLE` / no `INSERT INTO` / no `.sql` file body; `inserts[0].startsWith('BEGIN;')`; no entry in either array contains any line copied from a migration file (probe for `ALTER TABLE`, `CREATE TABLE content_jobs`, `INSERT INTO public.`).
- T9.2 exact 69-row atomic insert: `composeBaselineInsert({ rows: manifest.files, sourceGitSha })` starts with `BEGIN;`, ends with `COMMIT;`, contains exactly 69 occurrences of `'adoption-baseline'`, exactly one `INSERT INTO supabase_migrations.yousafe_migration_ledger`, one `DO $$` assertion with `<> 69` checks, no `ON CONFLICT`; every manifest filename appears exactly once; every `source_git_sha` literal equals `manifest.generatedFrom.gitSha`; the value tuples appear in manifest order.
- T9.3 exact-match idempotency: fake ledger returns the 69 matching `rowsFor()` rows → `runAdoption` resolves `status === 'ALREADY_ADOPTED'`, `executes.length === 0`, `inserts.length === 0`, summary contains `writes=0`.
- T9.4 fail-closed variants, each with `executes.length === 0`, `inserts.length === 0`, and a thrown `ADOPTION FAILED` message: 68 rows (drop one); 70 rows (add `20990101_extra.sql`); one hash overridden to `'0'.repeat(64)`; one `source_git_sha` set to `'1'.repeat(40)`; one `applied_by` set to `'ci-runner'`.
- T9.5 manifest drift fails before any client call: write a tampered manifest copy to a temp dir (one hash zeroed, same 69 filenames) and call `runAdoption({ client: fakeClient().client, manifestPath: tamperedPath, ... })` → throws `ADOPTION FAILED: manifest invalid`, and the fake client recorded zero queries, zero executes, and zero inserts.
- T9.6 ancestry failure: `assertAncestor: async () => false` → throws `ADOPTION FAILED: manifest baseline sha is not an ancestor`, zero executes, zero inserts.
- T9.7 T16 role gate: role `{ current_user: 'authenticated', session_user: 'authenticated' }` → throws `runtime role is not postgres`, `executes.length === 0`, `inserts.length === 0`; role `{ current_user: 'postgres', session_user: 'supabase_admin' }` → same; both `postgres` → proceeds (1 execute + 1 insert).
- T9.8 T15 native history read-only: collect `queries`, `executes`, and `inserts`; every string containing `schema_migrations` is either the exact `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version` or otherwise starts with `SELECT`; no execute or insert string contains `schema_migrations` plus any of `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`.
- T9.9 adopt path summary line: postgres role + fresh ledger → resolves `status === 'ADOPTED'`, `inserted === 69`, `recovered === false`, `inserts.length === 1`, `summaryLine === 'LEDGER ADOPTION VERIFIED: 69/69 files, source_git_sha=<gitSha>, native_history_unchanged=true, runtime_role_verified=true'`.
- T9.10 management client retry via injected fakes: `createManagementSqlClient` with a scripted `fetchImpl` returning 503, 503, then 200 and a `sleepFn` recording milliseconds → `client.query(...)` resolves rows, `fetchImpl` called 3 times, sleeps `[1000, 2000]`; a 400 → `ManagementSqlError` with `status === 400`, one fetch, zero sleeps; a thrown network error then a 200 → succeeds with two fetches and one sleep; a directly injected `runSql` that throws `new Error('socket hang up')` on its first call and then returns `{ ok: true, status: 200, body: '[]' }` → `runQueryWithRetry` resolves `[]` with two calls and one sleep, proving thrown errors are normalized to `{ ok:false, status:0, body:String(err) }` instead of escaping; `classifyResult` maps `200 → success`, `500 → transient`, `429 → transient`, `0 → transient`, `400/401/404 → permanent`.
- T9.11 `verifyPostgresRuntimeRole` returns `{ ok: true, currentUser: 'postgres', sessionUser: 'postgres', role }` from `SELECT current_user, session_user, current_setting('role', true)`; `role` is echoed for diagnostics; `ok` is `false` for either non-postgres field.
- T9.12 `readLedgerRows` returns `{ exists: false, rows: [] }` when `to_regclass` is null and `{ exists: true, rows }` otherwise; the follow-up query is a SELECT of `filename, sha256, applied_by, source_git_sha`.
- T9.13 adoption lost-response recovery (status 0): the fake INSERT commits all 69 manifest rows into the fake ledger and then returns `{ ok: false, status: 0, body: 'socket hang up' }` → `runAdoption` resolves `status === 'ADOPTED'`, `recovered === true`, `inserted === 69`, `inserts.length === 1` (exactly ONE baseline INSERT request), `executes.length === 1`, and `summaryLine` contains `lost-response recovered` and `baseline_insert_requests=1`.
- T9.14 adoption lost-response recovery (thrown): the fake INSERT commits all 69 rows and then throws `new Error('ECONNRESET')` → same recovered result as T9.13 with `inserts.length === 1`; proves thrown network errors are normalized rather than escaping the core.
- T9.15 adoption unknown response with absent/empty ledger: the fake INSERT commits nothing and returns `{ ok: false, status: 0, body: 'timeout' }` → `runAdoption` throws `ADOPTION FAILED` containing `supervised re-dispatch`, `inserts.length === 1`, no second INSERT.
- T9.16 adoption unknown response with partial ledger: the fake INSERT commits 68 rows and returns `{ ok: false, status: 0, body: 'timeout' }` → throws containing `production incident`, `inserts.length === 1`.
- T9.17 adoption estate is exactly the frozen 69: copy `supabase/migrations` to a temp dir (`fs.cpSync(..., { recursive: true })` in the child), add the valid 14-digit 70th file `20270101120000_brand_new_thing.sql`, then call `runAdoption` with `migrationsDir` = the temp dir → throws `ADOPTION FAILED: baseline-estate-changed`, with zero queries, zero executes, zero inserts (no client call). Also assert the policy path `validateManifest(manifest, { order: [...order, '20270101120000_brand_new_thing.sql'], requireExactEstate: true })` → `MANIFEST_ESTATE_CHANGED`.

- [ ] 1. Author `tests/migration-ledger-adoption.test.ts` first (full list above; the workflow-contract assertions arrive in Task 2.2).
- [ ] 2. **RED.** `npx jest tests/migration-ledger-adoption.test.ts` → every test fails with `ERR_MODULE_NOT_FOUND` for `scripts/migration-ledger-adoption.mjs` / `scripts/supabase-management-sql.mjs`.
- [ ] 3. Create `scripts/supabase-management-sql.mjs` and `scripts/migration-ledger-adoption.mjs` exactly as specified.
- [ ] 4. **GREEN.** `npx jest tests/migration-ledger-adoption.test.ts` → all pass.
- [ ] 5. **Regression.** `npx jest tests/migration-ledger-policy.test.ts tests/migration-transaction-safety.test.ts tests/migration-ledger-adoption.test.ts` → all pass.
- [ ] 6. File-scope check: `git status --porcelain` → only the three new files.
- [ ] 7. Commit: `git add scripts/supabase-management-sql.mjs scripts/migration-ledger-adoption.mjs tests/migration-ledger-adoption.test.ts && git commit -m "feat(migrations): add management sql client and adoption core with tests"`

**RED command:** step 2 → `ERR_MODULE_NOT_FOUND` for the two new modules, suite fails.
**GREEN command:** step 4 → adoption suite passes.
**Regression command:** step 5 → policy + transaction-safety + adoption suites pass.
**Exact commit message:** `feat(migrations): add management sql client and adoption core with tests`

## Task 2.2 — Thin adoption CLI + dispatch-only workflow (T14 adoption contract)

**Files**
- Create: `scripts/adopt-migration-ledger.mjs`
- Create: `.github/workflows/adopt-migration-ledger.yml`
- Modify: `tests/migration-ledger-adoption.test.ts` (add the workflow-contract group)

**Interfaces**
- CLI environment contract: `SUPABASE_ACCESS_TOKEN` (required), `SUPABASE_PROJECT_REF` (default `krggzrxxnqfsbbklatxl`, matching the existing runner), `EXPECTED_MAIN_SHA` (required, 40 hex), `GITHUB_REF` (must be `refs/heads/main`), `GITHUB_ACTIONS`.
- The CLI is thin real wiring only: guards, real client construction, `runAdoption`, print, exit code. It contains no SQL composition and no ledger logic.

**Concrete CLI code — `scripts/adopt-migration-ledger.mjs`**
```js
#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createManagementSqlClient } from './supabase-management-sql.mjs'
import { runAdoption, AdoptionError } from './migration-ledger-adoption.mjs'

const REF = process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const EXPECTED_MAIN_SHA = process.env.EXPECTED_MAIN_SHA
const GITHUB_REF = process.env.GITHUB_REF

function guard(condition, message) {
  if (!condition) {
    console.error(`ADOPTION REFUSED: ${message}`)
    process.exit(1)
  }
}

guard(GITHUB_REF === 'refs/heads/main', `dispatched ref is ${GITHUB_REF}; main is required`)
guard(/^[0-9a-f]{40}$/.test(EXPECTED_MAIN_SHA ?? ''), 'EXPECTED_MAIN_SHA must be 40 lowercase hex')
guard(Boolean(TOKEN), 'SUPABASE_ACCESS_TOKEN is required')
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
guard(head === EXPECTED_MAIN_SHA, `checked-out HEAD ${head} != expected_main_sha ${EXPECTED_MAIN_SHA}`)

function assertAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const client = createManagementSqlClient({ projectRef: REF, accessToken: TOKEN })

try {
  const result = await runAdoption({
    client,
    expectedMainSha: EXPECTED_MAIN_SHA,
    assertAncestor,
    log: (line) => console.log(line),
  })
  console.log(result.summaryLine)
} catch (err) {
  console.error(err instanceof AdoptionError ? err.message : String(err))
  process.exit(1)
}
```

**Exact workflow file `.github/workflows/adopt-migration-ledger.yml`**
```yaml
name: Adopt Migration Ledger Baseline

on:
  workflow_dispatch:
    inputs:
      expected_main_sha:
        description: '40-hex main commit to execute (pins the checkout)'
        required: true
        type: string
      confirmation:
        description: 'Type ADOPT-BASELINE-69 to confirm'
        required: true
        type: string

permissions:
  contents: read

concurrency:
  group: seo-factory-migrations-${{ github.ref }}
  cancel-in-progress: false

jobs:
  adopt:
    name: Adopt forward-only migration ledger baseline
    runs-on: ubuntu-latest
    environment: migration-ledger-adoption
    steps:
      # First step, before checkout and before any secret is exposed: a non-main
      # or bad-confirmation dispatch must FAIL this workflow, never skip the job.
      - name: Refuse unless dispatched from main with exact confirmation
        run: |
          set -euo pipefail
          test "${{ github.ref }}" = "refs/heads/main"
          test "${{ inputs.confirmation }}" = "ADOPT-BASELINE-69"
          echo "dispatch guard passed"

      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.expected_main_sha }}

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Verify pinned checkout and baseline ancestry
        run: |
          set -euo pipefail
          test "$(git rev-parse HEAD)" = "${{ inputs.expected_main_sha }}"
          git fetch --no-tags origin main
          git merge-base --is-ancestor "${{ inputs.expected_main_sha }}" origin/main

      - name: Adopt baseline ledger (writes ledger rows only)
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
          EXPECTED_MAIN_SHA: ${{ inputs.expected_main_sha }}
          GITHUB_REF: ${{ github.ref }}
        run: |
          set -euo pipefail
          if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
            echo "::error::Missing SUPABASE_ACCESS_TOKEN repository secret"
            exit 1
          fi
          node scripts/adopt-migration-ledger.mjs
```

**Steps**
- [ ] 1. Add the workflow-contract test group to `tests/migration-ledger-adoption.test.ts` (assertions below). It reads the YAML as text with `readFileSync(WORKFLOW, 'utf8')`.
- [ ] 2. **RED.** `npx jest tests/migration-ledger-adoption.test.ts` → the contract group fails with `ENOENT` for `.github/workflows/adopt-migration-ledger.yml`.
- [ ] 3. Create `scripts/adopt-migration-ledger.mjs` and `.github/workflows/adopt-migration-ledger.yml` exactly as specified.
- [ ] 4. **GREEN.** `npx jest tests/migration-ledger-adoption.test.ts` → all pass.
- [ ] 5. CLI guard probes: `env -u SUPABASE_ACCESS_TOKEN -u EXPECTED_MAIN_SHA GITHUB_REF=refs/heads/main node scripts/adopt-migration-ledger.mjs` → exits 1 with `ADOPTION REFUSED: EXPECTED_MAIN_SHA must be 40 lowercase hex`; `SUPABASE_ACCESS_TOKEN=x EXPECTED_MAIN_SHA=$(git rev-parse HEAD) GITHUB_REF=refs/heads/feature node scripts/adopt-migration-ledger.mjs` → exits 1 with `ADOPTION REFUSED: dispatched ref is refs/heads/feature; main is required`.

**Required workflow-contract assertions (T14 adoption) in `tests/migration-ledger-adoption.test.ts`**
- YAML contains exactly one trigger: `/^\s*workflow_dispatch:/m` present and `/^\s*push:/m` absent.
- YAML contains `environment: migration-ledger-adoption`.
- YAML has no job-level `if:` (assert `/^ {4}if:/m` is null), so an invalid dispatch produces a failed workflow instead of a silently skipped job.
- The dispatch guard is the first step and precedes checkout: `yaml.indexOf('Refuse unless dispatched from main with exact confirmation') < yaml.indexOf('actions/checkout')`; the guard step runs `test "${{ github.ref }}" = "refs/heads/main"` and `test "${{ inputs.confirmation }}" = "ADOPT-BASELINE-69"`; the YAML contains the literal `ADOPT-BASELINE-69`.
- YAML contains `ref: ${{ inputs.expected_main_sha }}`.
- YAML contains `group: seo-factory-migrations-${{ github.ref }}` and `cancel-in-progress: false`.
- YAML contains `permissions:\n  contents: read`.
- YAML never echoes the token: `expect(yaml).not.toMatch(/echo\s+.*SUPABASE_ACCESS_TOKEN/i)`.
- YAML invokes `node scripts/adopt-migration-ledger.mjs` and does not reference `scripts/apply-migrations.mjs` or an inline `.sql` file list: `expect(yaml.match(/supabase\/migrations\/[a-z0-9_]+\.sql/gi)).toBeNull()`.

- [ ] 6. **Regression.** `npx jest tests/migration-ledger-adoption.test.ts tests/migration-ledger-policy.test.ts tests/migration-transaction-safety.test.ts` → all pass.
- [ ] 7. File-scope check: `git status --porcelain` → only the two new files plus the modified test file.
- [ ] 8. Commit: `git add scripts/adopt-migration-ledger.mjs .github/workflows/adopt-migration-ledger.yml tests/migration-ledger-adoption.test.ts && git commit -m "ci: add dispatch-only migration ledger adoption workflow"`

**RED command:** step 2 → `ENOENT` on the workflow file, contract group fails.
**GREEN command:** step 4 → adoption suite plus contract group passes.
**Regression command:** step 6 → policy + transaction-safety + adoption suites pass.
**Exact commit message:** `ci: add dispatch-only migration ledger adoption workflow`

## Task 2.3 — T13 scratch-database immutability integration gate

**Files**
- Create: `scripts/migration-ledger-immutability-check.mjs`
- Create: none other. T13 is a bounded manual integration gate, not a Jest test: it needs a live database and must never run in CI.

**Interfaces**
- Manual, bounded check. It is never referenced by any workflow and hard-refuses to run under GitHub Actions.
- Hard guards: `SCRATCH_SUPABASE_PROJECT_REF` required and MUST NOT equal `krggzrxxnqfsbbklatxl`; `SUPABASE_ACCESS_TOKEN` required (a scratch-project token); `T13_SCRATCH_CONFIRM` must equal the literal `RUN-T13-SCRATCH`; refuses when `GITHUB_ACTIONS === 'true'`.
- Reuses `createManagementSqlClient` and `composeLedgerDdl` from Task 2.1; composes only the probe INSERT/UPDATE/DELETE literals itself.
- Never requires a production write: every statement targets the scratch project ref only.

**Concrete script code — `scripts/migration-ledger-immutability-check.mjs`**
```js
#!/usr/bin/env node
import { createManagementSqlClient } from './supabase-management-sql.mjs'
import { composeLedgerDdl } from './migration-ledger-adoption.mjs'

const PRODUCTION_REF = 'krggzrxxnqfsbbklatxl'
const REF = process.env.SCRATCH_SUPABASE_PROJECT_REF
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const CONFIRM = process.env.T13_SCRATCH_CONFIRM
const LEDGER = 'supabase_migrations.yousafe_migration_ledger'
const FILENAME = 't13_scratch_probe.sql'
const HASH = 'a'.repeat(64)
const GIT = 'b'.repeat(40)

function refuse(message) {
  console.error(`T13 REFUSED: ${message}`)
  process.exit(1)
}

if (process.env.GITHUB_ACTIONS === 'true') refuse('this scratch integration check must never run from a workflow')
if (!REF) refuse('SCRATCH_SUPABASE_PROJECT_REF is required (a clearly non-production scratch project)')
if (REF === PRODUCTION_REF) refuse(`refusing project ref ${PRODUCTION_REF} (production); a scratch project is required`)
if (CONFIRM !== 'RUN-T13-SCRATCH') refuse('T13_SCRATCH_CONFIRM must equal RUN-T13-SCRATCH')
if (!TOKEN) refuse('SUPABASE_ACCESS_TOKEN is required (scratch project token)')

const client = createManagementSqlClient({ projectRef: REF, accessToken: TOKEN })
const step = async (label, sql) => {
  const result = await client.runSql(sql)
  if (!result.ok) {
    console.error(`T13 FAIL at ${label}: HTTP ${result.status} ${String(result.body).slice(0, 400)}`)
    process.exit(1)
  }
  return result
}

await step('ledger DDL', composeLedgerDdl())
console.error('T13 DDL APPLIED')

await step('probe INSERT', `INSERT INTO ${LEDGER} (filename, sha256, source_git_sha, applied_by) VALUES ('${FILENAME}', '${HASH}', '${GIT}', 'ci-runner');`)
console.error('T13 INSERT OK')

const updateRejected = await client.runSql(`UPDATE ${LEDGER} SET sha256 = '${'c'.repeat(64)}' WHERE filename = '${FILENAME}';`)
if (updateRejected.ok || !String(updateRejected.body).includes('55000')) {
  console.error(`T13 FAIL: UPDATE was not rejected with SQLSTATE 55000 (HTTP ${updateRejected.status})`)
  process.exit(1)
}
console.error('T13 UPDATE REJECTED 55000')

const deleteRejected = await client.runSql(`DELETE FROM ${LEDGER} WHERE filename = '${FILENAME}';`)
if (deleteRejected.ok || !String(deleteRejected.body).includes('55000')) {
  console.error(`T13 FAIL: DELETE was not rejected with SQLSTATE 55000 (HTTP ${deleteRejected.status})`)
  process.exit(1)
}
console.error('T13 DELETE REJECTED 55000')

// RED negative control, scratch only: without the trigger the same UPDATE is accepted,
// proving the 55000 above is caused by the immutability trigger, not by an unrelated error.
await step('trigger drop (scratch control)', `DROP TRIGGER IF EXISTS yousafe_migration_ledger_immutable ON ${LEDGER};`)
const control = await client.runSql(`UPDATE ${LEDGER} SET sha256 = '${'d'.repeat(64)}' WHERE filename = '${FILENAME}';`)
if (!control.ok) {
  console.error(`T13 FAIL: control UPDATE was rejected without the trigger (HTTP ${control.status})`)
  process.exit(1)
}
console.error('T13 RED CONFIRMED: UPDATE accepted without trigger')

await step('trigger restore', composeLedgerDdl())
const restored = await client.runSql(`UPDATE ${LEDGER} SET sha256 = '${'e'.repeat(64)}' WHERE filename = '${FILENAME}';`)
if (restored.ok || !String(restored.body).includes('55000')) {
  console.error('T13 FAIL: restored trigger did not reject UPDATE')
  process.exit(1)
}

await step('cleanup', `DROP TABLE IF EXISTS ${LEDGER};`)
console.error('T13 SCRATCH IMMUTABILITY GATE: PASS')
```

**Steps**
- [ ] 1. **RED (safety gate has teeth).** No database is touched:
  `T13_SCRATCH_CONFIRM=RUN-T13-SCRATCH SCRATCH_SUPABASE_PROJECT_REF=krggzrxxnqfsbbklatxl SUPABASE_ACCESS_TOKEN=x node scripts/migration-ledger-immutability-check.mjs` → exits 1 with `T13 REFUSED: refusing project ref krggzrxxnqfsbbklatxl (production); a scratch project is required` and sends zero requests. Also run without the confirmation: `SCRATCH_SUPABASE_PROJECT_REF=<scratch-ref> SUPABASE_ACCESS_TOKEN=x node scripts/migration-ledger-immutability-check.mjs` → exits 1 with `T13_SCRATCH_CONFIRM must equal RUN-T13-SCRATCH`.
- [ ] 2. Run against a clearly non-production scratch project (for example a disposable Supabase project created for this gate):
  `T13_SCRATCH_CONFIRM=RUN-T13-SCRATCH SCRATCH_SUPABASE_PROJECT_REF=<scratch-ref> SUPABASE_ACCESS_TOKEN=<scratch-token> node scripts/migration-ledger-immutability-check.mjs`
- [ ] 3. **GREEN (all six lines present, exit 0):** `T13 DDL APPLIED`, `T13 INSERT OK`, `T13 UPDATE REJECTED 55000`, `T13 DELETE REJECTED 55000`, `T13 RED CONFIRMED: UPDATE accepted without trigger`, `T13 SCRATCH IMMUTABILITY GATE: PASS`. The script restores the trigger after the control and drops the probe table at the end so scratch re-runs are clean.
- [ ] 4. Record the scratch project ref (never `krggzrxxnqfsbbklatxl`), the exact command, and the full output in the Phase-2 PR body / supervisor notes for Phase Gate 2.
- [ ] 5. File-scope check: `git status --porcelain` → only `scripts/migration-ledger-immutability-check.mjs` added.
- [ ] 6. Commit: `git add scripts/migration-ledger-immutability-check.mjs && git commit -m "test(migrations): add scratch-db ledger immutability check"`
- [ ] 7. **STOP.** Never run this against production, never wire it into a workflow, and do not proceed past Phase Gate 2 without the recorded T13 evidence.

**RED command:** step 1 ref/confirmation guard probes → `T13 REFUSED` exit 1, zero requests; plus the scratch-only trigger-drop control during the GREEN run.
**GREEN command:** steps 2–3 on the scratch project → all six evidence lines, exit 0.
**Regression command:** `npx jest tests/migration-ledger-policy.test.ts tests/migration-transaction-safety.test.ts tests/migration-ledger-adoption.test.ts` → all pass (this script is additive and unimported by tests).
**Exact commit message:** `test(migrations): add scratch-db ledger immutability check`

## Phase Gate 2 — merge requirements

- [ ] Full suite: `npm test` → green.
- [ ] Scope proof: `git diff --name-only origin/main...HEAD -- supabase/migrations scripts/migration-order.mjs scripts/apply-migrations.mjs .github/workflows/apply-seo-factory-migrations.yml` → empty.
- [ ] **T13 evidence (required).** Supervisor-recorded scratch-project ref (never `krggzrxxnqfsbbklatxl`), the exact command, and the RED/GREEN output lines: `T13 INSERT OK`, `T13 UPDATE REJECTED 55000`, `T13 DELETE REJECTED 55000`, `T13 RED CONFIRMED: UPDATE accepted without trigger`, `T13 SCRATCH IMMUTABILITY GATE: PASS`, plus the `T13 REFUSED` guard probe output. Phase Gate 2 MUST NOT be accepted without this evidence, or with a supervisor-documented blocker stating why the scratch gate could not be run and what prevents Phase 2 acceptance until it is.
- [ ] Mechanical checks: `git diff --check` → exit 0; `git status --porcelain` → clean.
- [ ] Push and open PR: `git push -u origin architecture/migration-ledger-phase-2` then `gh pr create --base main --head architecture/migration-ledger-phase-2 --title "feat(migrations): add dispatch-only ledger adoption path (Phase 2)" --body "Non-triggering Phase 2: Management SQL client, adoption core, thin CLI, adoption tests, the dispatch-only adoption workflow, and the T13 scratch-DB immutability check. No existing apply-trigger path modified. T13 scratch evidence attached (ref/command/output) or blocker documented."`
- [ ] RED/GREEN: `gh pr list --head architecture/migration-ledger-phase-2` → empty before creation; after creation `gh pr view architecture/migration-ledger-phase-2 --json state` → `OPEN`.
- [ ] STOP: do not merge, do not dispatch the adoption workflow, do not call Supabase. Supervisor reviews and merges; Phase 3 begins only after that merge.

---

# Phase 3 — Operational adoption and independent verification (no source commits)

Operational gates: RED means the fail-closed pre-state check whose deviating result STOPs the sequence; GREEN means the expected healthy production result. Phase 3 produces no source diff; its only repository change is the docs-only evidence PR in Task 3.4.

## Task 3.1 — Pre-adoption prerequisites and G0 capture

**Preconditions (all must be true before dispatching)**
- [ ] Phase 2 PR is merged to `main`; `scripts/adopt-migration-ledger.mjs` and `.github/workflows/adopt-migration-ledger.yml` exist on the current `main` tip.
- [ ] GitHub environment `migration-ledger-adoption` exists with required reviewers configured.
- [ ] Repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` exist and are readable by the adoption workflow.
- [ ] No other migration workflow run is in flight on `main`.

**Steps**
- [ ] 1. Record the adoption epoch: `git fetch origin && git rev-parse origin/main` → `<ADOPTION_MAIN_SHA>`; `gh run list --workflow=apply-seo-factory-migrations.yml --branch main --limit 3` → note the last old-runner run ID.
- [ ] 2. **RED (fail-closed pre-state).** Read production read-only through the existing privileged Management interface (no writes):
  ```sql
  SELECT to_regclass('supabase_migrations.yousafe_migration_ledger') AS ledger_reg;
  ```
  - If the table exists with rows > 0 → STOP (unexpected pre-state; supervisor review; do not adopt).
  - If the table is absent or exists with 0 rows → expected, continue.
- [ ] 3. **G0 native capture (read-only, record verbatim output):**
  ```sql
  SELECT count(*) AS native_rows FROM supabase_migrations.schema_migrations;
  SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
  ```
  Expected: native rows recorded (spec context: 7 rows) and the full version/name list archived in the task scratch notes for the Task 3.2 comparison. Any variance from the spec's recorded 7-row context is recorded, not corrected.
- [ ] 4. **GREEN.** G0 evidence captured: ledger absent/empty and native pre-state recorded with an exact row list.
- [ ] 5. STOP conditions: ledger present with unexpected rows, native capture unavailable, or prerequisites unmet → STOP; do not dispatch; report to supervisor.

**Commit:** none (read-only capture).

## Task 3.2 — Manual adoption dispatch (G1)

**Steps**
- [ ] 1. **RED (guard demonstration, optional but recorded).** Inspect the guard surface before dispatch: `gh workflow view adopt-migration-ledger.yml` shows `workflow_dispatch` inputs `expected_main_sha` and `confirmation`; the first step requires `refs/heads/main` and the exact confirmation literal `ADOPT-BASELINE-69`, and there is no job-level `if:` that could skip an invalid dispatch (a bad dispatch must fail red). Do not spend reviewer approvals on an intentional wrong-confirmation run; the guard is already covered by unit tests (T14) and the CLI probes from Task 2.2.
- [ ] 2. Dispatch with the exact inputs:
  ```bash
  gh workflow run adopt-migration-ledger.yml --ref main \
    -f expected_main_sha=<ADOPTION_MAIN_SHA> \
    -f confirmation=ADOPT-BASELINE-69
  ```
- [ ] 3. Wait for environment reviewer approval and completion:
  ```bash
  gh run list --workflow=adopt-migration-ledger.yml --limit 1
  gh run watch <RUN_ID> --exit-status
  ```
- [ ] 4. **GREEN.** The run is green and its log contains exactly:
  `LEDGER ADOPTION VERIFIED: 69/69 files, source_git_sha=<generatedFrom.gitSha>, native_history_unchanged=true, runtime_role_verified=true`
  where `<generatedFrom.gitSha>` equals `supabase/migration-baseline.json`'s `generatedFrom.gitSha` and is NOT the dispatch SHA. A lost-response recovery run logs `LEDGER ADOPTION VERIFIED (lost-response recovered): 69/69 files, source_git_sha=<generatedFrom.gitSha>, native_history_unchanged=true, runtime_role_verified=true, baseline_insert_requests=1` — also GREEN (exactly one baseline INSERT was sent). If the ledger was already exact-matching, the log contains `LEDGER ADOPTION ALREADY COMPLETE: 69/69 files, source_git_sha=<generatedFrom.gitSha>, writes=0` — that is also GREEN.
- [ ] 5. Record run URL, run ID, and the summary line verbatim in the Phase 3 scratch notes for Task 3.4.
- [ ] 6. **STOP conditions.** Any red run, any summary line that does not match, any evidence of partial rows, or any duplicate-key/log conflict → STOP. Partial or mismatched ledger = production incident. Do not dispatch again automatically; supervisor reviews first. A clean re-dispatch is safe because adoption is exact-match idempotent (absent/empty proceeds; exact 69-row match is `ALREADY_ADOPTED`; anything else fails closed).
- [ ] 7. **No runner cutover.** Until Task 3.4 is merged, no Phase 4 work, no workflow cutover, no manual apply.

**Commit:** none (operational dispatch).

## Task 3.3 — Independent supervisor verification (G2)

The supervisor — not the adoption script — queries production read-only and compares against the manifest. Use the exact literal `<generatedFrom.gitSha>` from `supabase/migration-baseline.json`.

**Steps**
- [ ] 1. **Row-count and provenance queries (read-only):**
  ```sql
  SELECT count(*) AS total_rows, count(DISTINCT filename) AS distinct_rows
  FROM supabase_migrations.yousafe_migration_ledger;
  -- expect 69 / 69

  SELECT filename, sha256, applied_by, source_git_sha
  FROM supabase_migrations.yousafe_migration_ledger
  WHERE applied_by <> 'adoption-baseline'
     OR source_git_sha <> '<generatedFrom.gitSha>'
  ORDER BY filename;
  -- expect zero rows
  ```
- [ ] 2. **Hash equality (independent of project code).** Generate the comparison list from the manifest with plain `shasum`:
  ```bash
  cd supabase/migrations
  shasum -a 256 -c <(node -e "const m=require('../../supabase/migration-baseline.json');for(const f of m.files)console.log(f.sha256+'  '+f.filename)")
  ```
  Expected: every line `OK`, zero `FAILED`. Cross-check against the ledger `sha256` column export from step 1.
- [ ] 3. **Native history identity (INV-10):**
  ```sql
  SELECT count(*) AS native_rows FROM supabase_migrations.schema_migrations;
  SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
  ```
  Expected: exactly equal to the G0 capture from Task 3.1 (count and sorted version/name list).
- [ ] 4. **Runtime-role evidence.** The green adoption log reports `runtime_role_verified=true`; confirm the same line is present in the Task 3.2 record and that the log does not print any token value.
- [ ] 5. **RED (mismatch detection).** Run the step 1 provenance query with an inverted predicate (`applied_by = 'ci-runner'`) — expected: zero rows on a healthy ledger; if rows appear, the healthy expectation is broken → STOP. The predicate inversion demonstrates the query distinguishes mismatched provenance rows.
- [ ] 6. **GREEN (G2 complete).** All checks pass: exactly 69 distinct rows, every hash equals the manifest, `applied_by = 'adoption-baseline'` for all, `source_git_sha = <generatedFrom.gitSha>` for all, native `schema_migrations` identical to G0, runtime role evidence green.
- [ ] 7. **STOP conditions and recovery language.** Any mismatch → STOP; no runner cutover; supervisor declares an incident. A mismatched or partial ledger is repaired only by a supervisor-reviewed manual DBA action (for example dropping the immutability trigger) with before/after read-only evidence recorded in `docs/superpowers/seo-execution-ledger.md`; there is no application-level repair path. Never UPDATE/DELETE through application code; never disable or revert Phases 1–2 (they are non-triggering and correct).

**Commit:** none (read-only verification).

## Task 3.4 — Docs-only evidence PR (G3)

**Files**
- Modify: `docs/superpowers/seo-execution-ledger.md` (append one section; no other doc or code change)

**Steps**
- [ ] 1. **RED.** `grep -n "Forward-Only Migration Ledger Adoption" docs/superpowers/seo-execution-ledger.md` → no match (the evidence section is absent).
- [ ] 2. Append a dated section `## 2026-09-15 — Forward-only migration ledger adoption (Phase 3)` containing: adoption run URL/ID, dispatch `expected_main_sha` = `<ADOPTION_MAIN_SHA>`, `generatedFrom.gitSha`, the exact `LEDGER ADOPTION VERIFIED` summary line, the supervisor row-count/provenance query outputs, the `shasum -c` result summary, the G0 native capture, the identical post-adoption native capture, and the statement `runtime_role_verified=true`.
- [ ] 3. **GREEN.** `grep -n "Forward-Only Migration Ledger Adoption" docs/superpowers/seo-execution-ledger.md` → section present; `git diff --check` → exit 0.
- [ ] 4. File-scope check: `git status --porcelain` → only `docs/superpowers/seo-execution-ledger.md` modified.
- [ ] 5. Commit: `git add docs/superpowers/seo-execution-ledger.md && git commit -m "docs: record forward-only migration ledger adoption evidence"`
- [ ] 6. Push and PR: `git push -u origin architecture/migration-ledger-phase-3-evidence` then `gh pr create --base main --head architecture/migration-ledger-phase-3-evidence --title "docs: record forward-only migration ledger adoption evidence" --body "Phase 3 evidence: G0/G1/G2 outputs. Phase 4 is forbidden until this PR is reviewed, merged, and accepted."`
- [ ] 7. **STOP.** Do not merge, do not self-approve, do not start Phase 4. Phase 4 is forbidden until this evidence PR is merged/accepted.

**RED command:** step 1 → no grep match.
**GREEN command:** step 3 → section present, `git diff --check` exit 0.
**Regression command:** `npx jest tests/migration-order.test.ts` → 8/8 pass (docs change must not disturb code); `git diff --name-only origin/main...HEAD` → only the ledger doc.
**Exact commit message:** `docs: record forward-only migration ledger adoption evidence`

---

# Phase 4 — First trigger-path cutover (single branch, single PR)

**Branch:** `architecture/migration-ledger-phase-4` from `origin/main` after Task 3.4 is merged. All Phase-4 commits stay on this branch. **Do not merge any Phase-4 commit separately.** The first trigger-path edit merged to `main` runs the new ledger-aware workflow and must observe `LEDGER APPLY OK: 0 applied, 69 skipped`.

## Task 4.1 — Phase-4 entry gate (read-only)

**Steps**
- [ ] 1. Confirm the Phase 3 evidence PR is merged/accepted: `git log --oneline origin/main -5 -- docs/superpowers/seo-execution-ledger.md` shows the evidence commit; `gh pr list --state merged --search "forward-only migration ledger adoption evidence"` shows it merged. Otherwise STOP.
- [ ] 2. Record `git rev-parse origin/main` → `<PHASE4_BASE_SHA>`.
- [ ] 3. Verify the estate is still byte-identical to both the recon baseline and the manifest baseline:
  ```bash
  SPEC_RECON_MAIN_SHA=9cdadf040eb0cc290d011054f98aa024d179caf5
  git diff --quiet "$SPEC_RECON_MAIN_SHA" origin/main -- supabase/migrations scripts/migration-order.mjs && echo ESTATE_STABLE_RECON
  git diff --quiet "$(node -p "require('./supabase/migration-baseline.json').generatedFrom.gitSha")" origin/main -- supabase/migrations && echo ESTATE_STABLE_MANIFEST
  ```
  Expected: `ESTATE_STABLE_RECON` and `ESTATE_STABLE_MANIFEST`.
- [ ] 4. Verify the adoption is still green: the latest `adopt-migration-ledger.yml` run on `main` is green and its summary matches (re-run `gh run list --workflow=adopt-migration-ledger.yml --limit 1`).
- [ ] 5. **RED (drift probe)** repeats the Task 1.1 step 9 tamper probe against a temp copy → `DRIFT PROBE OK`.
- [ ] 6. **GREEN.** All gates pass: evidence merged, estate stable, adoption green.
- [ ] 7. **STOP condition.** Any deviation → STOP; do not modify any trigger path; supervisor re-baselines.

**Commit:** none (read-only gate).
**RED:** step 5 probe. **GREEN:** step 6. **Regression:** `npx jest tests/migration-order.test.ts` 8/8.

## Task 4.2 — Ordering recognition of 8- or 14-digit names (T11, T12)

**Files**
- Modify: `scripts/migration-order.mjs` (regex + comment only)
- Modify: `tests/migration-order.test.ts` (future-name assertions + frozen-order assertions + policy-pattern agreement)

**Interfaces**
- `migration-order.mjs` keeps exporting `TIMESTAMPED_RE` and `timestampedPattern`; the pattern becomes `/^(?:\d{8}|\d{14})_[A-Za-z0-9_]+\.sql$/`. `BASE_ORDER`, `INDEX_ORDER`, tier layout, and `migrationOrder()` output for the 69 are unchanged byte-for-byte.

**Steps**
- [ ] 1. Update `tests/migration-order.test.ts` first:
  - Change the "auto-registers a new timestamped migration" test to assert `pattern.test('20270101_brand_new_thing.sql') === true` (grandfathered legacy shape), `pattern.test('20270101120000_brand_new_thing.sql') === true` (required future shape), `pattern.test('2027010112000_brand_new_thing.sql') === false`, `pattern.test('202701011200001_brand_new_thing.sql') === false`, `pattern.test('brand_new_thing.sql') === false`.
  - Add a test asserting the frozen order byte-for-byte: `expect(order).toEqual(JSON.parse(readFileSync(join(ROOT, 'supabase', 'migration-baseline.json'), 'utf8')).files.map((f: { filename: string }) => f.filename))`.
  - Add a temp-dir test (same pattern as the existing orphan test, using `execFileSync('node', ['--input-type=module', '-e', ...])`) where `migrationOrder({ dir })` with pinned stubs plus `20270101120000_brand_new_thing.sql` returns `[...meta.base, '20270101120000_brand_new_thing.sql', ...meta.indexes]`.
  - Add a test asserting the ordering pattern agrees with the policy constants: spawn a child that imports both `.mjs` modules and asserts `new RegExp(meta.timestampedPattern).source === policy.ORDERING_TIMESTAMPED_RE.source`.
- [ ] 2. **RED.** `npx jest tests/migration-order.test.ts` → the new 14-digit assertions fail against the current 8-digit-only pattern; the ordering-pattern-agreement test fails (`\d{8}` vs `\d{8}|\d{14}`).
- [ ] 3. Modify `scripts/migration-order.mjs`: replace `export const TIMESTAMPED_RE = /^\d{8}_[A-Za-z0-9_]+\.sql$/` with `export const TIMESTAMPED_RE = /^(?:\d{8}|\d{14})_[A-Za-z0-9_]+\.sql$/` and update the adjacent comment to state that 14-digit names are the future rule while 8-digit names are grandfathered baseline-only.
- [ ] 4. **GREEN.** `npx jest tests/migration-order.test.ts` → all old and new assertions pass.
- [ ] 5. Registry check: `node scripts/migration-order.mjs --json` → still 69/8/57/4 with the updated `timestampedPattern`.
- [ ] 6. **Regression.** `npx jest tests/migration-order.test.ts tests/migration-ledger-policy.test.ts tests/migration-transaction-safety.test.ts` → all pass.
- [ ] 7. Commit: `git add scripts/migration-order.mjs tests/migration-order.test.ts && git commit -m "feat(migrations): recognize 14-digit migration names in ordering"`

**RED command:** step 2 → new 14-digit and agreement assertions fail.
**GREEN command:** step 4 → migration-order suite passes.
**Regression command:** step 6 → ordering + policy + transaction-safety suites pass.
**Exact commit message:** `feat(migrations): recognize 14-digit migration names in ordering`

## Task 4.3 — Ledger-aware runner core + runner tests (T3–T8, T15 runner, T17)

**Files**
- Create: `scripts/migration-ledger-runner.mjs`
- Create: `tests/migration-ledger-runner.test.ts`

**Interfaces (locked injection list)**
```js
export const RUN_MODES = ['preflight', 'dry-run', 'apply']
export function composeApplyRequest({ filename, sql, sha256, sourceGitSha })
export async function runMigrationLedger({
  runSql,           // async (sql) -> { ok, status, body }; one POST per call; may throw a network error,
                    // which the runner normalizes to { ok:false, status:0, body:String(err) } and retries as transient
  readFileFn,       // (path) -> Buffer|string; defaults to fs.readFileSync
  order,            // string[] from migrationOrder()
  sourceGitSha,     // GITHUB_SHA for apply; may be null for preflight/dry-run
  sleepFn,          // async (ms) => {}
  log,              // (line: string) => {}
  mode = 'apply',   // 'preflight' | 'dry-run' | 'apply'
  manifestPath = MANIFEST_PATH,
  migrationsDir = MIGRATIONS_DIR,
  maxAttempts = 3,
  backoffMs = 1000,
})
// -> { ok, status: 'OK'|'DRY_RUN'|'PREFLIGHT'|'BLOCKED'|'STOPPED', applied, skipped, recovered, pending, summaryLine, violations }
```
- The runner builds `client = { runSql, query: (sql) => runQueryWithRetry(sql, { runSql, sleepFn, maxAttempts, backoffMs }) }` and reuses `verifyPostgresRuntimeRole`, `readNativeMigrationHistory`, `readLedgerRows`, and `classifyResult` from `scripts/supabase-management-sql.mjs`.

**Concrete runner code (behavior contract)**
```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MANIFEST_PATH,
  loadManifest,
  validateManifest,
  validateMigrationSet,
  sha256Hex,
  FUTURE_MIGRATION_RE,
  LEGACY_TIMESTAMPED_RE,
} from './migration-ledger-policy.mjs'
import { MIGRATIONS_DIR } from './migration-order.mjs'
import {
  runQueryWithRetry,
  classifyResult,
  verifyPostgresRuntimeRole,
  readNativeMigrationHistory,
  readLedgerRows,
} from './supabase-management-sql.mjs'

const truncate = (body) => String(body ?? '').slice(0, 400)
const GIT_SHA_RE = /^[0-9a-f]{40}$/

export const RUN_MODES = ['preflight', 'dry-run', 'apply']

export function composeApplyRequest({ filename, sql, sha256, sourceGitSha }) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(filename)) throw new Error(`runner: refusing to compose request for ${filename}`)
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`runner: invalid sha256 for ${filename}`)
  if (!GIT_SHA_RE.test(sourceGitSha)) throw new Error('runner: invalid sourceGitSha')
  return [
    'BEGIN;',
    sql,
    'INSERT INTO supabase_migrations.yousafe_migration_ledger',
    '  (filename, sha256, source_git_sha, applied_by)',
    `VALUES ('${filename}', '${sha256}', '${sourceGitSha}', 'ci-runner');`,
    'COMMIT;',
  ].join('\n')
}

export async function runMigrationLedger({
  runSql,
  readFileFn = (p) => readFileSync(p),
  order,
  sourceGitSha,
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = () => {},
  mode = 'apply',
  manifestPath = MANIFEST_PATH,
  migrationsDir = MIGRATIONS_DIR,
  maxAttempts = 3,
  backoffMs = 1000,
}) {
  if (!RUN_MODES.includes(mode)) throw new Error(`runner: unknown mode ${mode}`)
  if (!Array.isArray(order)) throw new Error('runner: order is required')
  const client = {
    runSql,
    query: (sql) => runQueryWithRetry(sql, { runSql, sleepFn, maxAttempts, backoffMs }),
  }
  const blocked = (message, violations = []) => {
    log(message)
    return { ok: false, status: 'BLOCKED', applied: [], skipped: [], recovered: [], pending: [], summaryLine: message, violations }
  }
  const stopped = (message) => {
    log(message)
    return { ok: false, status: 'STOPPED', applied: [], skipped: [], recovered: [], pending: [], summaryLine: message, violations: [] }
  }

  const manifest = loadManifest(manifestPath, { readFile: readFileFn })
  const manifestCheck = validateManifest(manifest, { order, dir: migrationsDir, readFile: readFileFn })
  if (!manifestCheck.ok) return blocked(`FAIL CLOSED: ${manifestCheck.violations.map((v) => `${v.rule} ${v.filename ?? ''}`).join('; ')}`, manifestCheck.violations)
  const namingCheck = validateMigrationSet({ order, manifest })
  if (!namingCheck.ok) return blocked(`FAIL CLOSED: ${namingCheck.violations.map((v) => `${v.rule} ${v.filename}`).join('; ')}`, namingCheck.violations)

  const ledger = await readLedgerRows(client)
  if (!ledger.exists) return blocked('CUTOVER BLOCKED: baseline ledger incomplete (0/69)')
  const byName = new Map(ledger.rows.map((row) => [row.filename, row]))
  let matched = 0
  for (const file of manifest.files) {
    const row = byName.get(file.filename)
    if (!row) continue
    if (row.sha256 !== file.sha256) {
      return blocked(`CUTOVER BLOCKED: baseline ledger hash mismatch for ${file.filename}`)
    }
    // Baseline rows additionally require manifest equality (above) and adoption provenance.
    if (row.applied_by !== 'adoption-baseline' || row.source_git_sha !== manifest.generatedFrom.gitSha) {
      return blocked(`CUTOVER BLOCKED: baseline ledger provenance mismatch for ${file.filename}`)
    }
    matched += 1
  }
  if (matched !== 69) return blocked(`CUTOVER BLOCKED: baseline ledger incomplete (${matched}/69)`)
  // Validate EVERY recorded ledger row, not only the frozen 69 baseline rows:
  // an existing 14-digit ci-runner row must still match its current disk bytes,
  // so a previously-applied migration cannot be edited after the fact.
  for (const row of ledger.rows) {
    if (!order.includes(row.filename)) return blocked(`FAIL CLOSED: orphan ledger row ${row.filename}`)
    let diskBytes
    try {
      diskBytes = readFileFn(join(migrationsDir, row.filename))
    } catch {
      return blocked(`FAIL CLOSED: recorded file missing on disk ${row.filename}`)
    }
    const diskSha = sha256Hex(diskBytes)
    if (diskSha !== row.sha256) {
      return blocked(`FAIL CLOSED: recorded file hash mismatch for ${row.filename} (ledger ${row.sha256}, disk ${diskSha})`)
    }
  }

  const nativePre = await readNativeMigrationHistory(client)
  const role = await verifyPostgresRuntimeRole(client)
  if (!role.ok) {
    return blocked(
      `FAIL CLOSED: runtime role not postgres (current_user=${role.currentUser}, session_user=${role.sessionUser}, role=${role.role}); no writes sent`,
    )
  }

  const pending = order.filter((file) => !byName.has(file))
  if (mode === 'preflight') {
    const summaryLine = `LEDGER PREFLIGHT OK: 69/69 baseline recorded, ${pending.length} pending`
    log(summaryLine)
    return { ok: true, status: 'PREFLIGHT', applied: [], skipped: [], recovered: [], pending, summaryLine, violations: [] }
  }
  if (mode === 'dry-run') {
    let skippedCount = 0
    for (const file of order) {
      if (byName.has(file)) {
        skippedCount += 1
        log(`SKIP (recorded) ${file}`)
      } else {
        log(`WOULD APPLY ${file}`)
      }
    }
    const summaryLine = `LEDGER DRY RUN OK: ${skippedCount} skipped, ${pending.length} pending`
    log(summaryLine)
    return { ok: true, status: 'DRY_RUN', applied: [], skipped: [], recovered: [], pending, summaryLine, violations: [] }
  }

  if (!GIT_SHA_RE.test(sourceGitSha ?? '')) return stopped('FAIL CLOSED: sourceGitSha must be the 40-hex GITHUB_SHA in apply mode')

  const applied = []
  const skipped = []
  const recovered = []
  for (const file of pending) {
    if (!FUTURE_MIGRATION_RE.test(file)) {
      if (LEGACY_TIMESTAMPED_RE.test(file)) return stopped(`FAIL CLOSED: REJECT_NEW_LEGACY_NAME ${file}`)
      return stopped(`FAIL CLOSED: REJECT_FUTURE_NAME ${file}`)
    }
    const bytes = readFileFn(join(migrationsDir, file))
    const sql = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes
    const diskSha = sha256Hex(bytes)
    let outcome = null
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const fresh = await client.query(
        `SELECT filename, sha256 FROM supabase_migrations.yousafe_migration_ledger WHERE filename = '${file}'`,
      )
      const existing = fresh[0]
      if (existing && existing.sha256 === diskSha) {
        outcome = attempt > 1 ? 'recovered' : 'skip'
        break
      }
      if (existing && existing.sha256 !== diskSha) {
        return stopped(`FAIL CLOSED: hash mismatch for ${file} (ledger ${existing.sha256}, disk ${diskSha})`)
      }
      const body = composeApplyRequest({ filename: file, sql, sha256: diskSha, sourceGitSha })
      let result
      try {
        result = await runSql(body)
      } catch (err) {
        // Explicit interface contract: a thrown network error is status 0 (transient),
        // never dependent on the concrete fetch wrapper swallowing it.
        result = { ok: false, status: 0, body: String(err) }
      }
      const cls = classifyResult(result)
      if (cls === 'success') {
        outcome = 'applied'
        break
      }
      if (cls === 'permanent') {
        return stopped(`STOPPED at ${file}: HTTP ${result.status} ${truncate(result.body)}`)
      }
      log(`TRANSIENT ${file}: HTTP ${result.status} (attempt ${attempt}/${maxAttempts})`)
      if (attempt < maxAttempts) await sleepFn(backoffMs * attempt)
    }
    if (outcome === null) return stopped(`STOPPED at ${file}: transient retries exhausted (${maxAttempts}/${maxAttempts})`)
    if (outcome === 'applied') {
      applied.push(file)
      log(`APPLIED ${file}`)
    } else {
      skipped.push(file)
      if (outcome === 'recovered') recovered.push(file)
      log(outcome === 'recovered' ? `SKIP (recorded after transient) ${file}` : `SKIP (recorded) ${file}`)
    }
  }

  const ledgerAfter = await readLedgerRows(client)
  if (!ledgerAfter.exists) return stopped('POST-RUN VERIFY FAILED: ledger missing after run')
  const afterByName = new Map((ledgerAfter.rows ?? []).map((row) => [row.filename, row]))
  // The successful post-run expected set is exactly the current `order`: every
  // order filename must have a ledger row whose hash equals its current disk bytes.
  for (const file of order) {
    const row = afterByName.get(file)
    let diskSha
    try {
      diskSha = sha256Hex(readFileFn(join(migrationsDir, file)))
    } catch {
      return stopped(`POST-RUN VERIFY FAILED: current file missing on disk for ${file}`)
    }
    if (!row) return stopped(`POST-RUN VERIFY FAILED: ledger row missing for ${file}`)
    if (row.sha256 !== diskSha) return stopped(`POST-RUN VERIFY FAILED: ledger hash != current disk bytes for ${file}`)
  }
  // No ledger row may exist outside `order`. Older previously-applied future rows
  // inside `order` are accepted even when this run neither applied nor recovered them.
  for (const row of ledgerAfter.rows ?? []) {
    if (!order.includes(row.filename)) return stopped(`POST-RUN VERIFY FAILED: unexpected ledger row ${row.filename}`)
  }
  const nativePost = await readNativeMigrationHistory(client)
  if (JSON.stringify(nativePre) !== JSON.stringify(nativePost)) {
    return stopped('POST-RUN VERIFY FAILED: native schema_migrations changed')
  }
  const effectiveApplied = applied.length + recovered.length
  const skippedTotal = order.length - effectiveApplied
  const summaryLine = `LEDGER APPLY OK: ${effectiveApplied} applied, ${skippedTotal} skipped, source_git_sha=${sourceGitSha}, runtime_role_verified=true`
  log(summaryLine)
  return { ok: true, status: 'OK', applied, skipped, recovered, pending, summaryLine, violations: [] }
}
```
Note on the skipped count: `effectiveApplied = applied.length + recovered.length` (a lost-response recovered file counts as applied during this run and also stays in `recovered`), and `skippedTotal = order.length - effectiveApplied`. Baseline only (order length 69): `0 applied, 69 skipped`. One new normal apply (order length 70): `1 applied, 69 skipped`. One lost-response recovery (order length 70): `1 applied, 69 skipped` with `recovered = [file]`.

**Test harness — `tests/migration-ledger-runner.test.ts`**
```ts
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const RUNNER = join(ROOT, 'scripts', 'migration-ledger-runner.mjs')
const ORDER = join(ROOT, 'scripts', 'migration-order.mjs')

function runRunner(scenario: Record<string, unknown>): { result: any; requests: string[]; sleeps: number[] } {
  const code = `
    const { runMigrationLedger } = await import(${JSON.stringify(RUNNER)})
    const { migrationOrder, MIGRATIONS_DIR } = await import(${JSON.stringify(ORDER)})
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const scenario = ${JSON.stringify(scenario)}
    const { readFileFn, runSql, requests, sleeps } = makeFakes(scenario)
    const result = await runMigrationLedger({
      runSql,
      readFileFn,
      order: scenario.order ?? migrationOrder(),
      sourceGitSha: scenario.sourceGitSha ?? 'a'.repeat(40),
      sleepFn: async (ms) => { sleeps.push(ms) },
      log: () => {},
      mode: scenario.mode ?? 'apply',
      manifestPath: join('supabase', 'migration-baseline.json'),
      migrationsDir: MIGRATIONS_DIR,
    })
    console.log(JSON.stringify({ result, requests, sleeps }))
  `
  return JSON.parse(execFileSync('node', ['--input-type=module', '--eval', code], { encoding: 'utf8' }))
}
```
`makeFakes` (inline in the same eval string) reads the real manifest to build adopted rows, routes queries by SQL text (`current_user`, `to_regclass`, `schema_migrations`, `ORDER BY filename`, `WHERE filename =`, `BEGIN;` apply bodies), commits fake ledger rows on simulated success, supports `{ status }`, `{ throwError: true }` (throw a network error instead of returning a result), `{ commitOnThrow: true }` (commit the ledger row then throw a network error), `{ dropRow: true }` (success response without a ledger row), `{ extraLedgerRows: [...] }` (pre-recorded non-baseline rows such as a `ci-runner` 14-digit row), `{ contents: { '<filename>': '<sql text>' } }` and an injectable `readFileFn` override for synthetic pending/recorded files, and per-read native pre/post sequences. Every apply request body is pushed to `requests`; every ledger-row read reflects the current fake ledger state so reconciliation after a lost response sees committed rows.

**Required runner assertions (test titles and expectations)**
- T3 skip: all 69 baseline rows matching → `status === 'OK'`, `applied.length === 0`, summary `LEDGER APPLY OK: 0 applied, 69 skipped, source_git_sha=…`, zero apply bodies, native pre/post compared.
- T3/T17 fail closed hash drift: baseline row hash changed → `status === 'BLOCKED'`, message contains `CUTOVER BLOCKED: baseline ledger hash mismatch for content_jobs.sql`, zero apply bodies.
- T3/T17 fail closed baseline provenance: a baseline `content_jobs.sql` row with `applied_by: 'ci-runner'` (or `source_git_sha` not equal to `manifest.generatedFrom.gitSha`) → `BLOCKED`, message `CUTOVER BLOCKED: baseline ledger provenance mismatch for content_jobs.sql`, zero apply bodies.
- T3 per-file different hash: fake ledger has `20270101120000_new_thing.sql` recorded with `'0'.repeat(64)`, order includes that file → `STOPPED`, message `FAIL CLOSED: hash mismatch for 20270101120000_new_thing.sql`, zero apply bodies.
- T3 unrecorded applies once: one pending valid 14-digit file with injected contents (order = real 69 + that file, length 70) → `OK`, `applied` contains the file, `recovered` empty, exactly one apply body, summary `LEDGER APPLY OK: 1 applied, 69 skipped, …`.
- T4 atomic composition: that one apply body equals `'BEGIN;\n' + contents + "\nINSERT INTO supabase_migrations.yousafe_migration_ledger\n  (filename, sha256, source_git_sha, applied_by)\nVALUES ('<file>', '<diskSha>', '<gitSha>', 'ci-runner');\nCOMMIT;"`; `indexOf(contents) === 'BEGIN;\n'.length`; exactly one occurrence of the file bytes, one INSERT, one `COMMIT;` at the end; no statement splitting.
- T5 stop after first failure: three pending files, the first returns HTTP 400 → exactly one apply body, `STOPPED`, message contains `STOPPED at <first file>` and `HTTP 400`; later files never appear in any request.
- T6 transient retry: responses 503, 503, 200 → `OK`, three apply bodies, `sleeps` deep-equals `[1000, 2000]`; a genuinely thrown `new Error('socket hang up')` then a 200 → `OK`, two apply bodies, `sleeps` deep-equals `[1000]`, proving thrown network errors are normalized to status 0 and retried; HTTP 400 → one body, zero sleeps; three 503s → `STOPPED`, message `transient retries exhausted`, three bodies, sleeps `[1000, 2000]`.
- T7 lost-response recovery: the first apply commits the fake ledger row and then throws a network error (`commitOnThrow`); the retry's fresh row read finds the equal hash → `OK`, exactly one apply body (no second SQL apply), `applied` empty, `recovered` deep-equals `[<file>]`, log `SKIP (recorded after transient)`, and summary `LEDGER APPLY OK: 1 applied, 69 skipped, …` (order length 70, effectiveApplied = applied + recovered).
- T8 cutover precondition: ledger missing one baseline row → `BLOCKED`, message `CUTOVER BLOCKED: baseline ledger incomplete (68/69)`, zero apply bodies.
- Orphan ledger row: ledger has all 69 plus `20990101_orphan.sql` → `BLOCKED`, message `FAIL CLOSED: orphan ledger row 20990101_orphan.sql`, zero apply bodies.
- Recorded-row disk drift (T3/T17): ledger has all 69 baseline rows plus a valid recorded 14-digit `ci-runner` row `20270101120000_already_recorded.sql`, `order` includes it, and the injected `readFileFn` returns changed bytes for that filename → `BLOCKED`, message `FAIL CLOSED: recorded file hash mismatch for 20270101120000_already_recorded.sql`, zero apply bodies. Companion: the same recorded row whose file is absent from the injected readFileFn → `FAIL CLOSED: recorded file missing on disk 20270101120000_already_recorded.sql`.
- Previously-applied future row accepted: all 69 baseline rows plus a recorded equal-hash `20270101120000_already_recorded.sql` (in `order`, not pending) → `OK` with zero apply bodies, the file counted in `skippedTotal` and not rejected as unexpected.
- T17 INV-13 before any write: pending file plus role `{ current_user: 'authenticated', session_user: 'authenticated' }` → `BLOCKED`, message contains `runtime role not postgres`, zero apply bodies; same with both `postgres` and nothing pending → role query still executed and run `OK`.
- Post-run verification (expected set = `order`): `{ dropRow: true }` on a successful apply → `STOPPED`, message starts `POST-RUN VERIFY FAILED` and names the missing row; a file in `order` whose post-run disk bytes no longer match its ledger hash → `STOPPED`, message `POST-RUN VERIFY FAILED: ledger hash != current disk bytes for <file>`; native post adding a row → `STOPPED`, message `POST-RUN VERIFY FAILED: native schema_migrations changed`; an extra ledger row outside `order` after apply → `STOPPED`, message `POST-RUN VERIFY FAILED: unexpected ledger row …`. A recorded future row inside `order` that this run neither applied nor recovered is NOT an error.
- New 8-digit rejection: order includes unrecorded `20270101_brand_new_thing.sql` → `BLOCKED` at preflight with `REJECT_NEW_LEGACY_NAME`, zero apply bodies.
- 14-digit acceptance: valid `20270101120000_new_thing.sql` pending applies (covered above); invalid `2027010112000_new_thing.sql` is not ordering-claimed (migration-order rejects it as orphan) and `20270230120000_new_thing.sql` fails preflight with `REJECT_FUTURE_NAME`.
- T15 runner native read-only: across all requests, every string containing `schema_migrations` is a SELECT (`SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`) and no request contains `INSERT INTO supabase_migrations.schema_migrations`, `UPDATE supabase_migrations.schema_migrations`, `DELETE FROM supabase_migrations.schema_migrations`, or DDL against it.
- Dry-run and preflight: `mode: 'dry-run'` with one pending → `DRY_RUN`, zero apply bodies, summary `LEDGER DRY RUN OK: 69 skipped, 1 pending`; `mode: 'preflight'` → zero apply bodies, summary `LEDGER PREFLIGHT OK: 69/69 baseline recorded, <n> pending`; preflight with incomplete baseline → `BLOCKED`.

**Steps**
- [ ] 1. Author `tests/migration-ledger-runner.test.ts` first (full list above).
- [ ] 2. **RED.** `npx jest tests/migration-ledger-runner.test.ts` → every test fails with `ERR_MODULE_NOT_FOUND` for `scripts/migration-ledger-runner.mjs`.
- [ ] 3. Create `scripts/migration-ledger-runner.mjs` exactly per the behavior contract.
- [ ] 4. **GREEN.** `npx jest tests/migration-ledger-runner.test.ts` → all pass.
- [ ] 5. **Regression.** `npx jest tests/migration-order.test.ts tests/migration-ledger-policy.test.ts tests/migration-transaction-safety.test.ts tests/migration-ledger-adoption.test.ts tests/migration-ledger-runner.test.ts` → all pass.
- [ ] 6. Commit: `git add scripts/migration-ledger-runner.mjs tests/migration-ledger-runner.test.ts && git commit -m "feat(migrations): add forward-only ledger runner with tests"`

**RED command:** step 2 → `ERR_MODULE_NOT_FOUND`, suite fails.
**GREEN command:** step 4 → runner suite passes.
**Regression command:** step 5 → all five suites pass.
**Exact commit message:** `feat(migrations): add forward-only ledger runner with tests`

## Task 4.4 — Thin apply wiring + workflow cutover (T14 apply contract)

**Files**
- Modify: `scripts/apply-migrations.mjs`
- Modify: `.github/workflows/apply-seo-factory-migrations.yml`
- Modify: `tests/migration-ledger-runner.test.ts` (add the apply workflow-contract group)

**Interfaces**
- CLI modes: `--preflight` (read-only gate), `--dry-run` (read-only classification), default apply. Apply requires `GITHUB_ACTIONS=true`; local runs are limited to `--preflight`/`--dry-run`. All modes require `SUPABASE_ACCESS_TOKEN` because the INV-13 role gate runs read-only in every mode.
- The old per-file continue-after-failure loop is deleted; ordering and all apply logic come from `migrationOrder()` and `runMigrationLedger()`.

**Concrete CLI code — `scripts/apply-migrations.mjs`**
```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { migrationOrder } from './migration-order.mjs'
import { createManagementSqlClient } from './supabase-management-sql.mjs'
import { runMigrationLedger } from './migration-ledger-runner.mjs'

const MODE = process.argv.includes('--preflight')
  ? 'preflight'
  : process.argv.includes('--dry-run')
    ? 'dry-run'
    : 'apply'
const REF = process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const GITHUB_SHA = process.env.GITHUB_SHA

if (MODE === 'apply' && process.env.GITHUB_ACTIONS !== 'true') {
  console.error('Refusing local apply: the production apply path requires the GitHub Actions workflow context. Use --preflight or --dry-run locally.')
  process.exit(1)
}
if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN.')
  process.exit(1)
}
if (MODE === 'apply' && !/^[0-9a-f]{40}$/.test(GITHUB_SHA ?? '')) {
  console.error('Missing or invalid GITHUB_SHA for apply mode.')
  process.exit(1)
}

const client = createManagementSqlClient({ projectRef: REF, accessToken: TOKEN })
const result = await runMigrationLedger({
  runSql: client.runSql,
  readFileFn: (path) => readFileSync(path),
  order: migrationOrder(),
  sourceGitSha: GITHUB_SHA ?? null,
  log: (line) => console.log(line),
  mode: MODE,
})
process.exit(result.ok ? 0 : 1)
```

**Exact workflow file `.github/workflows/apply-seo-factory-migrations.yml`**
```yaml
name: Apply SEO Factory Migrations

on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'
      - 'supabase/migration-baseline.json'
      - 'scripts/migration-order.mjs'
      - 'scripts/migration-ledger-policy.mjs'
      - 'scripts/migration-ledger-runner.mjs'
      - 'scripts/supabase-management-sql.mjs'
      - 'scripts/apply-migrations.mjs'
      - '.github/workflows/apply-seo-factory-migrations.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: seo-factory-migrations-${{ github.ref }}
  cancel-in-progress: false

jobs:
  migrate:
    name: Run Supabase SQL migrations
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Verify migration order covers every file
        run: node scripts/migration-order.mjs --check

      - name: Validate manifest, naming policy, and transaction safety
        run: node scripts/migration-ledger-policy.mjs --check

      - name: Preflight ledger gate (read-only)
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
        run: |
          set -euo pipefail
          if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
            echo "::error::Missing SUPABASE_ACCESS_TOKEN repository secret"
            exit 1
          fi
          node scripts/apply-migrations.mjs --preflight

      - name: Apply pending migrations (ledger-guarded)
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
        run: |
          set -euo pipefail
          node scripts/apply-migrations.mjs
```

**Steps**
- [ ] 1. Add the apply workflow-contract group to `tests/migration-ledger-runner.test.ts`: reads the YAML text and asserts `/scripts\/migration-order\.mjs/`, `/scripts\/migration-ledger-policy\.mjs --check/`, `/scripts\/apply-migrations\.mjs --preflight/`, `/scripts\/apply-migrations\.mjs/`, `supabase/migration-baseline.json` and `scripts/supabase-management-sql.mjs` in `paths:` (the SQL transport/retry/role-guard dependency of both `scripts/apply-migrations.mjs` and `scripts/migration-ledger-runner.mjs`), unchanged `group: seo-factory-migrations-${{ github.ref }}` and `cancel-in-progress: false`, `permissions:\n  contents: read`, no inline `.sql` file list (`expect(yaml.match(/supabase\/migrations\/[a-z0-9_]+\.sql/gi)).toBeNull()`), and no token echo.
- [ ] 2. **RED.** `npx jest tests/migration-ledger-runner.test.ts` → the contract group fails: the current workflow lacks the policy and preflight steps and the new `paths:` entry.
- [ ] 3. Rewrite `scripts/apply-migrations.mjs` and update `.github/workflows/apply-seo-factory-migrations.yml` exactly as specified.
- [ ] 4. **GREEN.** `npx jest tests/migration-ledger-runner.test.ts` → all pass.
- [ ] 5. CLI guard probes:
  - `node scripts/apply-migrations.mjs` (no env) → exits 1 with `Refusing local apply…` or `Missing SUPABASE_ACCESS_TOKEN.`
  - `GITHUB_ACTIONS=true SUPABASE_ACCESS_TOKEN=x node scripts/apply-migrations.mjs` (no GITHUB_SHA) → exits 1 with `Missing or invalid GITHUB_SHA for apply mode.`
  - `node scripts/apply-migrations.mjs --preflight` (no token) → exits 1 with `Missing SUPABASE_ACCESS_TOKEN.` (no network call attempted).
- [ ] 6. **Regression.** `npm test` full repository suite → green; `node scripts/migration-ledger-policy.mjs --check` → exit 0 with all three OK lines; `node scripts/migration-order.mjs --check` → exit 0.
- [ ] 7. Scope check: `git diff --name-only origin/main...HEAD` lists exactly: `scripts/migration-order.mjs`, `tests/migration-order.test.ts` (Task 4.2), `scripts/migration-ledger-runner.mjs`, `tests/migration-ledger-runner.test.ts` (Task 4.3), `scripts/apply-migrations.mjs`, `.github/workflows/apply-seo-factory-migrations.yml` (this task).
- [ ] 8. Commit: `git add scripts/apply-migrations.mjs .github/workflows/apply-seo-factory-migrations.yml tests/migration-ledger-runner.test.ts && git commit -m "feat(migrations): cut over apply workflow to forward-only ledger"`

**RED command:** step 2 → workflow-contract group fails.
**GREEN command:** step 4 → runner suite incl. contract group passes.
**Regression command:** step 6 → full `npm test`, policy `--check`, order `--check`.
**Exact commit message:** `feat(migrations): cut over apply workflow to forward-only ledger`

## Phase Gate 4 — single PR merge discipline

- [ ] Confirm exactly three committing Phase-4 implementation tasks are committed on `architecture/migration-ledger-phase-4` and nothing else: `git log --oneline origin/main..HEAD` → exactly three commits (ordering = Task 4.2, runner = Task 4.3, cutover = Task 4.4). Tasks 4.1 and 4.5 are read-only/operational and produce no commits.
- [ ] Mechanical checks: `git diff --check` → exit 0; `git status --porcelain` → clean.
- [ ] Push and open exactly ONE PR: `git push -u origin architecture/migration-ledger-phase-4` then `gh pr create --base main --head architecture/migration-ledger-phase-4 --title "feat(migrations): forward-only migration ledger cutover (Phase 4)" --body "First trigger-path change. Adoption is verified (Phase 3 evidence merged). Merge push must run the ledger-aware workflow as 69 skipped / 0 applied. Do not merge intermediate commits."`
- [ ] RED/GREEN: `gh pr list --head architecture/migration-ledger-phase-4` → empty before creation; after creation `gh pr view architecture/migration-ledger-phase-4 --json state` → `OPEN`.
- [ ] STOP: do not merge, do not self-approve, do not dispatch. Supervisor reviews and merges this single PR. Do not revert Phase 4 later (a revert push would run old replaying code); forward-fix with another Phase-4-path PR instead.

## Task 4.5 — Post-merge first-run verification (G4)

**Steps**
- [ ] 1. After the Phase-4 merge, find the workflow run triggered by the merge push:
  `gh run list --workflow=apply-seo-factory-migrations.yml --branch main --limit 1`
- [ ] 2. Watch it: `gh run watch <RUN_ID> --exit-status`.
- [ ] 3. **RED.** Pull the log and assert the marker is present and correct: `gh run view <RUN_ID> --log | grep "LEDGER APPLY OK"` → expected exactly `LEDGER APPLY OK: 0 applied, 69 skipped, source_git_sha=<merge SHA>, runtime_role_verified=true`. A missing marker, any `applied > 0`, or a red run is a failed cutover.
- [ ] 4. **GREEN.** The run is green with 69 skipped / 0 applied; `gh run view <RUN_ID> --log | grep "LEDGER PREFLIGHT OK"` shows `69/69 baseline recorded`; no `42P16` or HTTP 503 replay evidence appears in the log.
- [ ] 5. Record the run URL/ID and both summary lines in the supervisor scratch notes (no source change required for G4; report alongside the Phase-4 PR).
- [ ] 6. **STOP conditions.** Any deviation → STOP; declare an incident; no further trigger-path edits until supervisor review. Recovery is a forward-fix on a new Phase-4-path branch; never disable the workflow and never merge a revert of Phase 4.
- [ ] 7. Future runs (G5): the first real post-cutover migration must produce exactly one `ci-runner` ledger row with the correct hash and that push's `GITHUB_SHA`, observable SQL effects, and a green workflow. Any run with more than one new row, a hash mismatch, or a red status is an incident.

**Commit:** none (operational verification).

---

## Self-Review Record

Performed while drafting this plan against the locked instruction, and re-performed in the 2026-09-15 correction pass against the authoritative spec (all 10 supervisor corrections applied):

- **Spec coverage:** every locked phase item maps to a task — Phase 1 = Tasks 1.1 (hard precondition, stop-for-re-baselining, `SPEC_RECON_MAIN_SHA` diff baseline), 1.2 (manifest), 1.3 (policy module with locked exports minus the two added in 1.4), 1.4 (`ddlOnly`, `scanTransactionSafety`, T10); Phase 2 = Task 2.1 (management SQL client with injected `fetchImpl`/`sleepFn` and thrown-error normalization, adoption core with injection, single-attempt lost-response-safe baseline INSERT, locked interfaces) 2.2 (thin CLI, dispatch-only workflow with first-step main-ref/confirmation guard that fails red, pinned checkout, protected environment, `contents: read`, exact concurrency) and 2.3 (T13 scratch-DB immutability integration gate, hard-refusing production); Phase 3 = Tasks 3.1–3.4 (manual dispatch after Phase 2 merge, supervisor read-only verification with the exact 69/distinct/hash/`adoption-baseline`/`generatedFrom.gitSha`/native-identical/runtime-role checks, docs-only evidence PR, STOP/incident/rollback language); Phase 4 = Tasks 4.1–4.5 (ordering 8-or-14, runner core with injected `runSql`/`readFileFn`/`order`/`sourceGitSha`/`sleepFn`/`log`, all-recorded-row hash validation, `order`-exact post-run expected set, `effectiveApplied`/`skippedTotal` summary, thin apply wiring with `--preflight`/`--dry-run`/apply, workflow validation + preflight + apply + full runtime-dependency path trigger, 69 skipped / 0 applied first run).
- **Placeholder scan:** the scan for the four locked placeholder phrases returned no unresolved placeholders (the only textual hit was this record itself); every command, expectation, interface signature, rule ID, and commit message is explicit. `<AUDITED_MAIN_SHA>`, `<ADOPTION_MAIN_SHA>`, `<generatedFrom.gitSha>`, `<RUN_ID>`, and `<merge SHA>` are runtime-captured values defined by the preceding steps, not open design.
- **Interface/type consistency:** the policy exports match the locked list plus `requireExactEstate` and the `MANIFEST_ESTATE_CHANGED` rule ID; Phase-2 locked signatures (`createManagementSqlClient`, `verifyPostgresRuntimeRole`, `readNativeMigrationHistory`, `readLedgerRows`, `composeLedgerDdl`, `composeBaselineInsert`, `runAdoption`) match the plan, with `runAdoption` returning `recovered` and sending the baseline INSERT exactly once via `client.runSql`; Phase-4 injection list matches the runner signature including thrown-`runSql` normalization; rule IDs and summary formulas are used consistently across module, CLI, tests, and workflow.
- **Phase-trigger-path consistency:** Phases 1–2 touch only new files (verified by the Phase Gate scope proofs); Phase 4 is the only phase that edits `scripts/migration-order.mjs`, `scripts/apply-migrations.mjs`, or the apply workflow, all in one PR; the workflow remains enabled with no `[skip ci]` anywhere.
- **Exact file-scope check:** planned file list = `supabase/migration-baseline.json`; `scripts/migration-ledger-policy.mjs`; `scripts/supabase-management-sql.mjs`; `scripts/migration-ledger-adoption.mjs`; `scripts/adopt-migration-ledger.mjs`; `scripts/migration-ledger-immutability-check.mjs` (Phase 2, manual scratch gate only); `scripts/migration-ledger-runner.mjs`; `scripts/apply-migrations.mjs` (Phase 4); `tests/migration-ledger-policy.test.ts`; `tests/migration-transaction-safety.test.ts`; `tests/migration-ledger-adoption.test.ts`; `tests/migration-ledger-runner.test.ts`; `tests/migration-order.test.ts` (Phase 4); `.github/workflows/adopt-migration-ledger.yml`; `.github/workflows/apply-seo-factory-migrations.yml` (Phase 4); `docs/superpowers/seo-execution-ledger.md` (Phase 3 evidence only). Nothing else.
- **T15 allocation:** stated in the Frozen Baseline Reference and implemented in Task 2.1 (first substantive native read-only assertion beside SQL/adoption) and extended in Task 4.3 (runner); Phase 1 has none by design.
- **Mechanical checks at draft time:** `git diff --check` and `git status --porcelain` are re-run on the plan file before stopping; no commit, push, PR, deploy, workflow dispatch, or Supabase call is performed by the drafting task.

## Acceptance criteria for this plan

1. Exactly one new tracked file is produced by this drafting task: `docs/superpowers/plans/2026-09-15-forward-only-migration-ledger.md`; it is not committed.
2. No code, migration, workflow, test, package, or production change is made now; no commit/push/PR/dispatch/deploy/Supabase call occurs.
3. `git diff --check` exits 0; `git status --porcelain` shows only the new untracked plan (plus any pre-existing untracked spec/plan control-branch docs).
4. Execution of this plan stops for supervisor review before Phase 1 begins.
