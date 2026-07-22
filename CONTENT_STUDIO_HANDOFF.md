# Content Studio — Activation Handoff

**Status (2026-07-22):** Code deployed to production (`portal` / `market`).  
GitHub Actions + Cloudflare Workers Builds green after Worker size fix.

## Live entry point

https://portal.yousafeconsultancy.com/dashboard/admin/content

## What shipped

| Area | Location |
|------|----------|
| Generate API (Grok / OpenAI / DeepSeek / custom) | `app/api/content-studio/generate/route.ts` |
| Jobs / metrics / GitHub webhook | `app/api/content-studio/{jobs,metrics,webhook}/route.ts` |
| GSC OAuth + analytics | `app/api/content-studio/gsc/{auth,callback,data,status}/route.ts` |
| Admin UI | `components/design/admin-content-studio.tsx`, `admin-gsc-dashboard.tsx` |
| SQL migrations | `supabase/migrations/content_jobs.sql`, `gsc_tokens.sql` |
| Apply helper | `scripts/apply-content-studio-migrations.mjs` |

### AI provider priority

1. `CUSTOM_AI_BASE_URL` + `CUSTOM_AI_API_KEY` (+ optional `CUSTOM_AI_MODEL`)
2. `XAI_API_KEY` → Grok (`XAI_MODEL` default `grok-3`)
3. `AI_PROVIDER=openai` + `OPENAI_API_KEY`
4. `DEEPSEEK_API_KEY`

Uses lightweight OpenAI-compatible `fetch` (no Vercel AI SDK) so the Worker stays under Cloudflare size limits.

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
npx wrangler secret put XAI_API_KEY
npx wrangler secret put DEEPSEEK_API_KEY   # optional fallback
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
