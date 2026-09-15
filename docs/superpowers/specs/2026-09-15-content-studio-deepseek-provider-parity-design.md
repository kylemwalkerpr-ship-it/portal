# Content Studio DeepSeek Provider Parity — Design

**Date:** 2026-09-15
**Repository:** `kylemwalkerpr-ship-it/portal`
**Worktree:** `/Users/phantomdarne/Documents/GitHub/yousafe-portal-worktrees/content-studio-deepseek-parity`
**Branch:** `architecture/content-studio-deepseek-parity-20260915`
**Baseline main / origin/main:** `ca23e3d76dfc9fc0516a8021e5c21729c845de00` (verified 2026-09-15)
**PR #200 merge commit on baseline:** `377a3a3a6fb2db8ac840a2eec41264fc703fbce2` (“Merge PR #200: Content Studio evidence contract”)
**Supervisor / sole approver:** GPT-5.6 Sol
**Executor:** DeepSeek V4.1 Flash (implementation only; no scope, commit, push, merge, DB, or production authority)
**Status:** TASK 0 architecture and planning only; revision 4 (2026-09-15) incorporates the final supervisor decisions in §13 (confirmed DeepSeek identifiers, lane defaults, engine-pair policy, base-URL policy, secret-retirement prerequisite, unapplied migration rule), the second architecture review’s P1/P2 sequencing correction (P1 strictly internal/dark; P2 one atomic commission flip), and the PR #204 supervisor review corrections (§13.8–13.11: P2 atomic across adapter/registration, fail-closed routes, catalog/UI, vault/settings/test/health routes and vault UI, and deployment/runtime declarations; retired transports non-registrable and route-unreachable after P2 independent of dead-code cleanup; explicit Grok transport semantics with no Grok↔DeepSeek cross-fallback; first-party DeepSeek hard-pin and model/pin distinction unchanged). No production code, tests, migrations, provider configuration, secrets, GitHub, Supabase, Cloudflare, or external service was modified by this document.

## 1. Purpose

Decommission every non-commissioned content-generation host and make Content Studio run on exactly two explicitly commissioned providers with full pipeline parity:

1. **Grok 4.6** through the existing xAI transport (`api.x.ai/v1` / SuperGrok OAuth).
2. **DeepSeek V4.1 Flash (first-party)** through `api.deepseek.com` only.

“Parity” means every stage exists and is equally executable under either provider: Discover/knowledge → evidence → scoring → sealed brief / writing contract → draft → review → revision → approval → publication → GitHub deploy observation → live verification → bounded retry/error recovery.

Hard constraints from the commission:

- DeepSeek traffic must never traverse Entrim, Novita, OpenRouter, Requesty, Token Harbor, Vercel, NVIDIA, Baseten, Parasail, Run BiOS, or any other intermediary.
- The existing xAI Grok transport (`lib/xaiGrokTransport.ts`, `lib/xaiSuperGrokOAuth.ts`) is authorized to remain unchanged in mechanism: it is one of the two commissioned providers, not an additional AI provider and not a fallback target for DeepSeek. Its existing CLI-proxy fallback (`cli-chat-proxy.grok.com/v1`, Grok’s own subscription proxy) stays inside Grok/xAI credential behavior; it is a transport fallback only, cannot select or route to another model or provider, and never carries DeepSeek traffic. The intermediary prohibition above is DeepSeek-specific (retired/third-party hosts); it does not forbid the retained Grok subscription proxy.
- Grok and DeepSeek never cross-fallback: a job owned by one pin is never retried, redirected, substituted, or proxied onto the other provider under any failure class. DeepSeek traffic goes to `api.deepseek.com` only; Grok traffic stays on xAI/Grok endpoints only.
- One canonical registry/provider interface governs the UI and every server/background path.
- No silent fallback between Grok and DeepSeek; provider ownership is explicit and stable per job.
- After the P2 commission flip, no retired provider can be selected, injected, tested, registered, or executed — including while its dead-code modules still exist. The boundary test and runtime registration proof enforce this at P2, not at cleanup time.
- Legacy provider values stay historical/auditable but are non-executable. A legacy value must force re-selection; it may never silently redirect to a default.
- Persist requested/actual provider+model, attempt/stage, hashes, failure class, and publication/deployment lineage without secrets or prompt contents.
- Preserve PR #200 fail-closed evidence, leases/fencing, RLS, renderer/publication proof.
- “Purge” means retiring all other new selection/execution routes — not deleting secrets or history. Secret retirement is a separately approved checklist (§7.1) with a 30-consecutive-day zero-use prerequisite and its own supervisor approval.
- All DB changes are migration-based, least privilege, reversible, and **not applied** by this program.
- GPT-5.6 Sol alone approves scope, readiness, commits, pushes, PR, merge, DB application, and production verification.

## 2. Current-state evidence (all references verified at `ca23e3d7`)

### 2.1 PR #200 reconstruction

- Merge commit `377a3a3a6fb2db8ac840a2eec41264fc703fbce2`, parents `f8314a19` (main) and `8f99036d` (PR head).
- Head branch: `feature/content-studio-evidence-contract` (`remotes/origin/feature/content-studio-evidence-contract`).
- Diff `f8314a19...8f99036d`: **93 files changed, +20,186 / −10,553**.
- What PR #200 established (still current):
  - Public doors vs internal cores: `lib/contentAiProvider.ts` (`export * from './contentAiProviderCore'` `:10`; guarded `generateContentText` `:18-24`, `generateContentTextStream` `:26-32`), `lib/seoFactory/persistContentJob.ts` vs `persistContentJobCore.ts`, `app/api/content-studio/jobs/route.ts` vs `legacy.ts`/`legacyCore.ts`, `app/api/seo-factory/generate-stream/route.ts` vs `legacy.ts`, `lib/githubContents.ts` vs `githubContentsCore.ts`, `linearDesk.ts` vs `linearDeskCore.ts`, `renderTarget.ts` vs `renderTargetCore.ts`.
  - Immutable evidence + writing contract: `content_studio_evidence_items`, `content_studio_writing_contracts` (immutability trigger `20260914_content_studio_evidence_contract.sql:81-97`), `lib/seoFactory/writingContract.ts`, `writingContractStoreCore.ts`.
  - Execution leases/fencing as an **intentionally unapplied** migration: `supabase/migrations/20260915_content_studio_execution_lease.sql:1-3` (“THIS MIGRATION IS INTENTIONALLY UNAPPLIED”), columns `execution_owner`, `execution_attempt`, `execution_lease_expires_at` `:14-17`, RPCs `claim/renew/check/release_content_studio_execution` `:19-145`.
  - Strict fenced persistence: `lib/seoFactory/persistContentJob.ts:16-33` (`strictFence`), `streamContentJobFence.ts:116-150`.
  - Publication proof + live verification: `publicationProof.ts`, `publicationMonitor.ts`, `publicationStates.ts`, `liveVerify.ts`.
  - Architecture tests: `tests/content-studio-architecture-boundary.test.ts` (provider door `:23-28`; contract runners `:55-80`; raw-pipeline prohibition in routes `:90-105`).
- PR #200 did **not** change the provider commission. The provider layer still runs the 2026-09-02 “Entrim + Grok” live policy.

### 2.2 End-to-end pipeline map (current symbols)

| Stage | Current route / facade | Core symbols |
|---|---|---|
| Discover / knowledge | `app/api/content-studio/keywords/discover/route.ts`, `gsc/suggestions/route.ts`, `opportunities/score/route.ts`, `briefs/from-intel/route.ts` | `keywordDiscover.ts:discoverKeywords`, `opportunityEngine.ts:scoreOpportunities`, `lib/seoEngine/demandFeeders.ts:pullAllDemand` |
| Evidence | `app/api/content-studio/suggest-brief/route.ts` | `tinyfishAdapter.ts:collectTinyfishResearch`, `researchEvidenceStore.ts:persistResearchEvidence`/`verifyContractEvidenceRows` |
| Scoring | (same routes) | `authorityScoring.ts:scoreTopicAuthority`, `briefReadiness.ts:assertBriefReady`, `opportunityIdentity.ts:buildOpportunityIdentity` |
| Brief / contract | `suggest-brief/route.ts` → `coreImpl.ts` | `suggestBriefContract.ts:startSuggestBriefContract`/`finalizeSuggestBriefContract`, `sealedBrief.ts:sealBriefFromAssembly`, `writingContract.ts:buildWritingContract`, `writingContractStoreCore.ts:persistWritingContract`/`attachWritingContractToJob` |
| Draft | `app/api/content-studio/generate/route.ts:17-91`, `app/api/seo-factory/generate/route.ts`, `generate-stream/route.ts:90-203` | `contentStudioPipeline.ts:runContentStudioPipeline`/`runContentStudioPipelineStream`, `contentStudioPipelineCore.ts:prepareStrictExecution:303`, `pipelineStream.ts:runSeoFactoryPipelineStream:91` |
| Review / revision | `author-revise/route.ts` → `routeCore.ts:32`, `editorial-review/route.ts:16`, `style-review/route.ts:104` | `rewriteAcceptance.ts:acceptRewriteCandidate`, `editorialRevision.ts`, `editorialReviewPatch.ts` |
| Approval | `app/api/content-studio/jobs/route.ts:PATCH:110` | `strictManualPublication.ts:strictManualPublicationPATCH:241`, `jobShipGate.ts:jobPassesShipGate` |
| Publishing | `jobs/route.ts` PATCH, `legacy.ts:16-26` | `ship.ts:shipContent:517`, `githubContents.ts:assertGitMutationLease:14`, `persistContentJob.ts:persistPipelineJob:35` |
| GitHub observation | `app/api/content-studio/webhook/route.ts:16`, `deployMonitor.ts` | `githubContentsCore.ts:getPullRequest`/`mergePullRequest`, `deployMonitor.ts:pollChecks:92`, `monitorContentJob:168` |
| Live verification | `app/api/content-studio/verify-published/route.ts:26` | `liveVerify.ts:verifyLiveUrl:35`, `publicationMonitor.ts:reconcilePublicationDeployment:78`, `publicationStates.ts:evaluateLiveArtifact:75` |
| Retry / recovery | `app/api/cron/content-studio-retry/route.ts:105`, `reconcile-content-jobs/route.ts:74` | `storedJobExecution.ts:runStoredContentJob:30`, retry constants `MAX_ATTEMPTS=6`, backoff `content-studio-retry/route.ts:13-21`; reconcile `MAX_AUTOMATIC_ATTEMPTS=5`, `BACKOFF_MIN=[5,15,45,120,360]` `reconcile-content-jobs/route.ts:11-15` |

Execution stages are a code enum: `lib/seoFactory/executionStages.ts:6-27` (`discovered` → `measuring` plus `needs_research`, `brief_invalid`, `revision_required`, `blocked_supply`, `ci_failed`, `deployment_failed`, `verification_failed`). Scheduling is GitHub Actions HTTP crons, **not** Cloudflare Queues (`wrangler.toml` has no `[[queues]]` and no `[triggers]`; `.github/workflows/content-studio-retry.yml:13-14` `*/30 * * * *`; `.github/workflows/reconcile-content-jobs.yml:13-14` `*/15 * * * *`).

### 2.3 Current provider commission and Grok implementation

`lib/contentAiProviderCore.ts` (3,708 lines) is the de-facto registry today:

- Live set: `LIVE_PROVIDER_LABELS = [ENTRIM_QWEN_LABEL, ENTRIM_DEEPSEEK_LABEL, 'grok']` `:163`; `LIVE_DEFAULT_PROVIDER = 'grok'` `:164`; break-glass `CONTENT_AI_ALL_PROVIDERS=1` `:167-178`.
- Silent redirect: `applyLiveProviderPolicy` `:186-197` rewrites any retired pin to the default and **deletes the model override**.
- Provider list for UI/health: `listConfiguredContentProviders` `:2819-2845` returns exactly three Entrim/Grok rows.
- Pin resolution: `resolveAiProviderPin` `:3242-3332`; unknown pins fall back to `grok` `:2984-2988`; `preferProvider` `:2858-2991`.
- Auto cascade: `configuredProviderOrder` `:3031-3080`, `promoteLiveStudioLead` `:3019-3023` (`['grok','entrim-qwen-27b','entrim-deepseek']`).
- Registered executors: `orderedCompleters` `:3102-3135` pushes **only** Grok and Entrim; stream candidates `:3505-3542` register **only** Entrim DeepSeek, Entrim Qwen, Grok.
- Grok transport: `lib/xaiGrokTransport.ts` (`XAI_PUBLIC_API_BASE_URL='https://api.x.ai/v1'` `:16`, developer-key detection `:44-46`, CLI-proxy fallback `:57-63`), `grokComplete:1414-1478`, `grokResponsesStream:1365-1412`, `x-grok-conv-id` header `:1232-1242`, SuperGrok OAuth `lib/xaiSuperGrokOAuth.ts` (`XAI_DEFAULT_MODEL='grok-4.6'` `:31`, settings keys `xai_oauth_*` `:33-39`, overlay `:346-359`).
- First-party DeepSeek constants already exist but are **not** in the live cascade: `DEEPSEEK_OFFICIAL_BASE_URL='https://api.deepseek.com/v1'` `:309`, `DEEPSEEK_OFFICIAL_FLASH_MODEL='deepseek-ai/DeepSeek-V4-Flash-0731'` `:310`, host-allowlisted `deepseekOfficialBaseURL()` `:1782-1785` (allowlist `['api.deepseek.com']`), `getDeepseekOfficialFlashProvider()` `:1800-1805` / `getDeepseekOfficialProProvider()` `:1808-1813`, plus an unregistered `deepseek` entry in `listOpenAiFallbackProviders` `:2786-2792`.
- Mid-2026 cascade history is still present as dead code/aliases: NVIDIA `:56-102`, Baseten `:103-109`, AIHubmix `:110-114`, Parasail `:115-121`, Entrim `:122-134`, Run BiOS `:198-200`, Zai `:312-314`, `listOpenAiFallbackProviders` `:2738-2803`.
- Model normalization: `canonicalizeDeepseekModelId` `:253-271` (retargets bare ids to **Parasail** checkpoints — a commissioning hazard), `canonicalizeDeepseekLaneModelId` `:280-293`.
- Retry/error taxonomy: `withRetry` `:672-696` (default 4 attempts), `fetchStreamWithRetry` `:2170-2190` (3 attempts), classifiers `formatProviderFailure:630-648`, `isRetryableProviderFailure:602-607`, `isNoRetryProviderError:594-597`.
- Circuit breaker: `lib/seoFactory/circuitBreaker.ts:5` union is `'xai'|'openai'|'nvidia'|'groq'|'anthropic'` (no DeepSeek).

### 2.4 Where provider/model is selected (all current paths)

- **UI catalog / picker:** `lib/contentAiCatalog.ts` — `StudioModelId = 'qwen3.6-27b'|'deepseek-v4-flash'|'grok-4.6'` `:23`, `StudioHostId='entrim'|'xai'` `:25`, all three defaults are Grok `:60-64`, `LANE_HOSTS` all `['xai','entrim']` `:71-76`, `STUDIO_MODELS` `:89-113` (DeepSeek row is Entrim-hosted `deepseek-ai/DeepSeek-V4-Flash` `:94-97`), `canonicalizePin` maps anything unknown to Grok `:151-155`, `parseStudioPin` fallback to Grok `:194-202`, `pinFor` fallback `GROK_PIN` `:204-209`. Component: `components/design/studio-model-host-select.tsx:26-80`; consumers `admin-content-studio.tsx:2208,2953,3088,4954`, `admin-command-center.tsx:2412`, `admin-inline-editor.tsx:1494`, `admin-seo-engine.tsx:655`.
- **Brief lane:** `lib/seoFactory/briefModel.ts` — fallback `entrim-deepseek` `:26`, default `grok` `:29`, `resolveBriefAiProvider:42-60` coerces every other pin to Grok, legs `:241-248`.
- **Discover engine pair:** `lib/seoEngine/engineAi.ts:37-46` — `ENGINE_LEAD_PROVIDER='entrim-qwen-27b'`, `ENGINE_COMPLEMENT_PROVIDER='entrim-deepseek'`, `enginePairReady():107-113` requires Entrim.
- **Review lanes:** `style-review/route.ts:4,19` pins `GROK_PIN` exclusively; `editorial-review/route.ts:48` uses `DEFAULT_REVIEW_PIN`; `author-revise/routeCore.ts:157-160,207-219` uses `DEFAULT_REVIEW_PIN` exclusively.
- **Reaudit:** `app/api/content-studio/reaudit/route.ts:345-467` still resolves Run BiOS/NVIDIA/Baseten/Parasail/Zai/AIHubmix pins.
- **Vault/settings/test:** `lib/aiKeyVault.ts:53-98` (`AI_PROVIDERS`: `grok`, `entrim-deepseek`, `entrim-qwen-27b`; `HOST_MODEL_OPTIONS` `:41-51`), `DEFAULT_PROVIDER_ORDER` `:106-108`; routes `app/api/seo-factory/ai-keys/route.ts` (GET/PUT/DELETE/`purge`), `ai-keys/settings/route.ts`, `ai-keys/test/route.ts` (live probe via `generateContentText`), `ai-keys/grok-oauth/route.ts`, `seo-factory/health/route.ts` (lists `listConfiguredContentProviders` `:39`), `content-studio/system-health/route.ts` (counts enabled vault rows `:36-40`).
- **Deploy-time policy:** `.github/workflows/deploy.yml` — secret sync env `:82-137`; per-secret retry `:167-192`; literal `put_secret CONTENT_AI_PROVIDER "entrim-qwen-27b"` `:245`; `XAI_API_KEY`/`XAI_MODEL` `:250-251`; `DEEPSEEK_API_KEY` `:252`; `ENTRIM_API_KEY`/`ENTRIM_BASE_URL` `:283-284`.
- **Deploy-time vault sync:** `scripts/sync-ai-vault.mjs:33-47` `SYNC_MAP` injects retired provider rows (`baseten-*`, `openai`, `aihubmix-glm-fast`, `parasail-*`, `nvidia-*`, `groq`, `gemini`, `openrouter`, `cloudflare-ai`, `custom`) and maps `DEEPSEEK_API_KEY → ['deepseek']` (a legacy pin, not the commissioned pin).
- **Legacy env declarations:** `env.d.ts:61-84` declares AIHubmix/Entrim/Parasail/Run BiOS envs but **not** `XAI_*` or `DEEPSEEK_*`.

### 2.5 Persistence, lineage, streaming, fencing (current)

- `content_jobs` already carries (from `20260914_content_studio_evidence_contract.sql:4-14`): `opportunity_id`, `contract_id`, `contract_version`, `contract_hash`, `evidence_hash`, `execution_stage`, `publication_phase`, `expected_revision_marker`, `requested_model`, `actual_model`. It does **not** have an `actual_provider` column; `ai_provider` is written as the *owner pin* (`persistContentJobCore.ts:197,223` via `resolveOwnerProviderPin`), and `audit_json` mirrors `model`, `ownerProvider`, `runtimeProvider` `:237-240`.
- Projections: `lib/seoFactory/jobColumns.ts:20-21,29-30,35-39,52-55` (`execution_stage`, `publication_phase`, `requested_model`, `actual_model`, `contract_*`, `evidence_hash`, `expected_revision_marker`, `deploy_sha`, `deployed_at`, `merged_at`).
- Stage transitions: `content_studio_stage_events` stores `from_stage/to_stage/actor/reason/input_hash/output_hash/attempt` (`20260914...sql:53-64`), writer `executionStages.ts:recordStageTransition:40`.
- Contract identity in execution: `contentStudioExecutionContext.ts:22-48` (`ContentStudioExecutionState` with `requestedModel`, contract identity, lease identity, publication digests), `assertContractProviderSelection:233`, `assertStrictOwnerTarget:244`.
- Contract→pipeline binding: `pipelineContract.ts:generationRequiresWritingContract:76-87`, `applyWritingContractToInput:89-165` (client copies must match contract), `resolvePipelineWritingContract:168`.
- Streaming: `generate-stream/route.ts:143-203` (15 s heartbeat `HEARTBEAT_MS:16`, `[DONE]` close), `pipelineStream.ts` event union `:50-59`, single persist door `:1838-1903`; SSE consumer `lib/seoFactory/sse.ts:consumeSseStream:24-55`.
- Fencing: `strictFence` `persistContentJob.ts:16-33`; `wrapMutation` `streamContentJobFence.ts:64-107`; `assertGitMutationLease` `githubContents.ts:14`; lease RPC `claim_content_studio_execution` (`20260915...sql:19-67`).
- RLS/least privilege already in force: evidence/contract/stage tables revoke `public, anon, authenticated`, grant only `service_role` (`20260914...sql:69-79`); contracts immutable `:81-97`; unique opportunity reservation index `:99-102`. `ai_provider_keys`/`ai_settings` have permissive `USING (true)` policies with admin gating at the route (`ai_provider_keys.sql:33-47`); that is existing accepted behavior and must not be weakened.

### 2.6 Confirmed divergences between current code and the commission

1. **Three live hosts, not two.** `LIVE_PROVIDER_LABELS` includes two Entrim families (`contentAiProviderCore.ts:163`); the commission names only xAI Grok and first-party DeepSeek.
2. **DeepSeek is not first-party-executable.** The only official-DeepSeek provider (`getDeepseekOfficialFlashProvider:1800`) is excluded from `orderedCompleters`/stream candidates; the selectable "deepseek-v4-flash" is Entrim-hosted (`contentAiCatalog.ts:89-98`).
3. **Legacy pins silently redirect.** `applyLiveProviderPolicy:186-197`, `canonicalizePin:151-155`, `resolveBriefAiProvider:56-59` all coerce legacy values to a default — the opposite of the required “require selection” behavior.
4. **No `actual_provider` persistence.** Requested/owner pin exists (`ai_provider`), actual model exists, actual provider does not.
5. **Contradictory comments/constants.** Header comment `contentAiProviderCore.ts:4-7` says Entrim+Grok; block comment `:136-159` says Entrim-only and Grok is OUT OF COMMISSION, while `:163` includes Grok. `_SPEC_OWNER_MODEL.md:19` says “unknown/legacy pin → Entrim”, code routes to Grok.
6. **Catalog/constant mismatch.** `DEEPSEEK_V4_FLASH_ID='deepseek-ai/DeepSeek-V4-Flash-0731'` (`contentAiCatalog.ts:42`) is unused; the DeepSeek row ships Entrim’s no-suffix id `:94-95`.
7. **Model-id canon hazards.** `canonicalizeDeepseekModelId:253-271` retargets bare/0731 ids to **Parasail** checkpoint constants; `canonicalizeDeepseekLaneModelId:280-293` likewise falls back to Parasail constants — a direct intermediary leak risk if reused for first-party DeepSeek.
8. **Deploy literal deliberately pins a retired-by-target host.** `deploy.yml:245` `put_secret CONTENT_AI_PROVIDER "entrim-qwen-27b"`.
9. **Style-review lane is Grok-only** (`style-review/route.ts:19`), so DeepSeek parity does not exist for that stage.
10. **Model-id confirmed (previously uncertainty).** The commission’s “DeepSeek V4.1 Flash” maps to upstream API model id `deepseek-flash`, confirmed 2026-09-15 by direct calls against `api.deepseek.com`: a successful `GET /v1/models`, a chat completion, and a tool-call completion (supervisor decision 1, §13). The repo ids are stale and are not used by the commissioned adapter: `DEEPSEEK_OFFICIAL_FLASH_MODEL='deepseek-ai/DeepSeek-V4-Flash-0731'` (`contentAiProviderCore.ts:310`) and `DEEPSEEK_V4_FLASH_ID` (`contentAiCatalog.ts:42`).
11. **`novita`, `requesty`, `token harbor` appear nowhere** in the repo (0 hits); “Vercel” appears only in build/output-dir and country-detection contexts (`scripts/seo-audit-guard.mjs:33-49`, `lib/countryDetection.ts:5-17`). No active code routes DeepSeek through them today; the risk to design against is future reintroduction and transitive routing via shared helpers.
12. **Additional retired-pin surfaces exist beyond the routes first catalogued.** `lib/seoEngine/llmVisibility.ts:347-365` registers retired audit engines (Entrim/Baseten/NVIDIA/AIHubmix/Parasail/Gemini/Groq/OpenAI) and executes them through `generateContentText` `:392,595`; `lib/seoEngine/knowledge.ts:482` and `lib/seoEngine/planner.ts:1164` pass provider pins; `scripts/probe-runbios-pipeline.ts` executes retired pins outside the Worker. The P2 boundary scan must prove the surface inventory is complete (design §3.8).

## 3. Target architecture

### 3.1 Commissioned provider set

Exactly two provider identities, expressed once in the new canonical registry:

| Pin (stable id) | Display | Transport | Credential source | Host lock |
|---|---|---|---|---|
| `grok` | Grok 4.6 | existing `lib/xaiGrokTransport.ts` (Responses API + SSE; OAuth or API key) | SuperGrok OAuth (`ai_settings xai_oauth_*`) → vault `grok` row → Worker secret `XAI_API_KEY` | `api.x.ai/v1`; the existing Grok subscription CLI-proxy fallback (`cli-chat-proxy.grok.com/v1`, `xaiGrokTransport.ts:16-17,57-69`) is retained only within Grok/xAI credential behavior — a transport fallback, never a provider selector |
| `deepseek-v41-flash` | DeepSeek V4.1 Flash (first-party) | new first-party adapter built on the existing OpenAI-compatible `openAiCompatibleComplete`/`openAiCompatibleStream` engine | vault `deepseek-v41-flash` row → Worker secret `DEEPSEEK_API_KEY` | hard-pinned `https://api.deepseek.com/v1`; no base-URL override accepted |

**Grok transport semantics (PR #204 review, final):** the retained CLI-proxy fallback is Grok’s own subscription endpoint (`cli-chat-proxy.grok.com/v1`) used when the public API rejects a SuperGrok/OAuth subscription token as a metered team key; it executes only with the same Grok/xAI credential, cannot select another model or provider, and is not a cross-provider fallback. It must never carry DeepSeek traffic, and the DeepSeek adapter cannot reach it. Tests in §11 prove both directions: no Grok-owned job touches `api.deepseek.com`, and no DeepSeek-owned job touches `api.x.ai` or the Grok proxy. The intermediary prohibition in §1 targets DeepSeek routing and retired/third-party hosts; it does not forbid this retained Grok transport path.

**DeepSeek identifier discipline — three distinct values, never conflated (decision 1):**

- **Display label:** `DeepSeek V4.1 Flash` (UI, health, docs only).
- **Stable internal provider pin:** `deepseek-v41-flash` (DB `ai_provider`, contracts, audit, registry identity, selection).
- **Upstream API model id:** `deepseek-flash` (sent verbatim in the request `model` field to `api.deepseek.com`; confirmed by direct `GET /v1/models`, chat completion, and tool-call completion on 2026-09-15).

A legacy pin value is any provider string that is not one of the two pins (including historical `entrim-*`, `nvidia-*`, `baseten-*`, `parasail-*`, `runbios-*`, `openai`, `cloudflare-ai`, `groq`, `gemini`, `openrouter`, `custom`, `zai-glm`, `aihubmix-*`, `deepseek`, `deepseek-flash`, `deepseek-pro`, `qwen*`, and GPT aliases). These are legacy *pin/selector* values: the bare string `deepseek-flash` stays non-executable as a pin even though it is the commissioned upstream *model id* — it is never selectable and is sent only by the `deepseek-v41-flash` adapter. Legacy pins are declarable in history and UI, but any attempt to execute them fails closed with a typed `ProviderSelectionRequiredError` (`409`, `execution_stage:'provider_selection_required'`) and **zero outbound provider requests**.

### 3.2 Canonical registry (`lib/contentAiRegistry.ts`, new)

One module owns provider identity for UI and all server/background paths:

```ts
export type CommissionedProviderPin = 'grok' | 'deepseek-v41-flash'
export interface CommissionedProvider {
  pin: CommissionedProviderPin
  label: string
  hostId: 'xai' | 'deepseek'
  apiModel: string                      // upstream API model id: 'grok-4.6' | 'deepseek-flash' (distinct from pin and display label)
  lanes: StudioLane[]                   // all four lanes for both providers
  streaming: boolean                    // true for both
  transport: 'xai-responses' | 'openai-compatible'
  baseUrl: string                       // literal; asserted before fetch
  baseUrlHost: string                   // 'api.x.ai' | 'api.deepseek.com'
  keyEnvs: string[]                     // ['XAI_API_KEY'] | ['DEEPSEEK_API_KEY']
  isConfigured(): boolean
}
export const COMMISSIONED_PROVIDERS: readonly CommissionedProvider[]
export const COMMISSIONED_PINS: readonly CommissionedProviderPin[]
export function isCommissionedPin(value: unknown): value is CommissionedProviderPin
export function assertCommissionedPin(value: unknown): CommissionedProviderPin
export function commissionedProvider(pin: CommissionedProviderPin): CommissionedProvider
export interface ContentProviderAdapter { /* one interface: complete(), stream(), isConfigured(), pin, model */ }
export function adapterFor(pin: CommissionedProviderPin, opts: ContentAiOptions): ContentProviderAdapter
export function legacyProviderDisposition(value: string): { legacy: true; executable: false; reason: string }
```

Rules:

- `contentAiCatalog.ts`, `contentAiProviderCore.ts`, `briefModel.ts`, `engineAi.ts`, `aiKeyVault.ts`, health routes, reaudit, and the UI import identity from the registry only. A new architecture-boundary test forbids string-literal provider pins and vendor host literals in execution paths outside the registry + transport modules.
- The registry has no “auto” provider and no cross-provider cascade. `'auto'`/empty resolution maps to the lane default pin **with `pinSource:'lane_default'` recorded**, never to an unrecorded fallback.
- `canonicalizePin` semantics change: unknown ⇒ `{ kind:'needs_selection', legacyValue }`, not Grok.
- Existing `LIVE_*` exports are removed or redefined as registry-derived aliases so no stale list can diverge.
- **No retired provider transport is registrable or route-reachable after P2, whether or not dead-code cleanup has happened:** `adapterFor` accepts commissioned pins only; the runtime registration proof asserts the registered completer/stream-candidate set equals `COMMISSIONED_PINS` under every env (default, `CONTENT_AI_ALL_PROVIDERS=1` break-glass, retired keys present, retired `CONTENT_AI_PROVIDER=entrim-qwen-27b`); every selector, route, vault/test/health probe, and deployment declaration is registry-derived. Retired modules may remain in the tree until the P3 purge but must be unreferenced by execution paths (boundary test) and unreachable at runtime (registration proof). Dead-code deletion is cleanup, never a safety dependency.

### 3.3 Provider state machine (per job / per execution)

Ownership states (persisted in contract + job):

```
unselected ──explicit selection──▶ selected(commissioned pin)
needs_selection(legacy value) ──operator re-selection──▶ selected
selected ──claim_content_studio_execution──▶ leased(owner, attempt, lease_expires_at)
leased ──stage work──▶ executing(stage, provider, model)
executing ──success──▶ stage_succeeded ──next stage──▶ executing
executing ──typed failure──▶ failed(failure_class, provider, model, attempt)
failed ──bounded same-provider retry──▶ executing            (retry cron only)
failed ──exhausted attempts──▶ terminal_failed               (operator action required)
leased/executing ──lease lost──▶ interrupted(fenced failure persisted)
```

Invariants:

1. Every execution carries exactly one commissioned pin from contract/job; `actual_provider` is set only by the provider that produced the accepted artifact.
2. A retry re-reads the persisted owner pin; it never re-resolves a default.
3. Cross-provider fallback is impossible inside a job. The only two-provider construct is the Discover `engine-pair` (`grok` + `deepseek-v41-flash`), whose two legs are both explicitly declared and recorded in `EnginePairMeta` (`engineAi.ts:63-72`); it requires **both** providers configured (`enginePairReady()`), else it fails closed as `config` — no single-lead degradation.
4. Legacy pins never enter `leased`; they stop at `needs_selection` with `provider_selection_required`.
5. Lease/fence semantics are PR #200 semantics, unchanged: `claim/renew/release` RPCs, `strictFence`, `wrapMutation`, `assertGitMutationLease`.
6. No cross-provider fallback or transport crossover, in either direction: a `grok`-owned job never fetches `api.deepseek.com`; a `deepseek-v41-flash`-owned job never fetches `api.x.ai` or the Grok subscription proxy. Failures retry the same provider or fail (§6); the retained Grok CLI-proxy fallback is same-provider (Grok), same-credential, and cannot select another model/provider.
7. Post-P2 non-registrability is independent of code cleanup: even while retired transport modules still exist, no registry, route, vault/test/health probe, or deploy declaration can register, select, or execute them; the runtime registration proof and boundary test (P2) enforce this before and after the P3 purge.

### 3.4 End-to-end sequence (per commissioned provider)

1. **Discover/knowledge** — `gsc/suggestions`/`keywords/discover`/`opportunities/score` produce evidence-backed candidates; engine pair records `leadModel`/`complementModel` in `EnginePairMeta`; legacy pins in UI return `needs_selection`.
2. **Brief/contract** — `suggest-brief` runs `startSuggestBriefContract` → evidence persistence (`content_studio_evidence_items`) → `finalizeSuggestBriefContract` persists `WritingContractV2` with `requestedProvider` (pin: `grok` | `deepseek-v41-flash`) + `requestedModel` (registry `apiModel`: `grok-4.6` | `deepseek-flash`) and `attachWritingContractToJob` writes contract identity + `requested_model`/owner `ai_provider`.
3. **Draft** — `generate`/`generate-stream` resolve the contract (`pipelineContract.ts`), `prepareStrictExecution` claims the lease, `assertContractProviderSelection` re-asserts the pin is commissioned and equals the contract owner, adapter executes once (exclusive), and `persistContentJob` writes fenced results with `actual_provider`/`actual_model` on success.
4. **Review/revision** — `editorial-review`/`style-review`/`author-revise` accept the contract owner pin through the registry (both providers selectable), run exclusive, and persist bounded revision state under the lease (`markBoundedRevisionRunning/…`).
5. **Approval** — `jobs PATCH approve|reship|merge_pr` stays contract-bound and fenced (`strictManualPublication.ts`); approval manifest gains `providerPin`/`model` inside the existing manifest (no new proof semantics; renderer/publication proof unchanged).
6. **Publishing** — `shipContent` + `assertGitMutationLease`; PR created with the exact approved head SHA; branch/path/PR/`deploy_sha` recorded.
7. **GitHub observation** — `deployMonitor.pollChecks` and the PR webhook observe the exact SHA; `publicationMonitor.reconcilePublicationDeployment` matches the authorized deploy workflow run and artifact.
8. **Live verification** — `liveVerify.verifyLiveUrl` proves marker/body/canonical/indexability on the live URL; `publication_phase` transitions `pr_open → checks_passed → deployment_pending → deployed` and `live_verified_at` only on full evidence.
9. **Retries/recovery** — retry cron and reconcile cron act only on persisted owner/pin; provider failures retry the **same** provider with the existing bounded ladder; a provider that cannot serve raises `ai_provider` and stops (no substitution).

### 3.5 First-party DeepSeek transport (hard constraints)

- New adapter module (registry transport) calls `openAiCompatibleComplete`/`openAiCompatibleStream` with a provider record built **only** from registry constants: `baseURL: 'https://api.deepseek.com/v1'`, `apiKey: resolveDeepseekFirstPartyApiKey()`, `model: COMMISSIONED_PROVIDERS['deepseek-v41-flash'].apiModel` (literal `deepseek-flash`), `maxTokensCap` bounded.
- **No stale ids:** the adapter does not reuse `DEEPSEEK_OFFICIAL_FLASH_MODEL='deepseek-ai/DeepSeek-V4-Flash-0731'` (`contentAiProviderCore.ts:310`) or any Entrim-hosted no-suffix id; `deepseek-flash` is the only model id sent upstream.
- **No `DEEPSEEK_BASE_URL` honor**: unlike `deepseekOfficialBaseURL():1782-1785`, the commissioned adapter does not consult env/vault base URLs. Additionally, `assertCommissionedDestination(baseURL)` throws `destination_violation` unless `new URL(baseURL).hostname === 'api.deepseek.com'`.
- **No Parasail canon**: the adapter must not call `canonicalizeDeepseekModelId`/`canonicalizeDeepseekLaneModelId` (they substitute Parasail constants `:264,269-292`). It uses the registry constant verbatim.
- Streaming and non-streaming parity: `stream()` uses `openAiCompatibleStream` with the same record; when the upstream does not stream, the existing `completeAsStream` synthesis path in the core remains the mechanism, recorded as `streamMode:'synthesized'`.
- Refusal/safety, empty, and malformed responses map to the existing typed classes (`isUnusableGenerationFailure:624-627`, `isRetryableProviderFailure:602-607`) plus the new `destination_violation` class.
- **No cross-fallback:** this adapter never falls back to Grok, and Grok jobs never fall back to it; Grok endpoints and the Grok subscription proxy are unreachable from this adapter. Combined with §3.3 invariant 6, Grok↔DeepSeek cross-fallback is impossible and test-proven (§11).

### 3.6 Selector behavior (single entry point)

One selector, used everywhere:

```ts
resolveExecutionProvider({ requestedPin, lane, existingJob }):
  | { kind:'commissioned', pin, model, pinSource:'explicit'|'lane_default'|'contract' }
  | { kind:'needs_selection', legacyValue, reason }
```

- Explicit commissioned pin ⇒ `commissioned` (exclusive).
- Missing/`'auto'`/`''` ⇒ lane default pin (Grok 4.6 for all lanes) **only when the job has no requested provider**; `pinSource:'lane_default'`, persisted as the request’s provider and recorded in audit. A job holding any persisted legacy value never takes this path — it is `needs_selection` and requires explicit re-selection.
- Legacy value ⇒ `needs_selection`; routes return `409` with the legacy value and the two valid choices; no outbound request is made.
- Contract-bound work always passes `pinSource:'contract'`; a client-supplied pin that conflicts with the contract keeps failing as today (`pipelineContract.ts:100-128`).

### 3.7 UI parity

- `studio-model-host-select.tsx` lists exactly two models in all four lanes (`draft|brief|review|command`), hosts `xai` and `deepseek`. This catalog/UI release is part of the P2 commission flip (§8, Tasks 3–7) and must never ship before the first-party DeepSeek adapter and route resolution are active — otherwise a selectable DeepSeek row would not be executable.
- Saved legacy pins render a “Reselect provider” state (no preselected Grok, no hidden default); the job cannot be started until a commissioned pin is chosen, which writes a new contract version or an explicit override that the server accepts only for non-contract legacy work.
- `editor-metrics-strip.tsx` review pin derives from the job/contract pin, not a Grok constant.
- Vault panel shows two provider cards (`grok`, `deepseek-v41-flash`); model dropdowns come from the registry; Entrim cards are gone from selection (rows, if present, are retired in the vault UI, secrets untouched). The vault UI release is part of the same atomic P2 flip — it may never expose a selection before the executor/selector work is active.

### 3.8 Server/background parity list (must all use the selector)

`briefModel.generateBriefText`, `engineAi.generateEngineText/PairText`, `pipeline.ts`, `pipelineStream.ts`, `reaudit`, `style-review`, `editorial-review`, `author-revise`, `suggest-brief/coreImpl`, `suggest-keywords`, `contentStudioPipelineCore` assertions, retry/reconcile crons (via `runStoredContentJob`), `ai-keys`, `ai-keys/settings`, `ai-keys/test`, `ai-keys/grok-oauth`, `seo-factory/health`, `content-studio/system-health`, the vault UI (`ai-key-vault-panel.tsx`), `admin-content-studio` fetches, and every additional module the boundary scan proves can pass a provider pin (e.g. the `lib/seoEngine/llmVisibility.ts` audit matrix, `lib/seoEngine/knowledge.ts`, `lib/seoEngine/planner.ts`).

Completeness is part of the P2 atomic flip: the boundary scan enumerates every `app/`/`lib/` module (plus provider-capable scripts such as `scripts/sync-ai-vault.mjs` and `scripts/probe-runbios-pipeline.ts`) that can select, inject, test, register, or execute a provider. Each is either migrated to the registry or fenced by a fail-closed test in the same flip. A surface discovered after the flip is a P2 defect, not a follow-up task.

## 4. Data model

### 4.1 Reused columns (no change)

`content_jobs.ai_provider` remains the requested/owner pin (documented). `requested_model`, `actual_model`, `execution_stage`, `publication_phase`, `expected_revision_marker`, `contract_id/version/hash`, `evidence_hash`, `attempt_count`, `last_attempt_at`, `next_attempt_at`, `last_failure_kind`, `deploy_sha`, `merged_at`, `deployed_at`, `lineage` (jsonb), `audit_json`, `event_log` stay authoritative. `content_studio_evidence_items`, `content_studio_writing_contracts`, `content_studio_stage_events` are unchanged.

### 4.2 New additive migration (unapplied)

`supabase/migrations/20260915_content_studio_provider_parity.sql`:

```sql
alter table if exists public.content_jobs
  add column if not exists actual_provider text,
  add column if not exists provider_error_class text;

comment on column public.content_jobs.ai_provider is
  'Requested/owner provider pin. Commissioned values: grok | deepseek-v41-flash. Legacy values are historical and non-executable.';
comment on column public.content_jobs.actual_provider is
  'Commissioned pin that produced the accepted artifact; null until first successful provider completion.';
comment on column public.content_jobs.provider_error_class is
  'Granular provider failure class: auth|quota|rate_limit|timeout|malformed|empty|unavailable|destination_violation|unusable_generation|selection_required.';
```

- Least privilege: no new grants (column inherits `content_jobs` table grants); no RLS change; no change to any PR #200 object.
- Reversible: the migration file carries a documented reverse block (`alter table public.content_jobs drop column if exists provider_error_class; drop column if exists actual_provider;`), and a review copy lands at `tests/sql/content-studio-provider-parity.sql` exactly mirroring the PR #200 review pattern (`tests/sql/content-studio-execution-lease.sql`).
- Not applied by anyone except GPT-5.6 Sol, after separate approval and a production-state check.

### 4.3 Persisted lineage without secrets/prompts

`audit_json` (existing pattern `persistContentJobCore.ts:236-255`) gains:

```json
{
  "provider": { "requested": "deepseek-v41-flash", "actual": "deepseek-v41-flash",
                "requestedModel": "deepseek-flash", "actualModel": "deepseek-flash",
                "pinSource": "contract", "attempts": [ { "stage": "draft", "attempt": 1,
                "outcome": "ok|error", "failureClass": "timeout", "at": "..." } ] }
}
```

No API keys, tokens, prompts, or completion bodies are persisted; stage events keep only hashes (`input_hash`/`output_hash`), matching `executionStages.ts:29-38`. Failure text keeps the existing truncation discipline (`formatProviderFailure:630-648`).

## 5. Security

- **Secrets never leave the Worker boundary:** vault overlay precedence (`env() :489-501`) > Worker secrets; responses masked (`ai-keys` route returns masked keys only); OAuth tokens in `ai_settings` (`xai_oauth_*`).
- **Destination pinning:** both commissioned adapters assert their literal host before fetch (`assertCommissionedDestination`); DeepSeek rejects any override that is not `api.deepseek.com`; Grok keeps the existing `xaiGrokTransport` base logic and its existing subscription CLI-proxy fallback, which stays within Grok/xAI credential behavior and executes with the Grok credential only.
- **No retired intermediary by construction:** only two adapters are registered; the registry boundary test fails any execution-path import of Entrim/NVIDIA/Baseten/Parasail/Run BiOS/OpenRouter/Requesty/Token Harbor/Novita/Vercel hosts or the Parasail canon helpers. The retained Grok subscription proxy is part of the Grok transport, not a provider intermediary, and is not treated as forbidden.
- **No cross-provider fallback:** provider failure never substitutes Grok for DeepSeek or DeepSeek for Grok; transports never cross (Grok ↔ `api.deepseek.com` is test-proven absent in both directions); the retained Grok CLI-proxy fallback is same-provider and cannot select or route to another model/provider.
- **Non-registrable retired transports (independent of cleanup):** after P2 no retired transport can be registered by the runtime or reached by any route/probe even while its module still exists; the runtime registration proof and boundary test enforce this before and after the P3 purge.
- **RLS/least privilege preserved:** evidence/contract/stage tables keep service-role-only grants and contract immutability; `ai_provider_keys` keeps its route-gated admin policy; new columns add no surface.
- **Fail closed:** unknown/legacy pins, missing keys, contract mismatch, lease loss, destination mismatch, and proof mismatch all stop execution with typed errors; no stage silently substitutes a provider.
- **Auditability:** requested/actual provider+model, pin source, attempt/stage, hashes, failure class, and publication/deployment lineage are all durable; secrets and prompt contents are not.

## 6. Failure semantics

| Class | Cause | Behavior |
|---|---|---|
| `selection_required` | legacy/non-commissioned pin | 409; `execution_stage='provider_selection_required'`; no outbound call; UI prompts re-selection |
| `config` | commissioned key missing / engine pair missing a key | fail fast; no retry; health shows unconfigured provider |
| `auth` | 401/403 from the provider | no retry; operator action (reconnect OAuth / rotate key) |
| `quota` | 402/429 with quota semantics | bounded same-provider retries per existing taxonomy (`isRetryableProviderFailure`), then `failed` + `ai_provider` |
| `rate_limit` | 429 transient | retry with existing backoff (`withRetry` / `fetchStreamWithRetry`) |
| `timeout` | deadline exceeded | retry ladder unchanged; `last_failure_kind='timeout'` |
| `malformed` / `empty` | unusable completion | retry once under existing rules; never substitute provider |
| `destination_violation` | adapter base URL not the literal host | hard fail (security defect); alert; no retry |
| `unusable_generation` | finish_reason length/reasoning-only | existing classifiers; stage-scoped recovery only |
| `lease_lost` / interrupted | SSE consumer close, heartbeat renewal failure | fenced failure persisted (`persistExecutionFailure`), no orphan writes |
| `github_*`, `cloudflare_deploy`, `compliance_gate`, `schema` | existing classes | unchanged PR #200 semantics (`last_failure_kind` closed set, `20260812_content_jobs_hardening.sql:114-134`) |

Retry policy: retry cron `BATCH_SIZE=1`, `MAX_ATTEMPTS=6`, backoff `min(360, 2^attempt*5)` + jitter (`content-studio-retry/route.ts:13-21`); reconcile cron stages only, `MAX_AUTOMATIC_ATTEMPTS=5`, `BACKOFF_MIN=[5,15,45,120,360]`. Retries always re-read the persisted pin; a provider failure never switches providers — and never switches transports: the retained Grok subscription-proxy fallback is same-provider Grok behavior, and DeepSeek has exactly one destination, `api.deepseek.com`.

## 7. Retirement matrix

| Provider value / route | Disposition | Enforcement |
|---|---|---|
| `grok`, `xai`, `supergrok`, `grok-4.6`, `grok-latest`, `grok-4` | Commissioned (canonical `grok`); existing transport retained, including its subscription CLI-proxy fallback within Grok/xAI credential behavior | Registry |
| `deepseek-v41-flash` (new; display “DeepSeek V4.1 Flash”; upstream model id `deepseek-flash`) | Commissioned | Registry |
| `entrim-deepseek`, `entrim-qwen-27b`, `entrim`, `entrim-deepseek-v4-flash*`, `qwen*` | Non-executable legacy → re-selection | Selector `needs_selection`; catalog/UI reselect; vault cards removed from selection |
| `nvidia-*`, `baseten-*`, `parasail-*`, `runbios-*`, `zai-glm`, `aihubmix-*` | Non-executable legacy → re-selection | Same |
| `openai`, GPT aliases, `cloudflare-ai`, `groq`, `gemini`, `openrouter`, `custom` | Non-executable legacy → re-selection | Same |
| `deepseek`, `deepseek-flash`, `deepseek-pro` as *pin/selector* values (historical) | Non-executable legacy → re-selection; the string `deepseek-flash` stays valid only as the upstream **model id** sent by the `deepseek-v41-flash` adapter, never as a selectable pin | Same |
| Routes: `orderedCompleters`/stream candidate registration of Entrim (and every other retired host) | Deleted from execution; nothing outside `adapterFor` may register | `contentAiProviderCore.ts` edit + runtime registration proof + boundary test (P2) |
| Routes: `briefModel` fallback leg Entrim | Deleted | `briefModel.ts` edit + tests |
| Routes: `engineAi` Entrim pair | Replaced by `grok`+`deepseek-v41-flash` pair | `engineAi.ts` edit + tests |
| Routes: `reaudit` legacy pin table | Replaced by registry resolution | `reaudit/route.ts` edit |
| Routes: `llmVisibility` audit-engine matrix (Entrim/Baseten/NVIDIA/AIHubmix/Parasail/Gemini/Groq/OpenAI pins) | Replaced by registry resolution; retired candidates removed | `llmVisibility.ts` edit + tests |
| Routes: style/editorial/author-revise Grok-exclusive constants | Both providers selectable (explicit) | Route edits + tests |
| Routes: `knowledge.ts`/`planner.ts` provider-pin pass-through | Registry resolution; legacy pins fail closed | Edits + boundary test |
| UI: `LANE_HOSTS`, `STUDIO_MODELS`, picker, `editor-metrics-strip` | Two providers only; reselect state | `contentAiCatalog.ts` + components |
| Vault: `AI_PROVIDERS` Entrim rows, `HOST_MODEL_OPTIONS.entrim` | Removed from selection; **rows/secrets retained** | `aiKeyVault.ts` edit |
| Vault/settings order (`ai_settings.provider_order`, `ai-keys/settings`) | Legacy entries readable but non-selectable; validation is registry-only | `aiKeyVault.ts` + settings route edits inside P2 |
| Deploy: `CONTENT_AI_PROVIDER="entrim-qwen-27b"` literal | Removed in the P2 atomic flip; replaced by the commissioned registry default (`grok`, literal) or omitted (supervisor-confirmed) | `.github/workflows/deploy.yml` edit inside P2 (code change; no deploy) |
| Deploy: secret sync for retired Content Studio hosts (Entrim/NVIDIA/Baseten/Parasail/AIHubmix/OpenAI/Custom) | Injection stops in P2; stored secret values are **not** deleted | `.github/workflows/deploy.yml` edit inside P2; deletion §7.1 |
| Deploy: vault sync (`scripts/sync-ai-vault.mjs` `SYNC_MAP`) | Retired provider rows no longer injected; `DEEPSEEK_API_KEY` maps to `deepseek-v41-flash`; existing rows retained | Script edit inside P2; deletion §7.1 |
| Dead transport code for other hosts | Inert after P2 (non-registrable, no execution-path import, no route/probe reachability); deleted only as P3 cleanup | Boundary test + runtime registration proof (P2), then dead-export scan (P3) |
| Provider-capable scripts (`scripts/probe-runbios-pipeline.ts`) | No working retired-provider execution path; deleted or converted to fail-closed commission-only in P3 | Boundary scan (P2) + P3 edit |
| Non-Content-Studio Entrim automations (`.github/workflows/marketplace-copy-rewrite*.yml`) | Outside the Content Studio provider commission; cannot select or execute a Content Studio provider; flagged for separate product review | Not touched by this program |
| Historical `ai_provider` values, contracts, audit, stage events | Retained, read-only | No migration deletes history |
| Secrets (`ENTRIM_API_KEY`, NVIDIA/Baseten/Parasail/OpenAI/AIHUBMIX/GROQ/GEMINI/OPENROUTER/CUSTOM, vault rows) | **Not deleted here** | §7.1 checklist, separate approval |

### 7.1 Separately approved secret-retirement checklist (documented, not executed; 30 consecutive zero-use days plus its own supervisor approval — decision 6)

P2 already stops all retired-provider configuration *injection* (deploy policy literal, retired-host secret sync, deploy-time vault sync) and makes retired providers non-executable; P2 deletes no stored secret value. This checklist governs deleting the stored secrets/rows themselves.

1. Preconditions: zero execution references to the host in main; 30 consecutive days with zero `ai_provider`/`actual_provider` values and zero provider-error events naming it; supervisor sign-off recorded on the PR.
2. Remove from new-selection surfaces first (vault cards, catalog, settings order) — already covered by this program.
3. Then delete the stored Worker secret values themselves via an approved deploy-workflow change (never via dashboard) — P2 has already stopped injecting them, so this is the deletion step; verify `seo-factory/health` and a canary generation per remaining provider after removal.
4. Then remove GitHub repo secrets (Supervisor-approved PR to `.github/workflows/deploy.yml`, linked evidence).
5. Vault history (`ai_provider_keys` rows) is retained unless the owner explicitly approves deletion; if approved, export a masked audit row first.
6. Rollback for each removal step: restore secret from the owner’s vault, no code change required (registry reads by env name).
7. Never delete `content_jobs`/contract/audit history in any step.

## 8. Rollout and rollback

Phased, each phase its own short-lived branch/PR from then-current main, all merged only by GPT-5.6 Sol:

- **P0 (this document):** design + plan on `architecture/content-studio-deepseek-parity-20260915`; no code.
- **P1 Registry types + unit tests (strictly internal/dark, no behavior change):** add `lib/contentAiRegistry.ts` (identity, selector implementation, typed errors, destination assertion) and its unit tests only; inert wiring (internal exports, test scaffolding) is allowed. P1 **MUST NOT** alter any production selector, picker/catalog rows, persisted pins, route behavior, or executable provider registration; no production module imports the registry yet. P1 **preserves current production behavior exactly**: no execution registrar is edited, `applyLiveProviderPolicy` keeps today’s redirect, no route rejects legacy pins yet, and the UI still shows today’s rows. P1 unit tests are scoped to registry semantics — catalog/UI expectations, route-level legacy rejection, and no-fallback stay RED as the frozen P2 contract and are **not** claimed or active in P1. Production provider execution and UI selection behavior are identical before and after P1.
- **P2 Commission flip (single atomic behavioral activation; Tasks 3–7):** one revertible commit range/PR, merged only after the focused P2 tests are green, activating in this order: (1) first-party DeepSeek adapter + Grok/DeepSeek registration via `adapterFor`, with the runtime registration proof that only `COMMISSIONED_PINS` are registered under every env; (2) fail-closed selector/route boundaries — delete the silent-redirect path so legacy pins fail closed with `selection_required` and zero outbound requests, remove Entrim (and every other retired host) from cascade/stream/pair/audit-matrix, route brief/engine/review/reaudit resolution through the registry, require both providers for the engine pair; (3) two-provider catalog/UI release (picker rows in all lanes, legacy reselect UX, persisted-pin semantics); (4) vault/settings/test/health routes and vault UI restricted to the two pins; (5) deployment/runtime declarations — `.github/workflows/deploy.yml` no longer injects the retired `CONTENT_AI_PROVIDER=entrim-qwen-27b` literal (commissioned default or omitted) and no longer syncs retired-host provider configuration, `scripts/sync-ai-vault.mjs` injects only commissioned rows, `env.d.ts`/`wrangler.toml` declare the commissioned set, the review workflow runs the new suites; (6) `actual_provider`/`provider_error_class` persistence. No subset may land while a DeepSeek selection is exposed without its registered executor, while legacy selectors/UI/probes remain executable, or while any retired provider configuration remains injected or effective. **After P2, no retired provider transport can be registered or route-reachable, even if dead-code cleanup is deferred indefinitely** — the boundary test and runtime registration proof enforce this at P2, not at P3. Secret values are not deleted in P2 (§7.1).
- **P3 Dead-code purge + docs (cleanup only; not a safety dependency):** delete now-unreferenced retired transports/modules/provider-capable scripts after the boundary test proves zero execution-path references; append the docs audit. The post-P2 non-registrability and route-unreachability guarantees already hold without this deletion; it removes inert code only. Keep history/secrets.
- **DB:** the migration may be merged unapplied but is never applied without separate supervisor approval (decision 7); until then all new-column code paths are written to be absent-column tolerant exactly like PR #200 (`persistContentJobCore.ts:337-347` compat retry) or gated on a feature probe.

Rollback for every phase: revert the code PR (no data migration applied), redeploy via the official workflow; if a phase shipped with the DB column applied, the column is additive and nullable so code revert needs no schema rollback. If a canary fails, set `CONTENT_AI_PROVIDER` back to the last good **commissioned** pin via the approved deploy workflow, and re-select open jobs explicitly (never silent redirect, never a retired value).

## 9. Observability

- **Provider health:** `seo-factory/health` lists exactly the two registry providers with configured state and a live probe per provider; `system-health` counts keys without values.
- **Per-stage lineage:** `content_studio_stage_events` + `audit_json.provider.attempts` (stage, attempt, outcome, failureClass) answer “which provider/model served which stage and why it failed” without prompts.
- **Job fields:** `ai_provider` (requested), `actual_provider`, `requested_model`, `actual_model`, `execution_stage`, `publication_phase`, `last_failure_kind`, `provider_error_class`, `deploy_sha`/`merged_at`/`deployed_at`.
- **Metrics to report in the program PR:** legacy-pin rejection count (must be >0 in tests, 0 silent executions in production), retired-provider registration/selection attempts (must be 0 under every env, including break-glass), DeepSeek vs Grok success ratio per stage, retry exhaustion rate, lease-lost count, destination-violation count (must be 0).
- **Alerts:** destination_violation, lease-lost, `actual_provider != ai_provider`, and any observed attempt to register/select a retired provider (which must be impossible after P2) are priority-1 runtime alerts (severity, not phase P1); they indicate a security/fencing defect.

## 10. Acceptance criteria

1. `lib/contentAiRegistry.ts` is the only provider identity source; an architecture test fails if execution paths contain non-registry pin literals or vendor host literals.
2. Exactly two pins are selectable and executable: `grok`, `deepseek-v41-flash`; Entrim is absent from cascade, stream candidates, pair, catalog, vault selection, and deploy literals. No retired transport is registrable or route-reachable after P2 even before dead-code deletion: the runtime registration proof shows registered executors/candidates equal `COMMISSIONED_PINS` under every env (including `CONTENT_AI_ALL_PROVIDERS=1` and retired `CONTENT_AI_PROVIDER`), and the boundary test proves zero execution-path imports/references to retired transports.
3. A legacy pin submitted to any execution route returns `409 ProviderSelectionRequiredError` + `execution_stage='provider_selection_required'` and makes zero outbound provider requests (fetch-spy test).
4. DeepSeek adapter fetches only `api.deepseek.com`, sends model id `deepseek-flash` verbatim, and cannot be redirected by base-URL overrides; override attempts are ignored and `destination_violation` is raised if the host ever differs (test). This hard-pin and the pin/model distinction (`deepseek-v41-flash` vs `deepseek-flash`) are unchanged by revision 4.
5. No cross-provider fallback: a single-pin job never calls the other provider under any failure (fetch-spy matrix over auth/quota/timeout/empty); Grok and DeepSeek never cross-fallback; Grok’s retained CLI-proxy fallback stays within Grok/xAI credential behavior and cannot select another model/provider; DeepSeek traffic is `api.deepseek.com` only.
6. Full pipeline parity for a DeepSeek-owned job through brief → draft → review → revision → approval → publication → deploy observation → live verification with deterministic fakes, plus one supervisor-approved live canary.
7. Persistence includes requested/actual provider+model, stage/attempt, hashes, failure class, and publication/deployment lineage for both providers; no secret/prompt content persisted (test).
8. PR #200 guarantees remain green: leases/fencing, strict fences, RLS grants/immutability, renderer boundary, publication proof (`tests/sql/content-studio-execution-lease.sql`, the 18-suite focused CI list in `.github/workflows/content-studio-review.yml:53-54`).
9. New migration is additive, least-privilege, reversible, review-copied under `tests/sql/`, and **unapplied**; all code paths work with and without it.
10. UI shows both models in all four lanes; legacy saved pins require explicit reselection; no hidden default.
11. `git diff --check`, focused jest, `tsc --noEmit`, full jest, lint attempt, and `npm run build` all pass on the final head SHA.
12. GPT-5.6 Sol approves scope, readiness, commits, PR, merge, DB application, and production verification in writing; nothing in this program was self-approved.
13. Vault/settings/test/health routes and the vault UI are restricted to the two pins: legacy vault rows are readable-but-unselectable and never probed; `ai-keys/test` probes only the commissioned adapters; deploy-time vault sync injects only commissioned rows.
14. Deployment/runtime declarations (`deploy.yml`, `env.d.ts`, `wrangler.toml`) cannot inject or select a retired provider after P2: `CONTENT_AI_PROVIDER` carries the commissioned default (or is omitted), no retired-host secret sync remains, and the deployed-configuration surface matches the registry exactly.

## 11. Testing strategy

- Unit/contract (new): `tests/content-studio-provider-parity.test.ts`, `tests/deepseek-first-party-transport.test.ts`, `tests/provider-registry-boundary.test.ts`, `tests/provider-registration-proof.test.ts`, `tests/grok-deepseek-no-cross-fallback.test.ts`, `tests/content-studio-provider-legacy-rejection.test.ts`.
- Rewritten to target semantics: `tests/content-ai-catalog.test.ts`, `tests/brief-model-policy.test.ts`, `tests/live-provider-policy.test.ts` (retired), `tests/entrim-provider.test.ts` (becomes rejection proof), `tests/engine-ai-grok-fallback.test.ts`, `tests/content-ai-auto-provider.test.ts`.
- Preserved untouched as regression: all PR #200 suites listed in `.github/workflows/content-studio-review.yml:53-54` and the SQL lease test `:51`.
- Post-P2 non-registrability is proven twice: statically (`tests/provider-registry-boundary.test.ts` — zero execution-path imports/references of retired transports and host literals, green before and after the P3 purge) and at runtime (`tests/provider-registration-proof.test.ts` — registered completers/stream candidates equal `COMMISSIONED_PINS` under default, break-glass, retired-key, and retired-`CONTENT_AI_PROVIDER` envs; `listConfiguredContentProviders` returns exactly the two registry providers).
- Grok semantics and cross-fallback are proven explicitly (`tests/grok-deepseek-no-cross-fallback.test.ts`): fetch-spy matrix over auth/quota/rate_limit/timeout/empty/destination_violation shows no `api.deepseek.com` fetch from Grok-owned jobs and no `api.x.ai`/`cli-chat-proxy.grok.com` fetch from DeepSeek-owned jobs; the retained Grok CLI-proxy fallback stays same-provider/same-credential and selects no other model/provider.
- Vault/selection/deployment surfaces: retirement rejection tests cover `ai-keys` (PUT/validate), `ai-keys/settings`, `ai-keys/test`, and `health`; deploy-declaration greps/tests prove `deploy.yml`/`env.d.ts`/`wrangler.toml`/`sync-ai-vault.mjs` cannot inject a retired provider.
- Commands (exact) in the companion plan; no live provider call in jest, and no production write anywhere.

## 12. Non-goals

- No change to publication proof, renderer, evidence hashing, lease RPC semantics, RLS model, or retry cadence.
- No deletion of secrets, vault history, or job history in this program.
- No new provider beyond the two commissioned pins.
- No removal or rework of the retained Grok transport mechanism (its existing subscription CLI-proxy fallback included), beyond the registry/identity and no-cross-fallback constraints above.
- No migration application, no deploy, no production verification by the executor.

## 13. Supervisor decisions (final, 2026-09-15)

Set by GPT-5.6 Sol after Task 0. They are final for this architecture; the program does not re-ask, re-gate, or request confirmation of them. Items 8–11 are the PR #204 review corrections (2026-09-15) and are equally final.

1. **DeepSeek identifiers — confirmed.** Display label **DeepSeek V4.1 Flash**; stable internal provider pin **`deepseek-v41-flash`**; upstream API request model **`deepseek-flash`**. Evidence: successful direct `GET /v1/models`, a chat completion, and a tool-call completion against `api.deepseek.com` (2026-09-15). The registry freezes `apiModel: 'deepseek-flash'` for that pin; bare `deepseek`/`deepseek-flash`/`deepseek-pro` remain non-executable as *pins*.
2. **Lane defaults.** Grok 4.6 remains the default for all lanes **only when a job has no requested provider**; resolution records `pinSource:'lane_default'`. Legacy persisted values never default and require re-selection.
3. **Discover engine pair.** Requires both Grok 4.6 and `deepseek-v41-flash`; fails closed (`config`) when either is unavailable. No single-lead degradation.
4. **Selectability.** DeepSeek must be selectable for all relevant brief/draft/review/revision/command stages; there is no Grok-only style review.
5. **Base URL.** The first-party DeepSeek base is exactly `https://api.deepseek.com/v1`; no `DEEPSEEK_BASE_URL` and no vault `base_url` override for this provider.
6. **Secret retirement.** Removal of retired secrets requires the 30-consecutive-day zero-use prerequisite in §7.1 and is a separate approval; it is not part of this program.
7. **Migration.** `20260915_content_studio_provider_parity.sql` may be merged unapplied but is never applied without separate supervisor approval.
8. **(PR #204 review) P2 atomicity.** P2 is one atomic commission flip covering every surface that can select, inject, test, or execute a provider: adapter/registrations, fail-closed routes, catalog/UI, vault/settings/test/health routes and vault UI, and deployment/runtime declarations. No P2-afterward state may leave `deploy.yml` injecting `CONTENT_AI_PROVIDER=entrim-qwen-27b` or any retired provider configuration injected/effective. Task 6/Task 7 work is sequenced inside the atomic P2 flip (Tasks 3–7 land together). Secret deletion remains §7.1, separately approved and out of scope.
9. **(PR #204 review) Non-registrable retired transports.** After P2, no retired provider transport can be registered or route-reachable even if dead-code cleanup happens later; the boundary test and runtime registration proof are the enforcement, not the P3 deletion.
10. **(PR #204 review) Grok transport semantics.** The existing xAI Grok transport is authorized to remain; it is not an additional AI provider and not a cross-provider fallback. Its existing CLI-proxy fallback (`cli-chat-proxy.grok.com/v1`), if retained, stays within Grok/xAI credential behavior and cannot select or route to another model/provider. Scope/test requirement: Grok and DeepSeek never cross-fallback, and DeepSeek remains `api.deepseek.com` only. The intermediary prohibition does not apply to the retained Grok transport path.
11. **(PR #204 review) DeepSeek hard-pin unchanged.** Decision 1 stands as written: pin `deepseek-v41-flash`, upstream model id `deepseek-flash`, base `https://api.deepseek.com/v1` only, no `DEEPSEEK_BASE_URL`/vault override. Revision 4 does not alter it.
