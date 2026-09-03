# Owner-model pipeline — Entrim + Grok only

Supervisor: Grok. Implementor: Entrim DeepSeek V4 Flash via OpenCode.

## Policy

Live providers (only these, everywhere):

| Pin | Host | Model id |
|---|---|---|
| `entrim-qwen-27b` | api.entrim.ai | `Qwen/Qwen3.6-27B` |
| `entrim-deepseek` | api.entrim.ai | `deepseek-ai/DeepSeek-V4-Flash` |
| `grok` | api.x.ai | `grok-4.6` (existing grokComplete / SuperGrok vault) |

Delete or stop listing NVIDIA, Run BiOS, OpenAI, Groq, Gemini, OpenRouter, Baseten, Parasail, Zai, AIHubmix, Cloudflare, MiniMax, Nemotron, Claude, GPT-5.6, DeepSeek.com.

`CONTENT_AI_ALL_PROVIDERS` break-glass may remain but must not restore stripped catalog UI.

Unknown/legacy pin → redirect to `entrim-qwen-27b` and strip foreign model ids (same as current live policy).

## Catalog (`lib/contentAiCatalog.ts`)

- `StudioModelId`: `qwen3.6-27b` | `deepseek-v4-flash` | `grok-4.6` only (plus drop `auto` from brief/draft/review).
- `StudioHostId`: `entrim` | `xai` only.
- `LANE_HOSTS`: all lanes `['entrim','xai']`.
- `LANE_MODEL_ORDER` for **brief, draft, review, command**: all three models.
- `STUDIO_MODELS`: three rows. Grok host pin `grok`.
- Defaults remain Qwen unless the job has an owner pin.

## Runtime (`lib/contentAiProvider.ts`)

- `LIVE_PROVIDER_LABELS = ['entrim-qwen-27b','entrim-deepseek','grok']`
- Grok payment sidecar may stay **for Grok-as-owner only**, not as silent fallback from Entrim unless owner is grok and Entrim was never requested.
- `orderedCompleters` / stream candidates: **only** Entrim Qwen, Entrim DeepSeek, Grok. Remove NVIDIA/Run BiOS/… from the live filter list (delete dead completer wiring if safe; if deletion is too large, stop registering them in orderedCompleters).
- `exclusive: true` when `opts.aiProvider` is one of the three (owner mode). Capacity cascade **only** if exclusive is false.

## Vault (`lib/aiKeyVault.ts`)

- `AI_PROVIDERS` / `RUNBIOS_SLOTS`: keep Entrim DeepSeek, Entrim Qwen, Grok (xai / SuperGrok). Remove every other row.
- `ensureDraftDefaultSettings`: `entrim-qwen-27b`.
- Vault UI will shrink from catalog.

## Owner contract (architecture)

The model chosen at **Generate Full Brief** is the **contract owner** for that article until ship-ready.

1. `StudioModelHostSelect lane="brief"` lists Qwen, DeepSeek Flash, Grok.
2. POST `/api/content-studio/suggest-brief` body `aiProvider` = that pin. `briefModel.ts` must **keep** `grok` (today it coerces everything except entrim-deepseek to Qwen). Exclusive generate on that pin. Embed the pin in the brief JSON as `ownerProvider`.
3. After brief returns, UI sets `aiProvider` AND `reviewModel` to the same pin. Persist on generate-stream: `aiProvider` exclusive.
4. Persist `content_jobs.ai_provider` = owner pin. Also store in `lineage.ownerProvider` and `audit_json.contentSpec` / brief snapshot so later reaudit can recover it.
5. Draft stream, refine, depth rescue, reaudit `callAiFix`, style-review: `aiProvider: job.ai_provider`, `exclusive: true`. Do not default review to Qwen if owner is Grok or DeepSeek.
6. Every owner call’s **system** prompt must include the full briefing contract (assembled brief JSON / `contentSpec` / keyword floors / H2 map / sources / min-max words). Pass `briefJson` or `contentSpec` through `PipelineInput` and reaudit body. If the job has `gsc_json` + spec snapshot, rehydrate it.
7. Job modal model pickers default to owner pin; changing them is allowed but starts as owner.

## Tests to rewrite (not leave red)

- `live-provider-policy.test.ts`: Grok is live; NVIDIA still never contacted unless break-glass.
- `content-ai-catalog.test.ts`: only three models.
- `brief-model-policy.test.ts`: grok and both Entrim pins kept.
- `entrim-*`, `ai-vault-precedence`: vault rows only Entrim+Grok.
- e2e brief-model-selector: three options, not GPT.
- Delete/skip tests that exist only for NVIDIA/Run BiOS/OpenAI catalog.

## Do not

- Do not add ChatGPT OAuth back.
- Do not call `shipContent` from content-bot.
- No commit unless supervisor says.

Print FILES CHANGED, TEST RESULT, anything skipped.
