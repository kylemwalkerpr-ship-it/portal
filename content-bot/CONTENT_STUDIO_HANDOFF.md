# Content Studio Handoff — For Grok 4.6

## What This Is

A complete AI-powered content generation dashboard built into the YouSafe Portal admin panel. Generates blog posts/articles via AI, opens GitHub PRs, tracks job lifecycle, and integrates Google Search Console analytics. All code is pushed to `main` on `kylemwalkerpr-ship-it/portal`.

---

## Quick Start — What You Need To Do

### 1. Run Supabase SQL Migrations
- Go to: https://supabase.com/dashboard/project/krggzrxxnqfsbbklatxl/sql/new
- Paste and run the SQL from:
  - `https://raw.githubusercontent.com/kylemwalkerpr-ship-it/portal/main/supabase/migrations/content_jobs.sql`
  - `https://raw.githubusercontent.com/kylemwalkerpr-ship-it/portal/main/supabase/migrations/gsc_tokens.sql`

### 2. Set Cloudflare Secrets (for Grok/AI generation)
Set `XAI_API_KEY` as a Cloudflare Worker secret on `yousafe-portal`:
```bash
npx wrangler secret put XAI_API_KEY --name yousafe-portal
```
(Enter your SuperGrok API key when prompted)

### 3. Set Up GSC OAuth (if using Search Console)
- In Google Cloud Console, create OAuth 2.0 Web App credentials
- Set redirect URI to: `https://portal.yousafeconsultancy.com/api/content-studio/gsc/callback`
- Set Cloudflare secrets: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### 4. Verify Deployment
The site auto-deploys on push to main. Check: `https://portal.yousafeconsultancy.com`

---

## Files Added (all on portal main)

### API Routes
```
app/api/content-studio/generate/route.ts     # AI generation + E-E-A-T scoring
app/api/content-studio/jobs/route.ts          # CRUD for content jobs
app/api/content-studio/webhook/route.ts       # GitHub webhook handler
app/api/content-studio/metrics/route.ts       # Dashboard metrics
app/api/content-studio/gsc/auth/route.ts      # GSC OAuth URL generation
app/api/content-studio/gsc/callback/route.ts  # GSC OAuth token exchange
app/api/content-studio/gsc/data/route.ts      # GSC search analytics
app/api/content-studio/gsc/status/route.ts    # GSC connection status
```

### UI Components
```
components/design/admin-content-studio.tsx    # Main dashboard (Generate + GSC tabs)
components/design/admin-gsc-dashboard.tsx     # GSC keyword rankings
```

### Database
```
supabase/migrations/content_jobs.sql          # Content jobs table
supabase/migrations/gsc_tokens.sql            # GSC OAuth tokens table
```

---

## Fixes Applied (Build & Runtime)

| Issue | Fix | File |
|---|---|---|
| `npm ci` rejected lock file | Regenerated `package-lock.json` | `package-lock.json` |
| Strict peer deps break `npm ci` | Added `--legacy-peer-deps` to CI | `.github/workflows/deploy.yml` |
| JSX syntax errors (extra `</>`, missing fragment close) | Fixed fragment structure | `components/design/admin-content-studio.tsx` |
| GSC routes returning 401 | Added to public routes | `middleware.ts` |
| GSC `redirect_uri_mismatch` | Hardcoded production callback URL | `gsc/auth/route.ts`, `gsc/callback/route.ts` |

---

## AI Provider Chain

Priority order in `generate/route.ts`:
1. Custom endpoint (`CUSTOM_AI_BASE_URL` env var)
2. **Grok/xAI** (`XAI_API_KEY` env var) ← recommended for SuperGrok
3. OpenAI (`OPENAI_API_KEY` + `AI_PROVIDER=openai`)
4. DeepSeek (`DEEPSEEK_API_KEY`)

---

## Credentials

| Credential | Value |
|---|---|
| Cloudflare API Token | `[REDACTED]` |
| Cloudflare Account ID | `48f2c5185be44e14fea1df7d0591932a` |
| Supabase URL | `https://krggzrxxnqfsbbklatxl.supabase.co` |
| Supabase Service Role | `[REDACTED]_n8UTWVoN` |
| GitHub Token | `[REDACTED]` |

---

## Deployed Workers

| Worker | URL | Status |
|---|---|---|
| yousafe-portal | `portal.yousafeconsultancy.com` | ✅ Live |
| caseworks | `caseworks.kylemwalker-pr.workers.dev` | ✅ Live |
| support-saas | — | Active |
| yousafe-au | — | Active |
| yousafe-landing | — | Active |

---

## Key Repos

| Repo | Tech | Deploy |
|---|---|---|
| `kylemwalkerpr-ship-it/portal` | Next.js 16 + OpenNext + Clerk + Supabase | Cloudflare Workers |
| `kylemwalkerpr-ship-it/caseworks` | Next.js static export + pnpm | Cloudflare Workers |
| `kylemwalkerpr-ship-it/yousafe-consultancy` | Regional sites | Cloudflare |
