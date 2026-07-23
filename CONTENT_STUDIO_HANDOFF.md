# Content Studio — Activation Handoff

**Status (2026-07-22):** Code deployed to production (`portal` / `market`).  
GitHub Actions + Cloudflare Workers Builds green after Worker size fix.

## Live entry point

https://portal.yousafeconsultancy.com/dashboard/admin/content

## What shipped

| Area | Location |
|------|----------|
| Generate API (Grok / OpenAI / DeepSeek / custom) | `app/api/content-studio/generate/route.ts` |
| SEO Factory generate + **SSE stream** | `app/api/seo-factory/generate`, `generate-stream` |
| Jobs / metrics / GitHub webhook | `app/api/content-studio/{jobs,metrics,webhook}/route.ts` |
| GSC OAuth + analytics | `app/api/content-studio/gsc/{auth,callback,data,status}/route.ts` |
| Admin UI (command center workspace) | `components/design/admin-seo-factory.tsx`, `content-studio-workspace.tsx` |
| SQL migrations | `supabase/migrations/content_jobs.sql`, `gsc_tokens.sql`, `seo_factory_columns.sql`, `content_jobs_event_log.sql` |
| Apply helper | `scripts/apply-content-studio-migrations.mjs` |

### Command-center upgrades (2026-07-23)

1. **Streaming generation** — Manual generate uses `POST /api/seo-factory/generate-stream` (SSE). Tokens land live in the workspace editor; falls back to classic JSON generate if stream fails.
2. **Markdown split preview** — Editor modes: Write / Split / Preview (`lib/markdownLite.tsx`, no extra deps).
3. **PR CI status** — `refresh_pr` loads check-runs + combined commit status for the PR head SHA.
4. **Durable debug logs** — `content_jobs.event_log` JSONB; client debounces `append_log`; job open hydrates history.

### AI provider priority (content generation)

**Primary:** Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) via
`lib/contentAiProvider.ts`.

**Auth (account `48f2c5185be44e14fea1df7d0591932a`):**
- `CLOUDFLARE_ACCOUNT_ID`
- Token (first match): `CLOUDFLARE_AI_TOKEN` → `CLOUDFLARE_WORKERS_AI_TOKEN` → `CLOUDFLARE_API_TOKEN`
- Token must include **Workers AI — Read** (create at [Account API Tokens](https://dash.cloudflare.com/48f2c5185be44e14fea1df7d0591932a/api-tokens))

**REST:** prefers `POST .../accounts/{id}/ai/v1/chat/completions`, falls back to `/ai/run/{model}`.

**Fallbacks (in order):** custom OpenAI-compatible → xAI/Grok → OpenAI → DeepSeek → Groq.

Override with `CONTENT_AI_PROVIDER` or `AI_PROVIDER` if needed (`cloudflare` default).

Uses lightweight `fetch` (no Vercel AI SDK) so the Worker stays under Cloudflare size limits.

### GSC OAuth

- **Redirect URI (must match Google Cloud Console exactly):**  
  `https://portal.yousafeconsultancy.com/api/content-studio/gsc/callback`
- Override with `GSC_REDIRECT_URI` if needed.
- Env: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (or `GSC_OAUTH_CLIENT_*`).
- Middleware: only **callback** is public; auth/status/data require admin session.

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
