# Content Studio DeepSeek Provider Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Content Studio run on exactly two explicitly commissioned providers — Grok 4.6 via the existing xAI transport and first-party DeepSeek V4.1 Flash via `api.deepseek.com` — with full stage parity, one canonical registry/provider interface, explicit per-job ownership, no silent fallback, non-executable legacy pins, and persisted requested/actual provider/model + attempt/stage/hash/failure/lineage evidence, while preserving every PR #200 fail-closed guarantee.

**Architecture:** Introduce `lib/contentAiRegistry.ts` as the single provider identity/interface source; rewrite `lib/contentAiCatalog.ts`, provider selection in `lib/contentAiProviderCore.ts`, brief/engine/review/route pins, vault surfaces, and UI to consume it; add a first-party DeepSeek transport with a literal-host assertion; add one additive, unapplied migration for `actual_provider`/`provider_error_class`; enforce legacy pins as typed selection-required failures everywhere.

**Tech Stack:** Next.js 16 App Router, TypeScript 6, Jest 30, Supabase JS 2, existing GitHub Actions release workflow, existing xAI transport.

**Spec:** `docs/superpowers/specs/2026-09-15-content-studio-deepseek-provider-parity-design.md`

**Revision:** 4 — PR #204 supervisor review corrections incorporated: P2 is Tasks 3–7 (one atomic flip covering adapter/registration, fail-closed routes, catalog/UI, vault/settings/test/health routes + vault UI, and deployment/runtime declarations); retired transports are non-registrable/unreachable after P2 independent of the P3 cleanup; Grok transport semantics are explicit (retained xAI transport, not an additional provider, no Grok↔DeepSeek cross-fallback, DeepSeek `api.deepseek.com` only); the first-party DeepSeek hard-pin and model/pin distinction are unchanged.

**Baseline:** worktree `/Users/phantomdarne/Documents/GitHub/yousafe-portal-worktrees/content-studio-deepseek-parity`, branch `architecture/content-studio-deepseek-parity-20260915`, HEAD `ca23e3d76dfc9fc0516a8021e5c21729c845de00`.

## Global Constraints

- Work only from the exact worktree/branch above; implementation branches start from then-current `main` after this plan merges.
- GPT-5.6 Sol alone approves scope, readiness, commits, pushes, PR, merge, DB application, and production verification. The executor never self-approves.
- No `wrangler`/OpenNext/direct Cloudflare deploy, no dashboard publish, no DB migration application, no production writes, no secret changes.
- Never send DeepSeek through Entrim, Novita, OpenRouter, Requesty, Token Harbor, Vercel, NVIDIA, Baseten, Parasail, Run BiOS, or any intermediary. First-party `api.deepseek.com` only. The retained existing xAI Grok transport (including its existing Grok subscription CLI-proxy fallback, `cli-chat-proxy.grok.com/v1`) is authorized to remain; it is not an additional AI provider, is not an intermediary in the DeepSeek prohibition, stays within Grok/xAI credential behavior, cannot select or route to another model/provider, and never carries DeepSeek traffic.
- No silent fallback between Grok and DeepSeek in either direction; no cross-transport crossover (a Grok job never calls `api.deepseek.com`; a DeepSeek job never calls `api.x.ai` or the Grok proxy); no hidden default for legacy pins; ownership is explicit and stable per job.
- After P2, no retired provider transport can be registered or route-reachable even if dead-code cleanup is deferred; the boundary test and runtime registration proof must cover this (Tasks 1, 3, 8).
- Legacy provider values remain auditable and non-executable; they require selection.
- Identifier discipline (design §13 decision 1): display label **DeepSeek V4.1 Flash**; stable internal pin **`deepseek-v41-flash`**; upstream API request model id **`deepseek-flash`** (confirmed by successful direct `GET /v1/models`, chat completion, and tool-call completion against `api.deepseek.com`). Pins are internal identity only; requests send `deepseek-flash`.
- Design §13 supervisor decisions are final; do not re-ask, re-gate, or request reconfirmation. This includes the PR #204 review corrections recorded there (§13.8–13.11).
- Phase sequencing (design §8, PR #204 review): P1 (Task 2) is strictly internal/dark — registry types, unit tests, and inert wiring only; it must not alter any production selector, picker/catalog rows, persisted pins, route behavior, or executable provider registration. P2 (Tasks 3–7) is one atomic commission flip — adapter + provider registration + fail-closed selector/route boundaries + catalog/UI release + vault/settings/test/health routes and vault UI + deployment/runtime declarations (`deploy.yml`, `env.d.ts`, `wrangler.toml`, `scripts/sync-ai-vault.mjs`, `content-studio-review.yml`) + persistence — merged only after focused P2 tests are green; no subset may expose a DeepSeek selection before its executor is registered, leave legacy selectors/UI/probes executable, or leave any retired provider configuration injected/effective. P3 (Task 8) is cleanup only: dead-code deletion and docs must never be a safety dependency; non-registrability and route-unreachability are enforced at P2.
- Preserve PR #200 semantics: execution leases/fencing (`supabase/migrations/20260915_content_studio_execution_lease.sql`, `persistContentJob.ts:strictFence`, `streamContentJobFence.ts`), RLS/grants/immutability (`20260914_content_studio_evidence_contract.sql:69-102`), renderer boundary (`renderTarget.ts`), publication proof (`publicationProof.ts`, `publicationMonitor.ts`, `liveVerify.ts`).
- DB changes are migration-based, least privilege, reversible, and unapplied by the executor.
- No secrets or prompt contents in logs, tests, audit rows, or commits. Never print key values.
- No placeholders: every task below names exact files, symbols, commands, and stop conditions.

---

### Task 0: Supervisor decisions and probe evidence (COMPLETE — read-only)

**Files:**
- No repository files. Evidence recorded in the task report only.

**Interfaces:**
- Consumes: nothing further; design §13 decisions are final (set 2026-09-15).
- Produces: confirmed upstream model literal `deepseek-flash` for pin `deepseek-v41-flash`, lane-default policy, engine-pair policy, base-URL policy, secret-retirement prerequisite, migration-unapplied rule.

- [x] GPT-5.6 Sol decisions 1–7 (design §13) confirmed and final; no re-confirmation is requested or required by this program.
- [x] Read-only first-party evidence against `api.deepseek.com` (2026-09-15): successful `GET /v1/models`, successful chat completion, successful tool-call completion. Model id literal confirmed as `deepseek-flash`; no key value was recorded anywhere.
- [x] Identifier mapping recorded: display **DeepSeek V4.1 Flash**; stable pin **`deepseek-v41-flash`**; upstream API model id **`deepseek-flash`**.
- [x] No production worktree changes from the probe; the only untracked entries are these two architecture docs.

**Review checkpoint A (GPT-5.6 Sol):** satisfied — decisions were issued directly by GPT-5.6 Sol; Task 1 may proceed without further confirmation.

---

### Task 1: Pin the target contract in failing tests (RED)

**Files:**
- Create: `tests/content-studio-provider-parity.test.ts`
- Create: `tests/deepseek-first-party-transport.test.ts`
- Create: `tests/provider-registry-boundary.test.ts`
- Create: `tests/provider-registration-proof.test.ts`
- Create: `tests/grok-deepseek-no-cross-fallback.test.ts`
- Create: `tests/content-studio-provider-legacy-rejection.test.ts`
- Modify (target assertions only, keep existing cases that remain valid): `tests/content-ai-catalog.test.ts`, `tests/brief-model-policy.test.ts`, `tests/live-provider-policy.test.ts`, `tests/entrim-provider.test.ts`

**Interfaces:**
- Consumes: nothing new; tests import the future `@/lib/contentAiRegistry` and existing `@/lib/contentAiCatalog`, `@/lib/seoFactory/briefModel`, `@/lib/contentAiProvider`.
- Produces: executable contract for registry identity, DeepSeek host pinning, legacy rejection, no-fallback, non-registrability, Grok transport scope, and UI catalog parity.

- [ ] In `content-studio-provider-parity.test.ts` add cases: `COMMISSIONED_PINS` equals `['grok','deepseek-v41-flash']`; `commissionedProvider('deepseek-v41-flash').apiModel === 'deepseek-flash'` while `isCommissionedPin('deepseek-flash') === false` (the bare string stays a non-executable legacy pin and is only the upstream model id); `isCommissionedPin('entrim-deepseek')===false`; selector returns `needs_selection` for every legacy value list (design §7); a legacy pin thrown at `generateContentText` rejects with `ProviderSelectionRequiredError` and `code:'selection_required'`; single-pin Grok job with a DeepSeek-key present never calls fetch for the DeepSeek host; engine pair requires both providers; catalog exposes exactly two models/hosts in all four lanes.
- [ ] In `deepseek-first-party-transport.test.ts` add a `global.fetch` spy: adapter request URL host is exactly `api.deepseek.com` and path `/v1/chat/completions` (or registry-declared path); an attempted `DEEPSEEK_BASE_URL`/vault `base_url` override to `api.entrim.ai` or any other host is ignored; a forced non-`api.deepseek.com` base throws `destination_violation` before fetch; stream and non-stream both send the literal `deepseek-flash` as the request model (no Parasail canon, no alias).
- [ ] In `provider-registry-boundary.test.ts` walk `app/` and `lib/` (same pattern as `tests/content-studio-architecture-boundary.test.ts:37-52`), plus provider-capable `scripts/`, and fail when an execution-path file outside `lib/contentAiRegistry.ts`/`lib/xaiGrokTransport.ts`/`lib/xaiSuperGrokOAuth.ts` contains `api.entrim.ai`, `api.nvidia.com`, `baseten`, `parasail`, `runbios`, `openrouter`, `novita`, `requesty`, `tokenharbor`, provider-pin string literals, retired-transport imports, or a registered executor/candidate outside `adapterFor`. Grok’s own `cli-chat-proxy.grok.com` literal is allowed only in `lib/xaiGrokTransport.ts` (retained transport, not a provider). This static half of the post-P2 non-registrability guarantee must stay green both before and after the P3 dead-code purge.
- [ ] In `provider-registration-proof.test.ts` (runtime half): enumerate registered completers + stream candidates and assert set-equality with `COMMISSIONED_PINS` under default env, `CONTENT_AI_ALL_PROVIDERS=1`, retired keys present (`ENTRIM_API_KEY`, `NVIDIA_API_KEY`, …), and `CONTENT_AI_PROVIDER=entrim-qwen-27b`; assert `listConfiguredContentProviders` returns exactly the two registry providers. A retired transport must not be registrable or reachable in any env, including break-glass.
- [ ] In `grok-deepseek-no-cross-fallback.test.ts` add a fetch-spy matrix over auth/quota/rate_limit/timeout/empty for single-pin jobs: no cross-provider/cross-host calls in either direction; the retained Grok CLI-proxy fallback (when exercised) uses the Grok credential only, selects no other model/provider, and never appears on a DeepSeek path; DeepSeek requests stay on `api.deepseek.com`.
- [ ] In `content-studio-provider-legacy-rejection.test.ts` assert `409` + `execution_stage:'provider_selection_required'` for legacy pins on `app/api/content-studio/jobs` PATCH-regenerate, `author-revise`, `editorial-review`, `style-review`, `reaudit`, `suggest-brief`, and `seo-factory/generate(-stream)`, and on the vault/health surfaces `seo-factory/ai-keys` (PUT/validate), `ai-keys/settings`, `ai-keys/test`, and `seo-factory/health`, using route-level mocks and a fetch spy proving zero outbound calls.
- [ ] Update `tests/content-ai-catalog.test.ts` to expect two models (`grok-4.6`, `deepseek-v41-flash`), no Entrim host, and a `needs_selection` parse result for `entrim-deepseek`/`entrim-qwen-27b`/unknown pins (no Grok coercion).
- [ ] Update `tests/brief-model-policy.test.ts` to expect legacy pins to raise selection-required rather than coerce to Grok, and both commissioned pins to pass exclusive.
- [ ] Replace `tests/live-provider-policy.test.ts` expectations with commissioned-policy assertions (no Entrim labels, no break-glass restoration of retired hosts).
- [ ] Rewrite `tests/entrim-provider.test.ts` as rejection proof (Entrim pin non-executable; no `api.entrim.ai` request), keeping any pure helper coverage that still applies.
- [ ] Run RED: `TZ=UTC npx jest tests/content-studio-provider-parity.test.ts tests/deepseek-first-party-transport.test.ts tests/provider-registry-boundary.test.ts tests/provider-registration-proof.test.ts tests/grok-deepseek-no-cross-fallback.test.ts tests/content-studio-provider-legacy-rejection.test.ts --runInBand` → fails for missing registry/behavior (record exact failure output).
- [ ] Run focused catalog/brief RED: `TZ=UTC npx jest tests/content-ai-catalog.test.ts tests/brief-model-policy.test.ts tests/live-provider-policy.test.ts tests/entrim-provider.test.ts --runInBand` → fails where expectations are already target-state.

**P1/P2 activation note:** the execution-level cases (legacy rejection at `generateContentText`, no-fallback, cross-fallback, runtime registration proof), all route-level rejection cases, and the catalog/UI parity expectations are the frozen **P2** contract. They stay RED through P1 (Task 2) by design; P1 preserves the current redirect/execution and UI selection behavior and must not claim legacy rejection or the two-provider catalog/UI as active. P2 is the atomic Tasks 3–7 flip (design §8) in which all of these expectations activate together.

**Review checkpoint B (GPT-5.6 Sol):** approve failing tests as the frozen contract before implementation.

---

### Task 2: Canonical registry types + unit tests (P1 — strictly internal/dark)

**Files:**
- Create: `lib/contentAiRegistry.ts`
- Not modified in P1: `lib/contentAiCatalog.ts`, `components/design/studio-model-host-select.tsx`, `components/design/editor-metrics-strip.tsx`, and the admin picker/reselect surfaces — the catalog/UI two-provider choices, legacy reselect UX, and persisted-pin changes move entirely to Task 3’s P2 commission flip (design §8).

**Interfaces:**
- Produces: `COMMISSIONED_PROVIDERS`, `COMMISSIONED_PINS`, `isCommissionedPin`, `assertCommissionedPin`, `commissionedProvider`, `ContentProviderAdapter`, `adapterFor`, `resolveExecutionProvider`, `ProviderSelectionRequiredError`, `assertCommissionedDestination`.
- Consumes: confirmed upstream model literal `deepseek-flash` (design §13 decision 1).
- No production module imports the registry in P1.

- [ ] Create `lib/contentAiRegistry.ts` with the exact shape in design §3.2; `deepseek-v41-flash.apiModel = 'deepseek-flash'`; `grok.apiModel = 'grok-4.6'`; both lanes `['draft','brief','review','command']`; literal `baseUrl`s and `baseUrlHost`s.
- [ ] Implement `resolveExecutionProvider` with `{kind:'commissioned'|'needs_selection'}` as design §3.6; never return a non-commissioned pin.
- [ ] Implement `ProviderSelectionRequiredError` with `code:'selection_required'`, `status:409`, `legacyValue`, and a serializable payload for routes.
- [ ] Implement `assertCommissionedDestination(url, expectedHost)` throwing `destination_violation`.
- [ ] P1 dark boundary (design §8): P1 is registry types, unit tests, and inert wiring only. Do not modify `lib/contentAiCatalog.ts`, `components/design/studio-model-host-select.tsx`, `components/design/editor-metrics-strip.tsx`, any production selector, picker/catalog row, persisted pin (`canonicalizePin`/`parseStudioPin`/`pinFor` semantics), route behavior, or executable provider registration. No production module imports the registry in P1.
- [ ] Run GREEN (registry units only): `TZ=UTC npx jest tests/content-studio-provider-parity.test.ts --runInBand` → registry identity/selector/destination units pass; execution-level cases stay RED by design until Task 3. Record that `tests/content-ai-catalog.test.ts` (catalog/UI release) and `tests/provider-registry-boundary.test.ts` (execution-path migration) also stay RED through P1 because both are P2.
- [ ] Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → no new errors.

**Review checkpoint C (GPT-5.6 Sol):** registry API review; catalog/UI and execution registration remain untouched in P1 and move to the P2 commission flip.

---

### Task 3: P2-A commission flip — adapter + provider registration + catalog/UI release (atomic with Tasks 4–7)

**Files:**
- Modify: `lib/contentAiProviderCore.ts`
- Modify: `lib/contentAiProvider.ts` (only if guard wiring changes)
- Modify: `lib/seoFactory/circuitBreaker.ts:5` (add `deepseek-v41-flash`, drop retired hosts when unused)
- Modify: `lib/contentAiCatalog.ts` (registry-derived two-provider identity; `parseStudioPin` returns `needs_selection` for legacy values)
- Modify: `components/design/studio-model-host-select.tsx` (two models/hosts; “Reselect provider” state)
- Modify: `components/design/editor-metrics-strip.tsx:19-23` (pin from job/contract/registry, not Grok constant)
- Modify: `components/design/admin-content-studio.tsx` (reselect flow; remove Entrim default-model map), `components/design/admin-inline-editor.tsx:134,1494-1496`, `components/design/admin-seo-engine.tsx:133-134,655-657`, `components/design/admin-command-center.tsx:2412`
- Tests: `tests/deepseek-first-party-transport.test.ts`, `tests/content-studio-provider-parity.test.ts`, `tests/content-ai-catalog.test.ts`, preserved `tests/live-provider-policy.test.ts` successor, e2e `e2e/studio-configure-stage.spec.ts`, `e2e/brief-model-selector.spec.ts`, `e2e/studio-review-model-selector.spec.ts`

**Interfaces:**
- Consumes: registry (`adapterFor`, `resolveExecutionProvider`).
- Produces: `generatedContentText/Stream` that execute only commissioned pins, exclusive; typed failures; no redirect; two-provider catalog/UI with legacy reselect and no non-commissioned pin selectable anywhere; a runtime-proven registration set.

- [ ] Activation order (design §8 P2): adapter + provider registration → fail-closed selector/route boundaries → catalog/UI release (this task) → vault/settings/test/health routes + vault UI (Task 6) → deployment/runtime declarations (Task 7). Land Tasks 3–7 as one atomic commission flip (single revertible commit range/PR) only after the focused P2 tests are green. No subset may land while a DeepSeek selection is exposed before its registered executor, while legacy selectors/UI/probes remain executable, or while any retired provider configuration remains injected/effective.
- [ ] Rewrite `lib/contentAiCatalog.ts`: `StudioModelId = 'grok-4.6' | 'deepseek-v41-flash'`, `StudioHostId = 'xai' | 'deepseek'`, `LANE_HOSTS` all two hosts, `STUDIO_MODELS` derived from registry, `canonicalizePin`→`parseStudioPin` returns `{kind:'needs_selection'}` for legacy values; remove `PIN_ALIASES` Grok coercion (keep read-only `legacyProviderDisposition`).
- [ ] Update picker/admin components to render two models/hosts and a “Reselect provider” state for legacy pins; no preselected fallback; update e2e selector expectations to two models/hosts.
- [ ] Update style strip to derive from the job/contract pin.
- [ ] Replace `LIVE_PROVIDER_LABELS`/`LIVE_DEFAULT_PROVIDER`/`applyLiveProviderPolicy` with registry-derived commissioned checks; delete the silent-redirect path (`contentAiProviderCore.ts:163-197`). This task is where legacy rejection becomes active; before it, P1 keeps the existing redirect behavior live and makes no rejection claim.
- [ ] Rewrite `orderedCompleters` `:3102-3135` and stream candidates `:3505-3542` to register exactly `grok` and `deepseek-v41-flash` via `adapterFor`; remove Entrim registrations and `pushEntrim`; nothing outside `adapterFor` may register a transport.
- [ ] Export the runtime registration introspection used by `provider-registration-proof.test.ts` (registered completers + stream candidates) and prove set-equality with `COMMISSIONED_PINS` under the default, break-glass, and retired-env matrices. A retired transport must not be registrable in any env, even before the P3 purge.
- [ ] Implement the DeepSeek adapter: `openAiCompatibleComplete`/`openAiCompatibleStream` with literal `https://api.deepseek.com/v1`, `resolveDeepseekFirstPartyApiKey()` from `DEEPSEEK_API_KEY` (vault/env precedence), registry model `deepseek-flash` verbatim, `assertCommissionedDestination` before every fetch; ignore `DEEPSEEK_BASE_URL` and vault `base_url` for this pin; no Grok endpoint or Grok proxy is reachable from this adapter.
- [ ] Grok semantics: keep `lib/xaiGrokTransport.ts` behavior (public API + retained subscription CLI-proxy fallback) inside the Grok adapter; the fallback remains same-provider/same-credential, selects no other model/provider, and never carries DeepSeek traffic. Do not introduce an intermediary claim that forbids the existing Grok proxy.
- [ ] Ensure the adapter never calls `canonicalizeDeepseekModelId`/`canonicalizeDeepseekLaneModelId` (`:253-293`) and is the only DeepSeek path in execution; unregister the `deepseek` entry in `listOpenAiFallbackProviders` `:2786-2792` from any executable cascade.
- [ ] `resolveAiProviderPin`/`preferProvider` `:2858-2991`, `:3242-3332`: legacy/unknown ⇒ `ProviderSelectionRequiredError`; remove Grok coercion; drop retired alias tables that cannot execute.
- [ ] Make every commissioned call exclusive by default (no cross-provider cascade), including auto/empty (resolved to lane default with `pinSource:'lane_default'`); preserve existing same-provider retry helpers (`withRetry:672`, `fetchStreamWithRetry:2170`).
- [ ] Classify destination violations and selection-required in `formatProviderFailure`/classifiers `:594-648`; record granular `provider_error_class`.
- [ ] Update `lib/seoFactory/circuitBreaker.ts` provider union/labels.
- [ ] Run GREEN: `TZ=UTC npx jest tests/deepseek-first-party-transport.test.ts tests/content-studio-provider-parity.test.ts tests/provider-registration-proof.test.ts tests/grok-deepseek-no-cross-fallback.test.ts tests/content-ai-catalog.test.ts tests/grok-responses-brief.test.ts tests/content-ai-auto-provider.test.ts --runInBand`.
- [ ] Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`.

**Review checkpoint D (GPT-5.6 Sol):** transport security + no-fallback + registration proof + catalog/UI parity proof before Task 4’s fail-closed route boundaries land in the same atomic flip.

---

### Task 4: P2-B server boundaries — brief, engine pair, jobs/review/reaudit/audit-matrix parity

**P2 activation note:** this task is the fail-closed selector/route-boundary step of the same atomic P2 commission flip as Task 3 (design §8); Tasks 3–7 land together as one revertible commit range after the focused P2 tests are green. Vault/health/test surfaces (Task 6) are part of the same flip.

**Files:**
- Modify: `lib/seoFactory/briefModel.ts:26-68,178-273`
- Modify: `lib/seoEngine/engineAi.ts:37-46,88-113`
- Modify: `lib/seoEngine/llmVisibility.ts:347-365,392,595` (audit-engine matrix resolves commissioned pins only)
- Modify: `lib/seoEngine/knowledge.ts:482` (no Entrim pin literal; registry resolution)
- Modify: `lib/seoEngine/planner.ts:1164` (pin pass-through from registry surfaces)
- Modify: `lib/seoFactory/contentStudioExecutionContext.ts:233-243` (`assertContractProviderSelection`)
- Modify: `app/api/content-studio/editorial-review/route.ts:48-57`
- Modify: `app/api/content-studio/style-review/route.ts:4,19,155-177`
- Modify: `app/api/content-studio/author-revise/routeCore.ts:157-160,207-219`
- Modify: `app/api/content-studio/reaudit/route.ts:345-467`
- Modify: `lib/seoFactory/pipelineContract.ts` (pin identity passed through; no client override)
- Tests: new rejection suite + preserved `tests/editorial-supervision.test.ts`, `tests/style-review-parse.test.ts`, `tests/revision-quality.test.ts`, `tests/harper-lane.test.ts`

**Interfaces:**
- Consumes: `resolveExecutionProvider`, registry, `ProviderSelectionRequiredError`.
- Produces: parity for brief/draft/review/revision lanes under either pin; legacy rejection at every route boundary; a complete selector/executor inventory.

- [ ] `briefModel.ts`: default remains Grok (supervisor-confirmed); fallback legs removed; both commissioned pins accepted exclusively; legacy pin ⇒ selection-required (no coercion).
- [ ] `engineAi.ts`: `ENGINE_PAIR` becomes `grok` + `deepseek-v41-flash`; `enginePairReady()` requires both configured and fails closed with no single-lead degradation; remove Entrim-only comments/constants; pair meta already records both models (`EnginePairMeta:63-72`) — keep.
- [ ] `llmVisibility.ts`: `auditEngineCandidates`/`resolveAuditEngines` resolve only `COMMISSIONED_PINS` via the registry; retired audit-engine candidates are removed; the matrix cannot return a retired pin, and the un-pinned fallback resolves through the lane default (recorded `pinSource:'lane_default'`), not a retired cascade.
- [ ] `knowledge.ts`/`planner.ts`: replace provider pin literals/pass-through with registry resolution; a retired pin fails closed exactly like the routes above.
- [ ] `contentStudioExecutionContext.ts`: `assertContractProviderSelection` rejects non-commissioned contract/request pins with the typed error and records `pinSource`.
- [ ] Review routes: accept the contract/owner pin (both providers), keep exclusive + bounded revision/audit semantics; style-review loses Grok-only const.
- [ ] `reaudit/route.ts`: replace the legacy pin table with registry resolution; legacy pins rejected; keep bounded timeouts (`CONTENT_STUDIO_FIX_*`).
- [ ] Confirm `pipelineContract.ts:100-165` still rejects client copies that conflict with contract identity; add pin equality assertion.
- [ ] Boundary completeness: record that the provider-capable surface inventory (design §3.8) is fully covered by Tasks 3–6 + this task; any module the boundary scan surfaces is resolved here or fenced with a fail-closed test — no surface may remain that can select/inject/test/execute a retired provider.
- [ ] Run GREEN: `TZ=UTC npx jest tests/content-studio-provider-legacy-rejection.test.ts tests/brief-model-policy.test.ts tests/engine-ai-grok-fallback.test.ts tests/content-studio-ui-contract-route.test.ts tests/content-studio-production-entrypoints.test.ts --runInBand`.

**Review checkpoint E (GPT-5.6 Sol):** route-by-route parity + rejection evidence.

---

### Task 5: P2-C persistence — requested/actual provider + migration (unapplied; same atomic flip)

**Files:**
- Modify: `lib/seoFactory/jobColumns.ts:20-39,182-195` (`actual_provider`, `provider_error_class` projections)
- Modify: `lib/seoFactory/persistContentJobCore.ts:164-291` (`mapPipelineJobRow` writes `actual_provider`/`provider_error_class`; keep absent-column compat retry `:337-347`)
- Modify: `lib/seoFactory/persistContentJob.ts:35-124` (fenced update includes new fields)
- Modify: `lib/seoFactory/contentStudioPipelineCore.ts:211-301` (persist `actual_provider`, provider_error_class on failure `:160-209`)
- Modify: `lib/seoFactory/suggestBriefContractCore.ts:310-319` (attach requested provider/model)
- Modify: `lib/seoFactory/storedJobExecution.ts:30-68` (carry pin explicitly)
- Create: `supabase/migrations/20260916122441_content_studio_provider_parity.sql` (additive, reversible, **unapplied**)
- Create: `tests/sql/content-studio-provider-parity.sql` (review copy, mirrors PR #200 SQL-test pattern)
- Create: `docs/content-studio/PROVIDER_PARITY_SCHEMA_REVIEW_20260915.md`
- Modify: `tests/jobs-ship-gate-server.test.ts`, `tests/persist-content-job.test.ts` (fixture columns)

**Interfaces:**
- Produces: durable `requested provider (ai_provider) / requested_model / actual_provider / actual_model / execution_stage / attempt / hashes / last_failure_kind / provider_error_class / deploy lineage`.
- Consumes: migration not yet applied — code must tolerate column absence.

- [ ] Write migration per design §4.2 with the reverse block and comments; header states “INTENTIONALLY UNAPPLIED”.
- [ ] Write `tests/sql/content-studio-provider-parity.sql` validating presence/type/comment of both columns without touching PR #200 objects; extend `.github/workflows/content-studio-review.yml` focused SQL step (same step as `:51`).
- [ ] Write `PROVIDER_PARITY_SCHEMA_REVIEW_20260915.md` byte-aligned with the migration (pattern: `docs/content-studio/EXECUTION_LEASE_SCHEMA_REVIEW_20260915.md`).
- [ ] Persist attempts array in `audit_json.provider` (design §4.3) with truncation; never persist prompts/keys.
- [ ] Note: this task ships inside the same atomic P2 flip as Tasks 3, 4, 6, 7 (design §8); no persistence change may land standalone while the commission flip is incomplete.
- [ ] Run GREEN (without DB column present): `TZ=UTC npx jest tests/jobs-ship-gate-server.test.ts tests/persist-content-job.test.ts tests/content-studio-persist-fencing.test.ts tests/content-studio-manual-publication-fencing.test.ts --runInBand`.
- [ ] Run: `git diff --check`.
- [ ] STOP: do not apply the migration; it may merge only unapplied, and application requires separate supervisor approval (design §13.7). Request that approval explicitly.

**Review checkpoint F (GPT-5.6 Sol):** schema review + no-application confirmation.

---

### Task 6: P2-D vault/settings/health/test routes + vault panel (atomic with Tasks 3–5, 7)

**Files:**
- Modify: `lib/aiKeyVault.ts:41-108,525-563` (two provider rows; `HOST_MODEL_OPTIONS` registry-derived; `DEFAULT_PROVIDER_ORDER` two pins)
- Modify: `app/api/seo-factory/ai-keys/route.ts:25-122` (whitelist from registry)
- Modify: `app/api/seo-factory/ai-keys/settings/route.ts:9-59` (validate against registry pins)
- Modify: `app/api/seo-factory/ai-keys/test/route.ts:11-53` (probe only commissioned pins; DeepSeek probe goes to the first-party adapter)
- Modify: `app/api/seo-factory/health/route.ts:38-62`
- Modify: `components/design/ai-key-vault-panel.tsx:174-473`
- Tests: `tests/ai-vault-precedence.test.ts`, `tests/entrim-provider.test.ts` (rejection), `tests/entrim-qwen-catalog.test.ts` (retired), `tests/content-ai-catalog.test.ts` (regression)

**Interfaces:**
- Produces: vault/UI selection restricted to the two pins; legacy rows visible-but-unselectable; test probe proves host; deploy-time vault sync injects commissioned rows only.
- Consumes: registry.

- [ ] Update vault modules/rows; keep historical `ai_provider_keys` rows readable but non-selectable.
- [ ] Ordering: the admin picker/reselect surfaces and e2e selector specs ship in Task 3; this task’s vault routes/panel are part of the same atomic P2 flip and merge together — vault selection is never executable before the Task 3 registration/selector work, and no retired provider may remain selectable from the vault.
- [ ] Add/adjust tests proving retired vault rows cannot be selected, probed, or executed (fetch spy: zero outbound calls from `ai-keys/test`/`health` for retired pins); `ai-keys/test` probes only commissioned pins, with the DeepSeek probe going to the first-party adapter.
- [ ] Confirm `scripts/sync-ai-vault.mjs` (Task 7) no longer injects retired provider rows and maps `DEEPSEEK_API_KEY` to `deepseek-v41-flash`; existing rows are retained, not deleted.
- [ ] Run GREEN: `TZ=UTC npx jest tests/ai-vault-precedence.test.ts tests/entrim-provider.test.ts tests/entrim-qwen-catalog.test.ts tests/content-ai-catalog.test.ts --runInBand`.

**Review checkpoint G (GPT-5.6 Sol):** vault parity + non-selectable legacy rows (UI reselect proof lands with the same P2 flip).

---

### Task 7: P2-E deploy/config declarations (atomic with Tasks 3–6; code only; no deploy; no secret deletion)

**Files:**
- Modify: `.github/workflows/deploy.yml:82-137,231-294` (replace `CONTENT_AI_PROVIDER="entrim-qwen-27b"` with the commissioned registry default `"grok"` as a literal — never interpolate the GitHub secret; stop syncing retired Content Studio provider config: `ENTRIM_*`, `NVIDIA_*`/`NVAPI_KEY`, `BASETEN_*`, `AIHUBMIX_*`, `OPENAI_*`, `CUSTOM_AI_*`, retired model envs; keep `XAI_*` and `DEEPSEEK_API_KEY`)
- Modify: `scripts/sync-ai-vault.mjs:33-47` (`SYNC_MAP` reduced to commissioned rows: `XAI_API_KEY → grok`, `DEEPSEEK_API_KEY → deepseek-v41-flash`; retired provider rows no longer injected)
- Modify: `env.d.ts:61-84` (declare `XAI_API_KEY`, `XAI_MODEL`, `XAI_BASE_URL`, `DEEPSEEK_API_KEY`; no `DEEPSEEK_BASE_URL` for the commissioned pin)
- Modify: `wrangler.toml:101-120` secrets comment block (commissioned set only)
- Modify: `.github/workflows/content-studio-review.yml:51-54` (add new focused suites + SQL file)

**Interfaces:**
- Produces: config truth aligned with the registry; no deploy/runtime declaration can re-pin a retired host; retired provider configuration is no longer injected.

- [ ] Apply edits above; `CONTENT_AI_PROVIDER` is pinned to the commissioned registry default (`grok`) or omitted (supervisor-confirmed). After this task no deploy/runtime declaration can inject or select a retired provider; the retired literal is gone.
- [ ] Do not delete any GitHub/Worker/vault secret value in this task; P2 stops *injection*, and §7.1 governs deletion under separate approval. Retain any sync line whose only consumer is a non-Content-Studio surface (e.g. general chat `GROQ_API_KEY`/`GEMINI_API_KEY`/`OPENROUTER_API_KEY`/`CLOUDFLARE_AI_TOKEN`), enumerating it in the PR diff notes; Content Studio execution paths cannot read retained secrets (boundary test).
- [ ] Run: `grep -rn "entrim\|nvidia\|baseten\|aihubmix\|parasail\|runbios" .github/workflows/deploy.yml wrangler.toml env.d.ts scripts/sync-ai-vault.mjs` → only approved historical/retirement references remain (no policy literal, no retired-host injection).
- [ ] Run: `git diff --check`.

**Review checkpoint H (GPT-5.6 Sol):** config diff + secret policy review.

---

### Task 8: P3 dead-code purge + docs + full verification (cleanup only; not a safety dependency)

**Files:**
- Modify: `lib/contentAiProviderCore.ts` (delete now-unreferenced retired transports only after boundary tests prove zero references)
- Modify or delete: `scripts/probe-runbios-pipeline.ts` (no working retired-provider execution path may remain)
- Modify: `docs/CONTENT_STUDIO_IMPLEMENTATION_AUDIT.md` (append provider-parity status with exact evidence)
- Modify: `docs/CONTENT_STUDIO_HANDOFF.md` (runtime provider truth)
- Modify: `docs/CONTENT_STUDIO_DEEPSEEK_GAP_BRIEF.md` only if instructions conflict (do not rewrite history)
- No other docs.

**Interfaces:**
- Produces: final green state + truthful docs; no unreferenced retired execution code.

- [ ] Before deleting anything, rerun `provider-registry-boundary.test.ts` + `provider-registration-proof.test.ts` and record that non-registrability and route-unreachability already hold after P2; after deletion, rerun both and record the result. If deletion is skipped for any module, the guarantee is unchanged.
- [ ] Run the boundary test; delete only unreferenced exports/modules; keep `canonicalize*` helpers that tests still pin, or remove with their tests.
- [ ] Provider-capable scripts (`scripts/probe-runbios-pipeline.ts`) are deleted or converted to fail-closed commission-only; no script may remain a working retired-provider execution path.
- [ ] Append audit evidence: branch, head SHA, commands, results, remaining risks.
- [ ] Run full focused suite: `TZ=UTC npx jest tests/content-studio-provider-parity.test.ts tests/deepseek-first-party-transport.test.ts tests/provider-registry-boundary.test.ts tests/provider-registration-proof.test.ts tests/grok-deepseek-no-cross-fallback.test.ts tests/content-studio-provider-legacy-rejection.test.ts tests/content-ai-catalog.test.ts tests/brief-model-policy.test.ts tests/live-provider-policy.test.ts tests/entrim-provider.test.ts --runInBand`.
- [ ] Run TypeScript: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`.
- [ ] Run full suite: `TZ=UTC NODE_OPTIONS=--max-old-space-size=8192 npx jest --ci --runInBand`.
- [ ] Run build: `npm run build`.
- [ ] Attempt lint: `npm run lint`; if Next 16 makes `next lint` non-operational, report the exact failure and do not claim it passed.
- [ ] Run `git diff --check` and `git status --porcelain`.

**Review checkpoint I (GPT-5.6 Sol):** final review; approve commit/push/PR only after all commands are green on the final SHA.

---

### Task 9: Handoff (no self-approval)

**Files:**
- No production changes; create the draft PR only after explicit approval.

- [ ] Report to GPT-5.6 Sol: branch, head SHA, files changed, RED/GREEN evidence per task, accepted risks, supervisor decisions implemented (design §13, including PR #204 review corrections §13.8–13.11: P2 atomic across Tasks 3–7, non-registrable retired transports with boundary/runtime proofs, Grok transport semantics with no cross-fallback, DeepSeek hard-pin unchanged), migration not applied, secret checklist status.
- [ ] On approval: commit, push, open PR (draft) against `main`; include the design/plan links and commands.
- [ ] On approval: request DB application of `20260916122441_content_studio_provider_parity.sql` as a separate step; verify column presence after application; do not apply it locally.
- [ ] On approval: request a single canary generation per provider through the real Worker, then live verification; record provider/model/attempt/hash evidence.
- [ ] STOP after handoff; no merge, no deploy, no production verification without GPT-5.6 Sol.

**Review checkpoint J (GPT-5.6 Sol):** merge/deploy/verification decision.
