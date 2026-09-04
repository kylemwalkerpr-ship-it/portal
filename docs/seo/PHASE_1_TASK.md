# Phase 1 task — persist GSC query×page rows (DeepSeek V4 Flash 0731 / Think-High)

ROLE  
You are the implementation executor for YouSafe Content Studio.  
Use **DeepSeek V4 Flash 0731 with Think-High** reasoning. Do not switch to Think-Max, GPT-5.6 Terra, or GPT-5.6 Sol.

GOAL  
Persist Google Search Console **query + page** Search Analytics into Supabase so the studio can read performance without hitting Google on every dashboard render. Reuse existing GSC auth. Do not build a second GSC client or a new `app/seo` UI.

INSPECT (only)  
- `docs/seo/REPO_INTEGRATION_MAP.md`  
- `lib/gscAuth.ts`  
- `lib/gscAnalytics.ts`  
- `lib/seoFactory/gscHistory.ts`  
- `app/api/content-studio/gsc/data/route.ts`  
- `lib/portalAuth.ts` (`requireAdminUser`)  
- `supabase/migrations/20260806_hardening.sql` (`gsc_snapshots`)  
- `tests/` (Jest style in existing `tests/*.test.ts`)

CHANGE  
1. `supabase/migrations/20260904_seo_gsc_rows.sql`  
   Table `public.seo_gsc_rows` with unique `(site_url, query, page, start_date, end_date)` as specified in the integration map. RLS: same pattern as other factory tables (admin/service role).  
2. `lib/gscAnalytics.ts`  
   Add `fetchQueryPageRows({ days, startDate?, endDate?, rowLimit? })` that calls Search Console `searchAnalytics.query` with `dimensions: ['query','page']`, paginates (`startRow` / `rowLimit` until empty or a sane cap, e.g. 25k rows), returns `{ siteUrl, range, rows: GscMetricRow[] }`.  
   **Do not break** existing `fetchSiteSearchAnalytics`.  
3. `lib/seoFactory/gscRows.ts` (new)  
   Pure `normalizeGscMetricRow`, `dedupeGscMetricRows` (last write wins on unique key), `upsertSeoGscRows(db, rows)` using Supabase upsert on the unique constraint.  
4. API — keep `/api/content-studio/gsc/` prefix:  
   - `POST /api/content-studio/gsc/sync` — `requireAdminUser`, default **90 days**, presets 28 / 90 / 180 / 365 via `days`. Fetch query+page, upsert, also refresh `gsc_snapshots` via existing `saveSnapshotVersion` if cheap. Return `{ ok, rowsProcessed, range, siteUrl, source: 'live' }`. Empty dataset → `{ ok: true, rowsProcessed: 0 }` not 500. Readable errors; **never** put tokens in the JSON.  
   - `GET /api/content-studio/gsc/performance` — `requireAdminUser`, read `seo_gsc_rows` (optional `siteUrl`, `days`/`startDate`/`endDate`, limit). Order by impressions desc. Empty → `[]`.  
5. Tests: `tests/gsc-rows.test.ts`  
   - normalize + dedupe (duplicate query+page+range collapsed)  
   - pagination loop with mocked `fetch` (2 pages then empty)  
   - unique-key identity  
   Do not call live Google in tests.

CONSTRAINTS  
- $0 new SEO SaaS. No Ubersuggest, Ahrefs, SerpApi, DataForSEO imports.  
- Do not modify `contentAiProvider`, ship gates, editor, marketplace, or `lib/seoEngine/ubersuggest.ts`.  
- Do not create `lib/seo/` or `app/seo/`.  
- Do not invent search volume, KD, or CPC.  
- Secrets stay server-side. No `gscAuth` in `'use client'` files.  
- Minimal diff. Stop when acceptance criteria pass.  
- Commit message: `feat(seo): persist GSC query-page rows`

ACCEPTANCE CRITERIA  
1. Migration file exists and unique constraint matches the map.  
2. Repeated sync of the same window does not create duplicate unique keys (upsert).  
3. GET performance returns persisted rows without calling Google.  
4. Default sync window is 90 days.  
5. Empty GSC response is handled without throwing.  
6. `npx jest tests/gsc-rows.test.ts --no-coverage` passes.  
7. `npx tsc --noEmit` passes.  
8. Existing `fetchSiteSearchAnalytics` still compiles and is used by `/gsc/data`.  
9. No new paid dependency in `package.json`.

TEST COMMAND  
```text
npx jest tests/gsc-rows.test.ts --no-coverage
npx tsc --noEmit
```

OUT OF SCOPE  
Keyword suggest, clustering, entities, opportunity scoring, briefs, OpenSERP, dashboard pages, cron (manual sync is enough).

STOP  
Do not start Phase 2.
