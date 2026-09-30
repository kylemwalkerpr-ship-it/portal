# Mounted Modal Volume proof

Status: partial success. A mounted remote writer wrote, closed and committed the dummy artifact; a separate mounted reader reloaded and returned matching data size/hash; mounted cleanup removed the own artifact and committed. The final fourth mounted absence check was interrupted by the supervisor's 120-second deadline. The CLI exited 1 and the original emitted receipt remains proof_passed=false. A separate authenticated CLI listing subsequently confirmed the Volume root empty. This does not convert the interrupted fourth function into a passing whole-app receipt.

## Exact target and source

- Environment: `content-studio-staging`; existing Volume `content-studio-artifacts`, object ID `vo-60ER3JIn6BfxIMHhYlUmpa`, requested VolumeFS v1. The version is configured in source; no independent server version introspection was returned.
- Supervisor probe: `cs-modal-mounted-volume-supervisor-probe-20260930-v3`; ephemeral app `ap-FaTVtACXLKTlsqK4HpKsyY`.
- Exact script SHA-256: `7a663337ba005b5ea8bf3eb4dcfabcba570c86f401a9045dca77ab493697299f`; logic SHA-256: `f5aaa56b0fddb1eef961d9caa861de608d1f25ae92e49f5b2829b7ec9de45fdf`.
- Command: `modal run --env content-studio-staging scripts/content-studio/modal_storage_proof.py`.
- UUID: `8efda853-9fcb-4853-87e1-8fa7d84b913a`; own path: `proofs/modal-storage-proof/8efda853-9fcb-4853-87e1-8fa7d84b913a.bin`.
- Payload: 46 dummy bytes, below 1 KiB. Expected, writer and reader SHA-256 all `0f32893e3367ec89311d9358b7e520cf9ee73fbb3c72feab2d35d515a60719e4`; reader size 46 bytes.
- Cleanup returned `removed=true`, with recorded writer-created parent directories `/mnt/artifacts/proofs` and `/mnt/artifacts/proofs/modal-storage-proof`. Nonrecursive rmdir only removes those if empty. Subsequent CLI root listing `[]` confirms file and both directories absent.

## Bounds and observed termination

All four functions use CPU request/soft limit `(0.25,0.25)`, memory request/hard limit `(128,256)` MiB, GPU none, min containers 0, max containers 1, buffer 0, scale-down 2 seconds, startup/execution timeouts 60 seconds, retries 0. The existing environment is configured for max containers 1, GPUs 0. The minimal image explicitly packages only the helper module. No persistent deployment or endpoint was created.

The supervisor stopped only its uniquely identified ephemeral app after the 120-second wall deadline; stop exited 0. Total probe wall time was 124.526627 seconds and CLI exit was 1. The final `verify_absent.remote` returned RemoteError after the stop. Post-probe app listing showed all three owned probe apps stopped with zero tasks, and Volume root listing was empty. No automatic rerun occurred.

Planned spend ceiling: $0.25. Published CPU rate is $0.0000131/core-second and memory $0.00000222/GiB-second ([pricing](https://modal.com/pricing)). At the configured maxima, 480 modeled function container-seconds cost approximately $0.0018384 base, $0.0032172 at a 1.75x region multiplier. This is an estimate for function resource use, not an account-level enforced budget or observed invoice; image initialization, platform retries and infrastructure timing are not established by that arithmetic. Actual billed spend was not returned. Existing credit was user-confirmed and no balance query occurred.

## Verification and prior attempts

Independent local verification: 12 fixtures passed, syntax passed, diff check passed. These exercise actual successful/failing orchestration, evidence preservation, own-path cleanup, resource bounds and explicit helper packaging/staged imports. Local mock packaging checks were not themselves live container-import proof; v3 did execute the packaged remote writer/reader/cleanup.

Prior canonical execution failed to connect from the executor sandbox. Supervisor v1 initialized app then rejected unsupported scale-down 1; local revisions corrected scale-down, return-record behavior, failure evidence and explicit CPU/memory limits. Supervisor v2 failed remote helper packaging, was stopped, and left an observed empty Volume. The packaging revision completed through canonical Luna (`cs-modal-proof-helper-packaging-revision-20260930-v1`, native thread `01a0f188-ace3-7c62-a079-24868261e15a`). Historical receipts and logs are retained; no earlier failure is rewritten as success.

Evidence: [receipt.json](receipt.json), [supervisor-receipt-v3.json](supervisor-receipt-v3.json), [supervisor-probe-v3.json](supervisor-probe-v3.json), [supervisor-runtime-v3.stdout](supervisor-runtime-v3.stdout). Prior evidence: [history-report-pre-v3.md](history-report-pre-v3.md), [canonical-receipt-v1.json](canonical-receipt-v1.json), [supervisor-receipt-v2.json](supervisor-receipt-v2.json).

## Limits

This slice provides positive evidence for sequential mounted commit/reload/hash readback and scoped deletion plus independent CLI absence. The whole-app invocation did not pass its final mounted absence check. No crash recovery, concurrent writer semantics, gateway authorization or backup guarantees were tested. Full A0.7 remains open. No environment/Volume creation or deletion, secrets/credential readback, balance checks, Cloudflare, Supabase, production DB changes, P12/P13, push or merge occurred.

Exact UUID-path CLI lookup exited 1 with `No such file or directory`, alongside root listing exit0 `[]` and all owned apps stopped/tasks0. Evidence: [post-probe-v3-reconciliation.json](post-probe-v3-reconciliation.json). The untouched emitted receipt is also extracted in [original-mounted-receipt-v3.json](original-mounted-receipt-v3.json); its proof_passed=false is preserved.
