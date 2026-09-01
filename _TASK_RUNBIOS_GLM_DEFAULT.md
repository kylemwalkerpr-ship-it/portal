# Task: Run BiOS GLM 5.3 Flash as default for Content Studio + Master Engine

Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal` only.
Do NOT commit, push, deploy, or print secrets. Do NOT read `.env*` or `.opencode/runbios.env`.

## Goal

Wire **Run BiOS** (`https://api.runbios.ai/v1`) **GLM 5.3 Flash** (`glm-5.3-flash`) as the **default model for every pipeline stage and the configurator**.

Provider id: `runbios-glm-53-flash`
- key env: `RUNBIOS_API_KEY`
- base URL env: `RUNBIOS_BASE_URL` default `https://api.runbios.ai/v1`
- model env: `RUNBIOS_GLM_MODEL` default `glm-5.3-flash`
- OpenAI-compatible `POST {base}/chat/completions` with Bearer key

This is **not** Baseten `baseten-glm-53-flash` (`zai-org/GLM-5.3-Flash`). Keep Baseten as a fallback host.

## Files to change (minimum)

1. `lib/contentAiProvider.ts`
   - Add get/is helpers mirroring Baseten GLM 5.3 Flash.
   - Lead of `configuredProviderOrder` / `preferProvider` / `orderedCompleters` when auto/empty/primary/default.
   - Aliases: `runbios`, `runbios-glm`, `runbios-glm-53-flash`, `glm-5.3-flash` (prefer Run BiOS over Baseten when both exist; if pin is explicitly `baseten-glm-53-flash` keep Baseten).
   - `promoteRunbiosGlmAsLead` instead of MiniMax-first.
   - Allowed pins + catalog listConfigured.
2. `lib/aiKeyVault.ts`
   - Add provider def (own vault group `runbios`).
   - `DEFAULT_PROVIDER_ORDER` lead = `runbios-glm-53-flash`.
   - `STALE_DEFAULT_PROVIDERS` include `nvidia-minimax` so vault migrates.
   - `ensureDraftDefaultSettings` persist `runbios-glm-53-flash` when stale.
   - HOST_MODEL_OPTIONS for runbios: `glm-5.3-flash`.
3. `lib/contentAiCatalog.ts`
   - Host id `runbios` first in STUDIO_HOST_ORDER.
   - `glm-5.3-flash` hosts: Run BiOS first, then Baseten.
   - DEFAULT_DRAFT_PIN / DEFAULT_BRIEF_PIN / DEFAULT_REVIEW_PIN = `runbios-glm-53-flash`.
   - Put glm-5.3-flash first in LANE_MODEL_ORDER for draft, brief, review, command (after auto on draft/command if auto remains).
   - PIN_ALIASES for runbios ids; `glm-5.3-flash` → `runbios-glm-53-flash` not Baseten.
4. `lib/seoFactory/briefModel.ts`
   - Accept `runbios-glm-53-flash` as a primary choice.
   - `auto` / unknown / empty → `runbios-glm-53-flash` (not GPT Terra).
   - Keep Grok as fallback if Run BiOS unconfigured (route already has fallback — keep that pattern).
5. `lib/seoEngine/engineAi.ts`
   - Default engine path: Run BiOS GLM 5.3 Flash as **lead**. Complement can stay Parasail GLM 5.2 if configured, else Run BiOS only.
   - `auto` / `engine-pair` / empty resolve to this, not Grok-led pair.
6. `components/design/admin-content-studio.tsx` DEFAULT_MODEL_BY_PROVIDER
7. `components/design/ai-key-vault-panel.tsx` if it hardcodes MiniMax/Terra placeholders
8. `env.d.ts` RUNBIOS_API_KEY, RUNBIOS_BASE_URL, RUNBIOS_GLM_MODEL
9. Tests that assert MiniMax/OpenAI/Grok as default: update to Run BiOS GLM 5.3 Flash.
   - `tests/engine-ai-grok-fallback.test.ts` (pair/default)
   - any `content-ai-*` default tests
   - catalog / brief-model tests
   Do not weaken tests; retarget expected default provider id `runbios-glm-53-flash` and model `glm-5.3-flash`.

## Constraints

- Do not replace live marketplace homepage or study-abroad apex.
- Do not invent a second Git write path.
- Do not dump secrets.
- Do not modify V4 Pro shopSeoGenerator.
- Preserve existing uncommitted files; only touch what's needed for this wiring.

## Verify

```
cd /Users/phantomdarne/Documents/GitHub/yousafe-portal
npx tsc --noEmit
npx jest tests/engine-ai-grok-fallback.test.ts tests/engine-pair-harden.test.ts --no-coverage
```
Also run any catalog/brief/content-ai tests you change.

## Report

Files changed, default pin per lane, test results, blockers. Stop at this wiring; do not ship content or git commit.
