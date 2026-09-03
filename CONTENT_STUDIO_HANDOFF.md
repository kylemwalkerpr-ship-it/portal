# Content Studio — Activation Handoff

> **Runtime is Entrim-only as of 2026-09-02:** all live AI runs on
> `api.entrim.ai/v1` under one `ENTRIM_API_KEY` — lead **Entrim Qwen3.6 27B**
> (`entrim-qwen-27b`), fallback **Entrim DeepSeek V4 Flash** (`entrim-deepseek`).
> NVIDIA / Cloudflare / Groq / Gemini / OpenRouter legs are out of commission.

**Status (2026-07-22):** Code deployed to production (`portal` / `market`).  
GitHub Actions + Cloudflare Workers Builds green after Worker size fix.

## Live entry point

https://portal.yousafeconsultancy.com/dashboard/admin/content

## Maximally optimal stack (2026-07-23)

See **`docs/SEO_OPTIMAL_STACK.md`**.

| Layer | Choice |
|-------|--------|
| Agent GSC | Free MCP `mcp-search-console` (Grok `mcp_servers.gsc`) |
| Studio planner | `POST /api/seo-factory/optimal-plan` + Auto-Pilot **① Optimal GSC plan** |
| AI | CF primary → Groq → Gemini → OpenRouter (gig chain) |
| Ship | shipGate + Approve → main |

```bash
# One-time: place Search Console SA JSON then
./scripts/setup-gsc-mcp.sh /path/to/service_account.json
grok mcp doctor gsc
```

## What shipped

| Area | Location |
|------|----------|
| Generate API (Grok / OpenAI / DeepSeek / custom) | `app/api/content-studio/generate/route.ts` |
| SEO Factory generate + **SSE stream** | `app/api/seo-factory/generate`, `generate-stream` |
| Jobs / metrics / GitHub webhook | `app/api/content-studio/{jobs,metrics,webhook}/route.ts` |
| GSC OAuth + analytics | `app/api/content-studio/gsc/{auth,callback,data,status}/route.ts` |
| Admin UI (command center workspace) | `components/design/admin-command-center.tsx`, `content-studio-workspace.tsx` |
| SQL migrations | `supabase/migrations/content_jobs.sql`, `gsc_tokens.sql`, `seo_factory_columns.sql`, `content_jobs_event_log.sql` |
| Apply helper | `scripts/apply-content-studio-migrations.mjs` |

### Command-center upgrades (2026-07-23)

1. **Streaming generation** — Manual generate uses `POST /api/seo-factory/generate-stream` (SSE). Tokens land live in the workspace editor; falls back to classic JSON generate if stream fails.
2. **Markdown split preview** — Editor modes: Write / Split / Preview (`lib/markdownLite.tsx`, no extra deps).
3. **PR CI status** — `refresh_pr` loads check-runs + combined commit status for the PR head SHA.
4. **Durable debug logs** — `content_jobs.event_log` JSONB; client debounces `append_log`; job open hydrates history.

### Approve → main + authority planner (2026-07-23)

5. **Approve → main** — Workspace **Approve → main** commits (or merges open PR) to `main` so Cloudflare deploys. Skips automated score gates for human-reviewed content; still refuses ownership blockers. Defaults: ship mode `merge`.
6. **Deploy monitor** — After approve/merge, Workers AI diagnoses CI failures and can open a GitHub issue. `POST /api/seo-factory/monitor` (`jobId` or `{ scan: true }`). Queue **Monitor** / Auto-Pilot **Scan deploy monitor**.
7. **AEO/SEO/GEO topic algorithm** — `lib/seoFactory/authorityScoring.ts` ranks demand, AEO Q&A intent, LLM-citation potential, discipline entities, professionalism, cluster fill. Wired into keyword plan + auto-run + factory prompts.

### AI provider priority (content generation)

**Primary writer:** DeepSeek V4 Flash via NVIDIA Integrate  
(`deepseek-ai/deepseek-v4-flash-0731`, provider id `nvidia-deepseek`) — `lib/contentAiProvider.ts`.  
*Note: `deepseek-ai/deepseek-v4-pro` is EOL on NVIDIA (410 Gone since 2026-08-07); Pro-0813 runs on Parasail / Baseten / DeepSeek.com only.*

**Chain (hard order):**
1. **DeepSeek V4 Flash (NVIDIA)** — `NVIDIA_API_KEY` / `NVAPI_KEY`
2. **Cloudflare Workers AI** — first fallback (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
3. Groq → Gemini → OpenRouter → custom → xAI → OpenAI → DeepSeek.com

**Auth:**
- NVIDIA: `NVIDIA_API_KEY` (or `NVAPI_KEY` / `NVIDIA_NIM_API_KEY`)
- CF (account `48f2c5185be44e14fea1df7d0591932a`): `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_TOKEN`
- Worker always pins `CONTENT_AI_PROVIDER=nvidia-deepseek` on deploy

Override only if you must pin a different lead: `CONTENT_AI_PROVIDER=cloudflare` (etc.).  
Unknown values fall back to DeepSeek V4 Flash.

**Ship / deploy:** Markdown from any provider is re-rendered through `renderTargetFile` +
`assertShipAllowed` (CTAPanel contract, balanced JSX, FM) before any GitHub write so
caseworks / consultancy CI builds and Cloudflare autodeploy stay green.

Uses lightweight `fetch` (no Vercel AI SDK) so the Worker stays under Cloudflare size limits.

### GSC OAuth

- **Redirect URI (must match Google Cloud Console exactly):**  
  `https://portal.yousafeconsultancy.com/api/content-studio/gsc/callback`
- Override with `GSC_REDIRECT_URI` if needed.
- Env: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (or `GSC_OAUTH_CLIENT_*`).
- Middleware: only **callback** is public; auth/status/data require admin session.

### ChatGPT Plus OAuth (OpenAI — no API key)

Connect a ChatGPT Plus / Pro account from **Configure → AI keys → OpenAI row** (device-code flow against `auth.openai.com`, same pattern as SuperGrok). Tokens live in `ai_settings` (`chatgpt_oauth_*`), refresh before generation, and are injected into the OpenAI provider slot (`OPENAI_API_KEY` + `OPENAI_AUTH_MODE=chatgpt-plus`).

- Unlocks the full Plus lineup — **GPT-5.6 Sol · Terra · Luna** — end to end: Discover (command lane), Brief, Reviewer/Editor, Command Center.
- Vault `OPENAI_API_KEY` row still wins over the OAuth token (same precedence as SuperGrok).
- Optional env overrides: `CHATGPT_OAUTH_CLIENT_ID` (default `pdlvIXc9bUqhsESQhZ1zQHPDQ79mH2Py`), `CHATGPT_OAUTH_ISSUER` (default `https://auth.openai.com`), `CHATGPT_OAUTH_TOKEN_URL`, `CHATGPT_OAUTH_SCOPE`.
- Route: `POST /api/seo-factory/ai-keys/chatgpt-oauth` (`start` | `poll` | `disconnect`); status in `GET /api/seo-factory/ai-keys` as `chatgptOAuth`.

### Entrim in the configurator

Entrim (`entrim-deepseek`, `api.entrim.ai/v1`) renders as its own vault group card in the configurator (like Baseten / Run BiOS) and is selectable in the Draft + Command Center lanes. If a deployed Worker is older than this, redeploy to pick it up.

## Activation checklist

### 1. Supabase migrations (required)

Tables are **not** created until this runs.

**SQL Editor (recommended):**  
https://supabase.com/dashboard/project/krggzrxxnqfsbbklatxl/sql/new

Run in order:

1. `supabase/migrations/content_jobs.sql`
2. `supabase/migrations/gsc_tokens.sql`

Or:

```bash
SUPABASE_DB_PASSWORD='…' node scripts/apply-content-studio-migrations.mjs
# or
SUPABASE_ACCESS_TOKEN='sbp_…' node scripts/apply-content-studio-migrations.mjs
```

Project ref: `krggzrxxnqfsbbklatxl`  
URL: `https://krggzrxxnqfsbbklatxl.supabase.co`

### 2. Cloudflare Worker secrets

Set in GitHub Actions secrets (synced on deploy) or:

```bash
# Content generation (preferred) — account 48f2c5185be44e14fea1df7d0591932a
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put CLOUDFLARE_AI_TOKEN   # custom token: Workers AI Read
# OR (if the API token already has Workers AI Read):
# npx wrangler secret put CLOUDFLARE_API_TOKEN

# Fallbacks (optional)
npx wrangler secret put XAI_API_KEY
npx wrangler secret put PARASAIL_API_KEY  # psk-… Parasail serverless (DeepSeek V4 Flash + GLM 5.2)
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put GITHUB_TOKEN       # repo-scoped PAT for Content Studio PRs
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

`SUPABASE_SERVICE_ROLE_KEY` must already be on the Worker (used by all Content Studio routes).

### 3. Google Cloud Console

Authorized redirect URI:

```
https://portal.yousafeconsultancy.com/api/content-studio/gsc/callback
```

### 4. Smoke test

1. Admin login → Content Studio  
2. Generate tab → create a job (needs AI key + `GITHUB_TOKEN`)  
3. GSC tab → Connect → complete OAuth → analytics load  

## Issue history (resolved)

| Issue | Fix |
|-------|-----|
| CF Worker > 3 MiB free limit | Removed AI SDK; OpenAI-compatible fetch |
| Missing `wrangler` for OpenNext | Added `wrangler` devDependency |
| GSC OAuth `redirect_uri_mismatch` | Hardcoded production callback URL |
| GSC 401 from Clerk middleware | Callback public; other routes admin + `credentials: 'same-origin'` |
| Caseworks CF Builds pnpm error | Removed broken `pnpm-workspace.yaml` |

## Security notes

- Do not commit API tokens / secrets to git or chat long-term; rotate if exposed.
- `gsc_tokens` + `content_jobs` RLS policies are open at DB level; API routes enforce admin via Clerk (`requireAdminUser` / session).
- Prefer rotating any secrets pasted into chat (Supabase `sbp_` / `sb_secret_`, Cloudflare tokens).

## GSC service account + Content Studio demand feed (2026-07-22)

**Service account:** `gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com`  
**Worker secrets set:** `GSC_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL=sc-domain:yousafeconsultancy.com`

### Required one-time GSC UI step (403 until done)

For **each** Search Console property (domain + URL-prefix as needed):

1. Open https://search.google.com/search-console  
2. Settings → Users and permissions → Add user  
3. Email: `gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com`  
4. Permission: **Full**

Until that is done, live API returns 403. Content Studio still generates using the **CSV snapshot** at `data/gsc/snapshot.json` (imported from `Downloads/SEO`).

### Content generator integration

`app/api/content-studio/generate` calls `buildGscContentBrief()` which:

1. Tries live GSC (SA or OAuth)
2. Falls back to snapshot opportunities (high-imp / weak CTR / deep rank)
3. Injects primary keywords, related queries, estate pages, and strategy rules into the LLM prompt

### Refresh snapshot from new CSV exports

```bash
# Place exports under ~/Downloads/SEO/yousafeconsultancy-* then re-run the import
# (script logic lives in the session that wrote data/gsc/snapshot.json)
```

## SEO Factory (Sprint 1 shipped)

Admin: **Content Studio → SEO Factory** tab

### APIs
- `POST /api/seo-factory/plan` — ownership + GSC brief
- `POST /api/seo-factory/generate` — Cloudflare AI generate + audit + optional ship
- `POST /api/seo-factory/auto-run` — **low-input:** top N GSC opps → generate → audit gates → PR/autodeploy
- `POST /api/seo-factory/ship` — PR or autodeploy to main
- `POST /api/seo-factory/audit` — scorecard
- `GET /api/seo-factory/opportunities` — ranked GSC opportunities
- `GET /api/seo-factory/metrics` — factory KPIs + GSC visibility
- `POST /api/seo-factory/llms/preview` — llms.txt / llms-full snippets

### Auto-Pilot (minimal input)

In **Content Studio → SEO Factory → Auto-Pilot**:

1. Choose count (1–5) and ship mode (`auto` / `pr` / `autodeploy`)
2. Optional dry-run
3. Click **Generate & ship**

Pipeline: GSC opportunities → Workers AI draft → ownership + SEO audit → ship.
`shipMode=auto` opens a PR unless audit ≥70 (YMYL ≥80) and no ownership blockers, then autodeploys.

### Ship modes
- `pr` — branch + PR (default for YMYL)
- `autodeploy` — commit to `main` (requires audit gates; triggers existing CF deploys)

### Migration
Run `supabase/migrations/seo_factory_columns.sql` after base `content_jobs.sql`.

### Required secret
`GITHUB_TOKEN` with `contents:write` + `pull_requests:write` on caseworks, yousafe-consultancy, portal.
