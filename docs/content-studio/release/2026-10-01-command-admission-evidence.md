# Studio command admission engineering checkpoint

- **Checkpoint:** inactive engineering only; START attempt, no resume or replay
- **Branch:** `feat/studio-command-admission-20261001`
- **Engineering base HEAD:** `c305086c59d83f50135edd367f0d5e8399879619`
- **Production-main base:** `d67f6ca87c5eaafe1b67aa6bb5330fc6ba1c74e2`
- **Reviewed local helper integration parent:** `16c5d7b343185c5c84e631afaf7c782771df091e`
- **Approved plan:** `docs/superpowers/plans/2026-09-30-studio-command-admission.md`
- **Approved plan SHA-256:** `4070eee984ce5bcb365e3e5dae3b5c214a8574d1630283364da819b8a5eaf89e` (recomputed in this worktree)

The released normative pins and branch ancestry were not changed. This packet uses the integrated reviewed helpers only as mapped pure contracts; they do not authorize admission. The production route stays inactive and returns `503 RUNTIME_NOT_ACTIVE`. The production SQL resolver returns `AUTHORITY_BINDING_UNAVAILABLE` until the canonical A1 authority storage, resolver, and shared writer-lock implementation receive separate review.

## Implementation checkpoint

The packet adds canonical command decoding and the fixed six-field, length-prefixed UTF-8 SHA-256 request hash; a typed single-RPC `studio_core.admit_run` adapter; reauthorization-before-RPC orchestration; the inactive route boundary; five private run/admission relations; and a PG17 fixture harness that uses multiple independent `psql` processes. The test fixture replaces the production resolver only after it asserts that the production binding denies. Fixture authority rows and row locks are explicitly test-only.

The original v1 hosted workflow used `contents: read`, synthetic fixture credentials, no production secret/environment, and no push/dispatch by the writer. Its historical evidence and limitations remain unchanged. The correction workflow retains those boundaries, runs `npm ci --legacy-peer-deps` only on the hosted runner from the unchanged lockfile, and uploads a sanitized structured receipt with `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` on pass or failure. The service pins the official `postgres:17.11` multi-platform index digest `sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f`; the `linux/amd64` manifest is `sha256:e31e3d5327d1806f6177827c9710643e4f35f7ab3f14d26d05332753d3e95ee0`.

## Verification status

| Evidence | Result | Scope |
|---|---|---|
| `node scripts/migration-order.mjs --check` | **PASS** | 83 migrations accounted for; new 14-digit UTC path recognized |
| `node scripts/migration-ledger-policy.mjs --check` | **PASS** | Frozen baseline unchanged; naming and transaction-safety policy clean |
| `node --check scripts/test-studio-command-admission.mjs` | **PASS** | Harness JavaScript syntax only |
| `git diff --check` | **PASS** | No tracked changes existed; packet files are new and untracked |
| Packet whitespace/conflict-marker scan | **PASS** | New allowed paths scanned directly; no matches |
| Packet TypeScript project check | **NOT_RUN — BLOCKED_TEST_ENV** | No candidate `node_modules`; local install/symlink prohibited by this release |
| Focused strict TypeScript check | **NOT_RUN — BLOCKED_TEST_ENV** | Must run with the candidate dependency graph in hosted CI |
| Focused Jest tests | **NOT_RUN — BLOCKED_TEST_ENV** | No candidate dependencies installed |
| Isolated PostgreSQL 17 sessions | **NOT_RUN — BLOCKED_TEST_ENV** | No local `psql`, PostgreSQL server tools, Docker, or Podman; no hosted workflow was launched |
| Historical helper evidence | **53 focused tests + repository TypeScript: PASS on parent `16c5d7b3`** | Historical helper validation only; not this packet's tests or SQL proof |

No GitHub run ID/attempt, server version, or database receipt exists yet. The workflow is prepared for independent root review and launch against the exact candidate PR. Its eventual receipt must record both the PR head candidate SHA and checked-out SHA, workflow run/attempt, image pin, client/server versions, and separate Node/Jest/SQL outcomes. A prepared workflow or fixture is not evidence that those checks passed.

## Bounded review-correction checkpoint

This correction START packet addresses the independent review findings against the frozen v1 output. V1 remains completed and is not replayed. The following are source changes and local static checks only; this correction has not been run against a candidate dependency install or PostgreSQL server.

| Correction evidence | Result | Scope |
|---|---|---|
| `node --check scripts/test-studio-command-admission.mjs` | **PASS** | Harness JavaScript syntax only. |
| `node scripts/migration-order.mjs --check` | **PASS** | 83 migrations accounted for. |
| `node scripts/migration-ledger-policy.mjs --check` | **PASS** | Manifest, naming, and transaction-safety policy clean. |
| Direct whitespace/conflict-marker scan | **PASS** | All 12 permitted packet paths; no conflict markers or trailing whitespace. |
| Candidate `decodeRunCommand` / `hashRunCommand` invocation under Node 22.22.2 strip-types | **PASS — runtime-only** | Actual candidate export invocation on one Unicode/multi-digit-epoch input. This is not project typechecking and was not compared with PostgreSQL here. |
| Hosted TypeScript-export-to-SQL hash goldens | **NOT_RUN** | Harness will compare actual candidate exports with actual SQL outputs for ASCII, Unicode, multi-digit epochs, and byte boundaries in hosted PostgreSQL. |
| PostgreSQL fixture, concurrency, transaction termination, reconnect, and privilege operations | **NOT_RUN** | Hosted PostgreSQL 17 only; the harness records actual checks and failures in its sanitized receipt. |
| Candidate root TypeScript project check | **NOT_RUN** | Requires hosted `npm ci --legacy-peer-deps`. |
| Focused strict TypeScript project check | **NOT_RUN** | Separate hosted candidate-project configuration. |
| Focused Jest | **NOT_RUN** | Uses the checked-in Jest config and candidate dependency graph. |
| Hosted workflow / exact-head receipt | **NOT_RUN** | No workflow was launched by this correction worker. |

Source corrections include fixture-before-extension validation; bounded synchronous/asynchronous psql children and owned-session cleanup; explicit same-key advisory-lock and revocation row-lock wait evidence; backend termination before COMMIT with five-relation reconnect counts; independent durable COMMIT observation followed by response suppression and reconnect; actual per-role table-operation and function-execution denials requiring SQLSTATE `42501`; independent project, issuer, and subject scope checks; and candidate TypeScript-export hash comparisons against SQL. The advisory key concatenation now parenthesizes `(p_command->>'idempotencyKey')`. These are implementation claims only until their designated checks run. The receipt reports check statuses and failures actually witnessed; it does not assign PASS to unrun checks.

The correction workflow separately records candidate and checked-out SHA, run/attempt, pinned image identity, client/server versions, and each TypeScript/Jest/PostgreSQL outcome. Its inert artifact contains sanitized test evidence only; it has no production credentials, database URL, or environment dump. An early bootstrap or validation failure still produces an explicit failure or NOT_RUN outcome in the receipt.

## Limits and activation dependencies

The isolated fixture is designed to exercise scoped concurrent dedupe, five-relation rollback, reconnect replay after suppressing a committed receipt, precommit rollback, stale authority, revocation serialization, current-status replay, cross-language Unicode hashes, privilege checks, raw service DML denial, service RPC success, and hostile `search_path`. None of these PG outcomes is claimed as passed in this checkpoint.

This packet does not implement production authority resolution, policy/owner/epoch writers or their common lock protocol; does not enable Supabase/PostgREST exposure; and does not add a dispatcher, worker, cancellation, artifacts, publication, merge, deployment, cutover, or complete A1/A2/Studio architecture. P12/P13 and production activation remain downstream work. No migration was applied, and no commit, push, workflow dispatch, external service call, or production mutation was made.

## Independent-review source correction v4

This is a distinct correction to the completed v2 broker attempt (`c0d5725d-59ca-40b6-a75b-9d7f05c381ed`, generation 2), not a replay. The frozen twelve-file v2 output was independently reviewed as **MUST_FIX** in `/tmp/cs-runtime-v2-exact-independent-review-20261002.json`. The intervening v3 executor attempt was **BLOCKED / verification_failed** after repeating supervisor admission checks before source inspection; its preserved diagnosis and request identity are `/tmp/cs-command-admission-independent-review-correction-20261002-v3.failure-diagnosis.json` and SHA-256 `916d50c1ad667ae6d6699619e5d09f32a31358456bf6302bf9a506500c7a962a`. V4 is the separately routed source correction; it preserves the v2/v3 receipts and frozen plan and does not edit source pins, plan files, or helper ancestry.

| V4 evidence | Result | Scope |
|---|---|---|
| Node 22.22.2 syntax and local `--self-test` | **PASS** | Actual harness SQLSTATE parser and numeric barrier predicate; reproduces the former count-comparison red case, then checks numeric 1 accepted, 0 rejected, malformed rejected; accepts verbose psql 42501 formats and rejects syntax/malformed/success cases. |
| Candidate exported TypeScript hash under Node strip-types | **PASS — runtime-only** | `decodeRunCommand` and `hashRunCommand` directly invoked for a Unicode, multi-digit epoch command. This is not project TypeScript validation or PostgreSQL parity proof. |
| Migration order, migration ledger policy, and direct twelve-file whitespace/conflict scan | **PASS** | 83 migration paths accounted for; frozen ledger policy clean; all twelve allowed paths scanned. |
| Exact-head workflow correction | **SOURCE ONLY** | Checkout ref is explicitly the approved PR head SHA (or `github.sha` for manual runs); checked-out SHA equality is asserted and bound in the always-uploaded receipt. All hosted outcomes remain **NOT_RUN** here. |
| Candidate whole-repository TypeScript, focused strict TypeScript, Jest, and PostgreSQL 17 | **NOT_RUN** | Requires the official isolated draft-PR workflow and review of its sanitized exact-head receipt. |

V4 corrects the observed same-key lock chain without changing authority-before-admission-key lock order: the actual proof must show one owned session waiting on the held scoped advisory barrier and the second owned session blocked by the first session's authority-row transaction. It releases only the owned barrier and then requires one accepted plus one replayed receipt, the same run ID, and one increment in each of the five relations. The lost-response case observes the committed run ID and all five counts independently before terminating the exact sleeping owned backend; it verifies that no RPC receipt was emitted, then replays that same run ID without changing those counts. Bounded database observations and child cleanup remain in the harness.

Other v4 source corrections include typed numeric barrier parsing with local red/green self-tests; bounded verbose-psql SQLSTATE parsing that requires nonzero exit plus exact `42501`; actual candidate TypeScript hashing before the hostile `SET ROLE service_role` call; explicit denial probes for service-role private hash/resolver helper execution; and strict validation of the frozen thirteen-field authority result. `decisionId` remains validated in trusted server context and persisted to immutable admission audit storage; it is not a resolver field. Fixture tests cover exact-shape admit/replay and fail closed for missing or unauthorized result fields and stale/revoked authority. The production resolver remains deny-only.

The SQL decoder now rejects the specified malformed numeric cases and uses explicit ECMAScript trim whitespace and Unicode Cc code-point checks while retaining the six canonical UTF-8 frames and version prefix. Node-side cases include whitespace, control characters, and lone surrogates; SQL hosted execution is still required to establish PostgreSQL behavior and cross-language parity. Any discrepancy remains a must-fix; it cannot be resolved by weakening the decoder or changing the canonical raw UTF-8 bytes.

### Production SQL application is held

The candidate migration remains a release hold. The existing `.github/workflows/apply-seo-factory-migrations.yml` path runs on `push` to `main`, discovers `supabase/migrations/**`, and applies pending SQL through `scripts/migration-ledger-runner.mjs` with repository secrets. Therefore, a draft-PR test pass does not authorize merging this migration: merging its current path to `main` can trigger production SQL application independently of the inactive 503 route. Root must separately review exact production migration release evidence and an approved durable hold design before any merge that could expose this path. V4 does not relocate the migration, change the official workflow/runner/baseline, evade the ledger, or claim production release readiness.

**V4 checkpoint status:** source correction only; no SQL applied, no production resolver or route activation, no dispatcher, and no new live-admission claim. No commit, push, merge, or workflow launch was performed. Hosted PostgreSQL 17 multiconnection/hash/ACL/crash/rollback proof and exact-head TypeScript/Jest lanes remain **NOT_RUN**. The production automatic-application release hold remains unresolved, and P12/P13 remain deferred.

The bounded machine-readable v4 source checkpoint is `/tmp/cs-command-admission-independent-review-correction-20261002-v4.source-checkpoint.json`. It contains the local red/green parser and barrier assertions, local verification outcomes, NOT_RUN lanes, and the exact SHA-256 inventory for all twelve authorized paths. The v2 frozen source manifest remains `06b9e3e301a536ccd85e9b16d9a77bc327f424380daaa48586ac56b50a864664`; six of its twelve files changed in this correction. Its inventory is authoritative for this document's self-hash.

| Authorized source path | Bytes | SHA-256 |
|---|---:|---|
| `.github/workflows/studio-command-admission-test.yml` | 12970 | `43b97f51140cfdbaa3404412c042dcb294e708692b01b31358e92d45b6ab9e80` |
| `app/api/content-studio/v3/runs/route.ts` | 311 | `e80b759e9f91c6c73d940012b4e5e680c5f759ff4fb964da12b55a0758848823` |
| `app/api/content-studio/v3/runs/routeCore.ts` | 2179 | `ba3187980bf16fb7ed8fad5df3bf44a40c29022ef269125c553b6ffb9a8b8efd` |
| `lib/studioRuntime/commandAdmission.ts` | 1926 | `b4f3565a9106253f77f228ea336c3d8b8ad895d3c064cb735e3e0620404cb7f2` |
| `lib/studioRuntime/contracts.ts` | 7697 | `fe6ed43c9b9620abfd25eb953a319f052e3da6fa2db137aed0589148860ac04a` |
| `lib/studioRuntime/repository.ts` | 1252 | `40df8704e7eebe73897e1bd9a5c344063f8748e5bc2f56b052763200f97ae6bb` |
| `scripts/test-studio-command-admission.mjs` | 42205 | `3d8b8222c90743c347403a9fe4b1e1a875b674ff62cdae4c721a22a95bf6fb91` |
| `supabase/migrations/20261001000000_studio_command_admission.sql` | 20630 | `52b8452f617b4681252266967430039c51b4cd2a5e3536fa576e8004861040e3` |
| `tests/content-studio-v3/commandAdmission.test.ts` | 5887 | `1aaa33daabc2351f326cb0b0bf9fd89ebe453e7daaf86f87360750a15089574c` |
| `tests/content-studio-v3/runAdmissionRoute.test.ts` | 3900 | `22094410f306f301bf1dfd5aee57ee7ab69835568f7bcd9c5e915d9db7a820b4` |
| `tests/sql/studio-command-admission.sql` | 17325 | `0e16747b01d83d8de94f8a751d892715b211c7306c402cd4bad72c1f305186ce` |


## Independent-review source correction v5

This is a distinct correction to completed v4, not a replay. The executor received the bounded two-file source authorization after supervisor-controlled admission. The frozen v4 packet is `/tmp/cs-command-admission-independent-review-correction-20261002-v4.frozen.json` (aggregate `8cbeed24eebb13a511fa2607fe19e82ee55971917f5dba450773bdabf3232f8a`); its approved plan SHA-256 remains `4070eee984ce5bcb365e3e5dae3b5c214a8574d1630283364da819b8a5eaf89e`. The independent v4 full-source review finding V4-1 required immediate observation of owned `asyncPsql` rejections and draining those outcomes with child closures.

| V5 evidence | Result | Scope |
|---|---|---|
| Node 22.22.2 harness syntax | **PASS** | `node --check scripts/test-studio-command-admission.mjs`. |
| Dependency-free Node 22 self-test | **PASS** | Actual operation observer, owned child tracker, barrier wait helper, bounded owned cleanup, and sanitized receipt helpers. A real Node child exits 17; the original rejection survives a later await, an owned cleanup child is terminated, and no unhandled rejection occurs. No database call is made. |
| Failed-child/barrier receipt evidence | **PASS — local helper evidence** | `/tmp/cs-command-admission-independent-review-correction-20261002-v5.failure-path-evidence.json`; failure and cleanup outcomes are recorded separately. |
| Twelve-path frozen inventory | **PASS** | `/tmp/cs-command-admission-independent-review-correction-20261002-v5.frozen.json` records current byte counts and SHA-256 values for all twelve paths. The ten paths outside this correction match the v4 frozen pins byte-for-byte. |
| PostgreSQL, whole-project TypeScript, focused TypeScript, Jest, hosted workflow, and exact-head hosted receipt | **NOT_RUN** | This bounded correction ran only the requested local Node checks and scoped source inventory. |

Every returned `asyncPsql` promise now receives a rejection observer synchronously before it is returned. The observer records a fulfilled/rejected outcome and resolves only its own tracking promise; callers still receive the original promise, so a later `await` throws the original failure. The `finally` path terminates only owned children, applies bounded SIGTERM/SIGKILL cleanup, and drains both owned child closures and observed operation outcomes before writing the sanitized receipt. SQL startup/lock-timeout errors, barrier failures, and child termination therefore reach the captured FAIL path without an earlier unhandled rejection.

**V5 checkpoint status:** source correction only. The production resolver remains deny-only and the route remains `503 RUNTIME_NOT_ACTIVE`. The automatic production migration application hold remains unresolved. No real PostgreSQL call, production migration, full architecture live claim, or hosted check is claimed. PostgreSQL, full TSC, focused TSC, Jest, and hosted workflow outcomes remain **NOT_RUN**.
