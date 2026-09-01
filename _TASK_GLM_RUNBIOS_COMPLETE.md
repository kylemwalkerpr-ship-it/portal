# Implement Run BiOS GLM Flash “complete the draft” recommendations

Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal` only.

Do NOT commit, push, deploy, or print secrets. Do NOT read `.env*`, `.opencode/runbios.env`, or paste keys. If git status is denied, skip it and edit files directly.

## Already in tree (verify, do not revert)

- Provider id `runbios-glm-53-flash`, model `glm-5.3-flash`, `https://api.runbios.ai/v1`
- Default pin for catalog / vault / auto / brief coerce
- `reasoning_effort: 'low'` on Run BiOS (never send top-level `thinking` — Run BiOS 400s it)
- `deadlineForProvider` 10-minute floor for runbios
- Non-stream fetch: `CONTENT_AI_RUNBIOS_TIMEOUT_MS` (default 600000) + undici `headersTimeout`/`bodyTimeout` so Node does not kill at 300s with `fetch failed`

## You must implement (remaining recommendations)

1. **Engine pair: skip a dead complement**
   - File: `lib/seoEngine/engineAi.ts`
   - If Parasail GLM is not configured, do **not** `Promise.all` a complement leg. Run lead-only (Run BiOS GLM) and return `leadOnly: true`.
   - If Run BiOS is not configured but Parasail is, keep complement-only as today.
   - Raise pair-leg timeout for the Run BiOS lead so 45s cannot cut a reasoning pass (use the same 10-minute floor, or omit timeoutMs so `deadlineForProvider` applies). Complement can stay 45s.

2. **Brief: do not exclusive-fail the first Run BiOS timeout**
   - File: `lib/seoFactory/briefModel.ts`
   - For `runbios-glm-53-flash`, set `cascadeOnCapacity: true` (keep exclusive pin, but capacity/timeout may fall through).
   - Default brief `timeoutMs` when unset: at least 180000 for Run BiOS.
   - Keep Grok as the named fallback after primary failure.

3. **Streaming fetch must survive a 5–10 minute GLM draft**
   - File: `lib/contentAiProvider.ts` `openAiCompatibleStream` / `streamOnce`
   - Apply the same undici dispatcher + long timeout for `runbios-glm-53-flash` as non-stream `openAiCompatFetch`. Studio draft UI uses the stream path.

4. **Pipeline factory calls**
   - File: `lib/seoFactory/pipeline.ts` (and `pipelineStream.ts` if it also calls generateContentText without timeout)
   - Pass no short timeout that would override the Run BiOS 10-minute floor. If you pass `timeoutMs`, it must be ≥ 600000 for this pin.

5. **Tests** (update, do not weaken)
   - Engine pair: no Parasail key → only lead Run BiOS is called.
   - `deadlineForProvider('runbios-glm-53-flash', 90_000)` ≥ 600000 (already in grok-responses-brief if present).
   - Brief policy still maps auto → `runbios-glm-53-flash`.
   - Run: `npx tsc --noEmit` and the jest files you touch.

6. **Env example only**
   - If `.secrets.example` or similar lists AI keys, add `RUNBIOS_API_KEY`, `RUNBIOS_BASE_URL=https://api.runbios.ai/v1`, `RUNBIOS_GLM_MODEL=glm-5.3-flash` as empty placeholders. Never copy real values.

## Do not

- Replace live marketplace homepage or study-abroad apex
- Change visa Student Route / F-1 copy
- Invent a second Git write path
- Deploy Worker secrets
- Switch the default off Run BiOS GLM 5.3 Flash
- Re-enable `thinking: { type: 'enabled' }` on Run BiOS

## Report

Files changed, tests, remaining blockers (Worker secret is a human step).
