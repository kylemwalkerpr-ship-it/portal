# GLM 5.3 — pipeline close FINISH only (TPM killed the last run)

Core code is already in the tree. Do NOT re-read whole files. Do NOT touch marketplace.

Repo: yousafe-portal. No commit/push. Chunk reads ≤80 lines.

Already done: `metaDescriptionLength` + clamp loop; `ensureTldrBullets`; FAQ Path D; `closeShipGate` after callAiFix; `runbios-glm-53` slot; DEFAULT_BRIEF/REVIEW pins; catalog glm-5.3 lanes.

## Remaining

1. `tests/pipeline-four-stage-close.test.ts` — fixture: paragraph TL;DR, 161-char meta, FAQ ### without JSON-LD, 5 fake `/us/fake-*` links. After `applyDeterministicRepairs`, quality has zero of: tldr_format_invalid, ahrefs_meta_too_long, unverified_internal_link; FAQPage present.
2. If catalog tests fail, fix `tests/content-ai-catalog.test.ts` expectations for `runbios-glm-53` / DEFAULT_BRIEF_PIN.
3. Confirm `closeShipGate` is defined and used after every `callAiFix` in `reaudit/route.ts` (grep, don't rewrite the file unless missing).
4. `npx tsc --noEmit`
5. `npx jest tests/pipeline-four-stage-close.test.ts tests/ahrefs-issues.test.ts tests/content-ai-catalog.test.ts --no-coverage`

Stop. Report FILES / TESTS / RESULTS.
