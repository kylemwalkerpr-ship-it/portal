# Mounted Modal Volume proof

Status: blocked after two supervisor probes; mounted commit/readback proof remains unestablished; the mounted persistence proof was not established. The earlier canonical invocation failed to connect to Modal before its proof entrypoint. A later supervisor probe initialized an ephemeral app, then failed local SDK validation before any proof receipt was emitted.

## Scope and controls

- Target: existing `content-studio-staging` environment and existing `content-studio-artifacts` VolumeFS v1 Volume. The app uses `Volume.from_name(..., create_if_missing=False, environment_name="content-studio-staging", version=1)`.
- No environment or Volume creation/deletion, deployment, endpoint, GPU, Cloudflare, Supabase, production DB, credential readback, P12/P13, push, or merge.
- The proof creates one UUID-named file under `proofs/modal-storage-proof/`, closes it, commits it, reads it from a separate remote function after `reload()`, then removes only that exact path and commits. A separate refreshed listing checks that its basename is absent.
- Each function requests and limits CPU to 0.25 cores (`cpu=(0.25, 0.25)`), requests 128 MiB and caps memory at 256 MiB (`memory=(128, 256)`), with `gpu=None`, min containers 0, max containers 1, buffer containers 0, a two-second scale-down window, 60-second startup and execution timeouts, and zero retries. Modal bills the greater of request and usage; limits cap resource use. No account-level spend budget is configured or claimed.

## Bounded spend estimate

Using the listed CPU and memory rates and highest listed 1.75× region multiplier, a conservative function-resource estimate charges all four sequential functions at 60 seconds startup plus 60 seconds execution, with CPU at 0.25 cores and memory at the full 256 MiB hard limit: 480 seconds × (0.25 × $0.0000131 + 0.25 GiB × $0.00000222) × 1.75 = about $0.00322. This function-resource estimate is below $0.25 under the configured resource and time controls. It is not an account-level hard cap or an observed invoice. Image-build charges and platform overhead are not independently bounded by this estimate. No balance or credential check was performed. Volume storage is listed at $0.09/GiB-month with the first 1 TiB included; the proof artifact is under 1 KiB and intended to be deleted.

Pricing source: [Modal pricing](https://modal.com/pricing). Runtime controls: [Modal Functions](https://modal.com/docs/guide/functions). Environment selection: [Modal Environments](https://modal.com/docs/guide/environments). Commit/reload semantics: [Modal Volumes](https://modal.com/docs/guide/volumes) and [Volume SDK](https://modal.com/docs/sdk/py/latest/Volume). Ephemeral app behavior: [App SDK](https://modal.com/docs/sdk/py/latest/App).

## Local verification

`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts.content-studio.tests.test_modal_storage_proof -v`: 10 tests passed without importing Modal. Fixtures invoke production `run_proof` for a filesystem-backed happy path and callback order, plus reader, cleanup, hash mismatch, and writer failures; failures retain truthful partial evidence without proof success. AST checks validate all function resource/time settings.

Syntax compilation of the proof source, pure logic module, and tests using Python's built-in `compile()`: passed. `git diff --check`: passed. No Modal/cloud command was run during this repair. The supervisor evidence remains historical evidence for the previous source.

Repaired source SHA-256: `a05d03b73534569c1ed888667f1626eed52784b90457d1b2618fe676135bc1ee`. Pure logic module SHA-256: `da5b84cf5fd73c2b09f9f69e796af0dd8f543c530f23b3e8d816aa9cc9fcf219`.

## Cloud run evidence

The canonical invocation `cs-modal-mounted-volume-proof-20260930-v1`, terminal `BLOCKED verification_failed`, native thread `01a0f15e-6051-77a3-b911-c13526c1e703`, returned before entering the proof entrypoint. Its captured stdout contains `Could not connect to the Modal server.` This is a sandbox connection failure.

The separate supervisor probe `cs-modal-mounted-volume-supervisor-probe-20260930-v1` ran script SHA-256 `78f0a7adb80428f04c83efb0be699f0ed6fd28321ab8ea968b8611cd97a5ece6`; its stdout reports that app `ap-wWX6Saii4NQGj86njKbLG0` initialized, then SDK validation failed because `scaledown_window` must be between 2 and 3600 inclusive. That is an app-initialization/SDK-validation failure, distinct from the canonical sandbox connection failure. No `PROOF_RECEIPT` or proof UUID was emitted. The app initialization is an observed server effect; absence of a receipt does not establish absence of other server effects. Read-only post-probe listed stopped tasks 0 and Volume root `[]`; this is not a live proof. Historical IDs: canonical blocked `cs-modal-mounted-volume-proof-20260930-v1`, thread `01a0f15e-6051-77a3-b911-c13526c1e703`; completed repair `cs-modal-mounted-volume-proof-repair-20260930-v1`, thread `01a0f168-a2f9-7123-bbf5-41d8f6dd94f9`. Status remains blocked pending an independent supervisor probe against the exact revised source.

- Command: `modal run --env content-studio-staging scripts/content-studio/modal_storage_proof.py`
- Exit code: 1
- Runtime: 60 seconds wall-clock
- Canonical invocation app ID: unavailable; CLI did not connect
- Supervisor probe app ID: `ap-wWX6Saii4NQGj86njKbLG0` (observed initialized)
- Environment / Volume object ID / version: target specified locally; remote identity unavailable
- Proof UUID / path / byte count / expected SHA-256: not generated
- Separate reader SHA-256: not run
- Cleanup and refreshed absence check: not applicable; no artifact path was created
- Observed spend: unavailable from CLI; no remote function started. Planned spend ceiling was $0.25.

Canonical structured run receipt: [receipt.json](receipt.json). Canonical captured stdout: [runtime.stdout](runtime.stdout). Supervisor probe evidence: [supervisor-probe.json](supervisor-probe.json) and [supervisor-runtime.stdout](supervisor-runtime.stdout).

## Limits

The mounted write/read/hash/cleanup proof remains unestablished. The code is repaired locally, but no cloud invocation was made as part of this task. No crash recovery, gateway behavior, backup, or concurrent writer proof exists; Full A0.7 remains open.

## Revised source identity

Proof script SHA-256: `f3be90d227a0945fddbd0ca3c1fb913282d726286b77d9ebda5faaeed0be9706`. Pure logic SHA-256: `f5aaa56b0fddb1eef961d9caa861de608d1f25ae92e49f5b2829b7ec9de45fdf`. Fixture SHA-256: `d3d33334634d2e30c8a03290a7c9a4433ebfc9bb3d3783a6fd23a98844eee692`.


## Second supervisor probe: remote packaging blocker

Supervisor probe `cs-modal-mounted-volume-supervisor-probe-20260930-v2` ran exact script SHA-256 `f3be90d227a0945fddbd0ca3c1fb913282d726286b77d9ebda5faaeed0be9706` and logic SHA-256 `f5aaa56b0fddb1eef961d9caa861de608d1f25ae92e49f5b2829b7ec9de45fdf`, after ten independent local fixtures, syntax checks, and fresh prior-app/Volume reconciliation passed. Canonical orchestration revision completed with native thread `01a0f177-9f9f-7390-aeaa-845efeca4e0c`.

The CLI initialized ephemeral app `ap-xCeWJTEqIigwuScWGCxmXr`, but remote container hydration failed because `modal_storage_proof_logic` was not packaged. Modal 1.0 includes the defining module by default; external helper modules require explicit `Image.add_local_python_source` ([official project structure docs](https://modal.com/docs/guide/project-structure)). Local fixtures did not cover that packaging boundary. Repeated platform hydration attempts occurred despite user-function retries=0. To bound time and spend, the supervisor stopped only this ephemeral app; the stop command exited 0. The run exited 1 after 173.178665 seconds.

Its emitted receipt identifies existing Volume `vo-60ER3JIn6BfxIMHhYlUmpa`, requested VolumeFS v1, and UUID `eb0b8f60-d57f-4a39-8ac8-a65f1ae66750` at `proofs/modal-storage-proof/eb0b8f60-d57f-4a39-8ac8-a65f1ae66750.bin`. Expected data was 46 bytes with SHA-256 `0f32893e3367ec89311d9358b7e520cf9ee73fbb3c72feab2d35d515a60719e4`. No successful write or reader hash was emitted. The receipt has proof_passed=false and cleanup_status=failed because cleanup targeted an already stopped function. Subsequent authenticated read-only CLI reconciliation showed both probe apps stopped with zero tasks and the existing Volume root listing empty, so no leftover proof file or directories were observed. This does not turn the failed cleanup call into a mounted cleanup proof.

Evidence: [supervisor-receipt-v2.json](supervisor-receipt-v2.json), [supervisor-probe-v2.json](supervisor-probe-v2.json), [supervisor-runtime-v2.stdout](supervisor-runtime-v2.stdout). No balance checks, persistent deployment, new Volume/environment, or automatic rerun occurred. Actual billed spend was not returned; resource estimates are not an account budget enforcement guarantee. Full A0.7 remains open.
