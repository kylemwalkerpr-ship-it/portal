# Content Studio — current runtime provider truth (P2/P3 handoff)

**Date:** 2026-09-16
**Worktree:** `/Users/phantomdarne/Documents/GitHub/yousafe-portal-worktrees/content-studio-provider-parity-p2`
**Branch:** `feature/content-studio-provider-parity-p2-20260915`
**Accepted starting checkpoint SHA:** `b54e86c77bbe2f3a4497c2825f13097dda53e1ff` (P2 commission flip; unchanged by the P3 cleanup)
**Status:** P3 cleanup complete in the working tree. **Uncommitted, unpushed, undeployed.** No production canary or deployment was performed.

This is the current runtime-truth handoff. The historical narrative handoffs
(`docs/Content_Studio_Grok_Handoff_2026-09-05.md`) are preserved as history and
are superseded by this document. `CONTENT_STUDIO_HANDOFF.md` at the repository
root is an older 2026-07/09 activation handoff whose "Entrim fallback" runtime
block is stale; it was out of this cleanup's scope and was not rewritten.

## 1. Executable / selectable Content Studio providers

Exactly two provider pins are executable and selectable for Content Studio:

| Pin (stable internal id) | Display | Host / transport | Upstream API model id | Credential |
| --- | --- | --- | --- | --- |
| `grok` | Grok 4.6 | Retained xAI transport, `https://api.x.ai/v1` (Responses API + SSE) | `grok-4.6` (overridable by a real xAI model id) | SuperGrok OAuth (`ai_settings xai_oauth_*`) → vault `grok` row → Worker secret `XAI_API_KEY` |
| `deepseek-v41-flash` | DeepSeek V4.1 Flash | First-party DeepSeek, hard-pinned `https://api.deepseek.com/v1` | `deepseek-flash` (sent verbatim) | vault `deepseek-v41-flash` row → Worker secret `DEEPSEEK_API_KEY` |

DeepSeek identifier discipline: the pin `deepseek-v41-flash`, the display label
`DeepSeek V4.1 Flash`, and the upstream model id `deepseek-flash` are three
distinct values and must never be conflated. The bare string `deepseek-flash`
is never a selectable pin.

The first-party DeepSeek adapter (`lib/contentAiRegistry.ts` → `adapterFor`)
builds its endpoint only from registry constants, ignores `DEEPSEEK_BASE_URL`
and vault base-URL overrides, and asserts `api.deepseek.com` before every fetch
(`assertCommissionedDestination`). A `psk-` Parasail key pasted into the
DeepSeek slot resolves as "not configured" rather than being sent to
`api.deepseek.com`.

## 2. Grok transport semantics (retained)

- Grok traffic stays on xAI endpoints only (`api.x.ai/v1`) and executes with
  the Grok credential only.
- The existing SuperGrok subscription CLI-proxy fallback
  (`cli-chat-proxy.grok.com/v1` in `lib/xaiGrokTransport.ts`) is retained
  exactly as before: same-provider and same-credential, a transport fallback
  only. It cannot select or route to another model or provider and never
  carries DeepSeek traffic.
- Grok's `grokComplete` may use the xAI OpenAI-compatible chat path only as
  its existing 404 fallback for console API keys; that fallback record is
  Grok-only (`listOpenAiFallbackProviders` now returns only the Grok record).

## 3. No cross-provider fallback

- A Grok-owned job never calls `api.deepseek.com`; a DeepSeek-owned job never
  calls `api.x.ai` or the Grok CLI proxy. There is no Grok ↔ DeepSeek cascade
  in either direction (test-proven by `tests/grok-deepseek-no-cross-fallback.test.ts`).
- Registration is exclusive: `adapterFor` is the only transport factory, and
  `registeredContentProviderPins()` returns exactly the two commissioned pins
  under the default env, `CONTENT_AI_ALL_PROVIDERS=1` break-glass, retired
  provider keys present, and a retired `CONTENT_AI_PROVIDER` literal
  (`tests/provider-registration-proof.test.ts`).
- The Discover engine pair is `grok` + `deepseek-v41-flash` and requires both
  configured; there is no single-lead degradation.

## 4. Legacy pins require re-selection (non-executable)

Every provider value that is not one of the two pins is legacy
(`entrim-*`, `nvidia-*`, `baseten-*`, `parasail-*`, `runbios-*`, `openai`,
`groq`, `gemini`, `openrouter`, `custom`, `zai-glm`, `aihubmix-*`,
`cloudflare-ai`, `deepseek`, `deepseek-pro`, GPT aliases, etc.).

- Execution fails closed with a typed `ProviderSelectionRequiredError`
  (`code: 'selection_required'`, HTTP 409,
  `execution_stage: 'provider_selection_required'`) **before any outbound
  provider request** — no redirect to a default, no break-glass restore.
- `CONTENT_AI_ALL_PROVIDERS=1` no longer restores any retired host.
- The UI/catalog requires explicit re-selection for a saved legacy pin; there
  is no preselected fallback.
- Legacy values remain readable in history/audit only.

## 5. P3 purge status (cleanup, not a safety dependency)

Non-registrability and route-unreachability were already enforced at P2 by the
boundary test and the runtime registration proof; P3 removed the retired
registered/executable transport code and the retired cascade remnants. It did
**not** remove every retired-label reference: inert legacy label-resolution
compatibility and generic OpenAI-compatible branches remain (below), and none
of them can register or execute a provider.

Purged from `lib/contentAiProviderCore.ts` (**executable/registrable
transport code**): NVIDIA, Baseten, Parasail, Run BiOS, AIHubmix, Zai, Entrim,
DeepSeek.com-alias, Gemini, OpenRouter, and Cloudflare Workers AI
getters/completers/constants, the legacy DeepSeek/GLM model canonicalizers,
the dead cascade remnants (`maxProviderCandidates`, `isSubrequestLimitError`,
`subrequestBudgetExhausted`, `sortByAdminOrder`, `isNvidiaPrefer`,
`isCloudflareExclusive`, `promoteEntrimAsLead`, `isGeminiConfigured`,
`isOpenRouterConfigured`, `isCloudflareAiConfigured`, `resolveCloudflareAiAuth`,
`completeAsStream`), and the retired `listOpenAiFallbackProviders` entries
(Grok record retained for the existing 404 fallback). `openAiCompatibleComplete/Stream`,
`grokComplete`, `grokResponsesStream`, and the vault/env machinery are
preserved exactly.

Retained intentionally (inert — not registrable, not reachable from the
execution doors):

- Generic OpenAI-compatible branches **keyed on retired labels** inside the
  preserved `openAiCompatibleComplete`/`openAiCompatibleStream`: NVIDIA
  MiniMax/Nemotron temperature + `max_tokens` handling, Run BiOS
  `isRunbiosPin` timeout/`reasoning_effort`/dispatcher hooks,
  `reasoning_budget`/`extraBody` passthrough, and `isReasoningModelId` naming
  retired model families. These shape generic request JSON; they construct no
  transport, and `adapterFor` + `COMMISSIONED_PROVIDERS` cannot reach them.
- `looksLikeParasailKey` — commissioned safeguard used by the registry to
  reject `psk-` keys in the DeepSeek slot.
- `resolveAiProviderPin`/`preferProvider`/`configuredProviderOrder`, their
  alias tables naming retired pins, and the
  `ENTRIM_QWEN_LABEL`/`ENTRIM_QWEN_MODEL` aliases — the exported *legacy
  label resolver*, not called by the execution doors (which select through
  `resolveExecutionProvider`). It executes no provider and returns labels only.
- `lib/runbiosCatalog.ts` — inert catalog data, still imported only by the
  legacy resolver / shared label checks and pinned by the boundary test.

Test restoration (correction round 1): `tests/content-ai-provider-stream.test.ts`
was restored as a compact commissioned-path suite (7 tests) that drives
`generateContentTextStream` with the `deepseek-v41-flash` pin and pins the
provider-agnostic guards: abandoned-consumer body cancel, caller-signal fetch
abort, frontmatter/H1 continuation-restart rejection, genuine continuation
append, split-delta and single-delta opening frontmatter, and a later
frontmatter restart after real prose. The retired NVIDIA `describe.skip` suite
was not resurrected.

Scripts: `scripts/probe-runbios-pipeline.ts` is now a fail-closed tombstone
(exits 1, contacts no provider; retained because the boundary test's dead-code
inventory pins its path). `scripts/bench-runbios-draft.ts` and
`scripts/probe-baseten-rescue.mts` were deleted (standalone retired-provider
execution utilities with no package/workflow/runtime consumer).

## 6. Migrations (both UNAPPLIED)

No migration was applied by this program.

- `supabase/migrations/20260915_content_studio_execution_lease.sql` — **UNAPPLIED**
  (PR #200 lease/fencing prerequisite).
- `supabase/migrations/20260916122441_content_studio_provider_parity.sql` — **UNAPPLIED**
  (additive `actual_provider` / `provider_error_class`; applies only on the
  supervisor's separate approval and production-state check).

Code tolerates the provider-parity columns being absent until that migration
is applied.

## 7. Verification evidence (2026-09-16, working tree at the starting SHA + P3 edits)

- Pre-cleanup P2 proof: `TZ=UTC npx jest tests/provider-registry-boundary.test.ts tests/provider-registration-proof.test.ts --runInBand` → **2 suites / 15 tests passed**.
- Post-cleanup (same command) → **2 suites / 15 tests passed** (invariant preserved).
- Task-8 focused suite (10 suites, exact command in the implementation audit) → **83 tests passed**.
- Correction round 1 focused suites (2026-09-16):
  - `TZ=UTC npx jest tests/content-ai-provider-stream.test.ts tests/content-ai-provider.test.ts tests/deepseek-first-party-transport.test.ts tests/grok-deepseek-no-cross-fallback.test.ts --runInBand` → **4 suites / 25 tests passed** (restored suite alone: 7 tests).
  - `TZ=UTC npx jest tests/content-studio-provider-parity.test.ts tests/provider-registry-boundary.test.ts tests/provider-registration-proof.test.ts tests/content-studio-provider-legacy-rejection.test.ts tests/content-ai-catalog.test.ts tests/brief-model-policy.test.ts tests/live-provider-policy.test.ts tests/entrim-provider.test.ts --runInBand` → **8 suites / 71 tests passed**.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → **exit 0** (re-verified in correction round 1).
- Full Jest `TZ=UTC NODE_OPTIONS=--max-old-space-size=8192 npx jest --ci --runInBand` (after correction round 1) → **380 suites passed, 2 failed, 2 skipped (382 of 384); 3950 passed, 8 failed, 4 skipped** — all 8 remaining failures are the pre-existing migration-ledger/migration-transaction-safety count failures caused by the P2-added migration file (70 files vs the frozen 69); no provider test fails. The cleanup-only run before the restored suite was 379 passed/2 failed/2 skipped suites and 3943 passed/8 failed/4 skipped tests; the delta is exactly `tests/content-ai-provider-stream.test.ts`.
- `npm run build` → **fails at the accepted starting SHA as well** (reproduced on a clean `git archive` copy of `b54e86c7`): webpack `UnhandledSchemeError` for `node:*` pulled into the client bundle via `components/design/admin-content-studio.tsx → lib/contentAiCatalog.ts → lib/contentAiRegistry.ts → lib/contentAiProviderCore.ts` (`require('undici')`). This is a pre-existing P2 bundling defect, not a P3 regression.
- `npm run lint` → **non-operational**: `next lint` is removed in Next 16 and exits 1 with `Invalid project directory provided, no such directory: …/lint`. Not claimed as passing.
- `git diff --check` / `git status --porcelain` → recorded in the implementation audit; no whitespace errors.

## 8. Explicit non-claims and remaining risks

- **No production canary, deployment, migration application, secret change,
  or commit/push was performed.** Passing local verification is code-review
  readiness only, pending GPT-5.6 Sol.
- The `npm run build` failure above is a real pre-existing P2 defect and must
  be fixed before any deploy; it is outside the P3 cleanup mandate.
- The provider-parity and execution-lease migrations remain unapplied; the
  provider-parity columns are tolerated as absent.
- Live provider behavior under real credentials was not exercised in P3.
- Legacy resolver helpers and the generic OpenAI-compatible branches keyed on
  retired labels remain present and inert (never registrable, never reachable
  from the execution doors); a later cleanup may remove them together with
  their legacy tests.
- The repository-root `CONTENT_STUDIO_HANDOFF.md` still carries stale
  Entrim-fallback runtime claims; it is out of scope for this cleanup.
