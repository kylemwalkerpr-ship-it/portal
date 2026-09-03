# Content Studio — close gaps (supervisor plan)

Grok = supervisor. Entrim DeepSeek V4 Flash via OpenCode = implementor.
One slice per OpenCode run. Do not rewrite the product in one pass.
Do not invent a fifth Git writer. Ship stays `shipContent` → `putRepoFile`.

## Order (do not skip ahead)

| Phase | Slice | Done when |
|---|---|---|
| A1 | Shared `resolveShipMode` + withhold + `shipError` overwrite fix | JSON and stream import one module; floors identical (PR-fallback score ≥ 40); specific mismatch errors not overwritten; Jest covers withhold / `pr` never quality-withholds / persist catch leaves content |
| A2 | UI ship-truth | Approve tab + bulk Approve + review vault + draft “gate passed” use `currentGate` / `shipReady && blockers===0`. Score≥90 never labeled ship-ready |
| A3 | `humanApproved` JSDoc matches code (never skip gates). `merge_pr` still ungated — document in comment only this phase |
| B1 | `requireAdminUser` on unguarded studio mutations: reaudit, suggest-brief, suggest-keywords, style-review, gsc/connect, shop-seo, model-calibration 403 |
| C1 | Writer/brief honesty: stop mapping gsc/connect as impressions; `setRadarMeta` stores snapshot; no fabricated `impressions:1` in radar scoring (or label `synthetic`); drop dead `seoEnrichment` or wire it |
| C2 | GSC 14-day stale refuse on radar + `hydrateGscQueryRows` same as `buildGscContentBrief` |
| D1 | Split vault `ENTRIM_MODEL` vs `ENTRIM_QWEN_MODEL`. DeepSeek pin cannot send Qwen id |
| D2 | Deploy pin `CONTENT_AI_PROVIDER=entrim-qwen-27b`. Remove Grok 402 sidecar or gate behind `CONTENT_AI_ALL_PROVIDERS` |
| E1 | Stream and JSON share persist helper + hold message. Align repair inputs (keywords + competingUrls) |
| F1 | Shop: hide tab **or** persist queue in DB + `shipContent`. No Worker `fs` |
| F2 | Delete or unmount dead UI: command-center unused, CreateWizard, GPT e2e rewritten to Entrim |
| G1 | Architecture I5 + wrangler comments match Entrim-only |

Status 2026-09-02: A1–G1 implemented via OpenCode DeepSeek (uncommitted). GSC connect Jest mocks added after B1. Shop tab hidden from nav; APIs remain.

## Implementor rules

- Touch only files named in the OpenCode prompt.
- Run the Jest files named in the prompt.
- No secrets, no commit unless supervisor says.
- No drive-by refactors, no new providers, no content-bot.
