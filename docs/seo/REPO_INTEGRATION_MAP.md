# Phase 0 — Repository integration map

**Status:** supervisor recon only. No feature implementation in this phase.  
**Spec:** `YouSafe_Content_Studio_Zero_Cost_SEO_Implementation.md`  
**Hard constraint:** $0 new recurring SEO software/API spend. Core must work without Ahrefs, Semrush, DataForSEO, SerpApi, Ubersuggest, Moz, Majestic.

---

## 1. Current stack (facts)

| Concern | Location |
|---|---|
| Next.js | `16.2.11` (webpack production build) |
| React | `19.2.6` |
| App router | `app/` (no `pages/` product tree) |
| Auth | Clerk (`@clerk/nextjs`, `middleware.ts`) + `lib/portalAuth.ts` `requireAdminUser()` (role `admin`) |
| Persistence | Supabase (`@supabase/supabase-js`, `lib/supabase.ts` admin client) |
| Article jobs | `public.content_jobs` via `lib/seoFactory/persistContentJob.ts` |
| Article editor | `components/design/admin-inline-editor.tsx` + `studio-doc-editor.tsx` + `editor-metrics-strip.tsx` |
| Studio UI | `components/design/admin-content-studio.tsx` |
| AI writer | `lib/contentAiProvider.ts` + `lib/seoFactory/pipeline.ts` / `pipelineStream.ts` |
| SEO factory | `lib/seoFactory/*` (ship, audit, ownership, opportunities, clustering) |
| SEO master planner | `lib/seoEngine/*` (ontology, planner, GSC demand, compliance) |
| Deploy | Cloudflare Workers via OpenNext (`wrangler.toml`, `npm run build` → `opennextjs-cloudflare`) |
| Tests | Jest (`npm test` / `npx jest <file>`), Playwright (`npm run test:e2e`) |
| Env | Worker secrets + `.env.production` / `.env.local`; GSC via `GSC_*` and `gsc_connection` |

**Do not introduce** a parallel `lib/seo/` tree or `app/seo/*` dashboard. Feature-based convention is already `lib/seoFactory`, `lib/seoEngine`, `lib/gsc*`, `app/api/content-studio/*`, `app/api/seo-factory/*`, `app/api/seo-engine/*`.

---

## 2. Article schema / editor / pipeline

**Jobs table:** `content_jobs` (Supabase). Canonical write: `persistPipelineJob` / `mapPipelineJobRow`. Draft markdown lives on the job (`content` / draft snapshots), not a separate CMS article table.

**Editor:** Content Studio Draft & Review → `AdminInlineEditor` (document + markdown). Metrics strip is advisory; ship gates remain `lib/seoFactory/ship.ts` + `shipGate.ts` + `contentQualityGate.ts`.

**AI pipeline:** studio Generate → `claimDraftingJob` → stream `pipelineStream` → Entrim Qwen / Entrim DeepSeek / Grok (`contentAiProvider` live policy) → audit → Approve → `shipContent` → GitHub `putRepoFile`.

**Insertion for SEO briefs (later phases):** feed `suggest-brief` / `jobToMasterInput` / `keywordContract`. Do not add a second writer.

---

## 3. Authentication & API conventions

- Admin API routes: `requireAdminUser()` then JSON `{ error }` with 401/403.
- Public Clerk matcher: `middleware.ts`.
- GSC OAuth/service account: server-only (`lib/gscAuth.ts`). Never import into client components.
- Cron: `app/api/cron/*` + `CRON_SECRET` (GitHub Actions / Worker). $0 if existing schedule is reused.

**Phase 1 routes must follow** `app/api/content-studio/gsc/*` (already exists). Do **not** add `app/api/seo/gsc/*` unless a thin alias is required; prefer extending the existing tree.

Existing GSC HTTP:

| Method | Path | Role |
|---|---|---|
| GET/POST | `/api/content-studio/gsc/status` | connection banner |
| POST | `/api/content-studio/gsc/connect` | OAuth / service account |
| GET | `/api/content-studio/gsc/auth` + `callback` | OAuth |
| POST | `/api/content-studio/gsc/data` | live analytics or CSV snapshot |
| GET | `/api/content-studio/gsc/suggestions` | query ideas |
| GET/POST | `/api/content-studio/gsc/index-coverage` | index coverage |

Also: `/api/admin/analytics/gsc/*` (marketplace admin Search tab).

---

## 4. GSC today (Phase 1 overlap)

**Already built (reuse, do not rewrite):**

- `lib/gscAuth.ts` — OAuth refresh + service-account JWT (Web Crypto, Worker-safe)
- `lib/gscConfig.ts` — `gsc_connection` row
- `lib/gscAnalytics.ts` — `fetchSiteSearchAnalytics(days)` → totals, daily, **top queries XOR top pages** (separate dimension queries)
- `lib/gscContentBrief.ts` / `lib/gscKeywordSignals.ts`
- `lib/seoFactory/gscHistory.ts` — `gsc_snapshots` (site_url + date_key + **JSON blob**)
- `supabase/gsc_connection.sql`, `gsc_connection_service_account.sql`
- `supabase/migrations/20260806_hardening.sql` → `gsc_snapshots`
- `supabase/migrations/20260816_gsc_index_coverage.sql` → `gsc_index_coverage`
- CSV fallback: `public/seo-data` via `loadGscSnapshot()`

**Gaps vs spec Phase 1:**

1. Live `searchAnalytics` is often **not persisted as query+page rows**. `gsc_snapshots` stores a payload blob, not a queryable `query × page` table.
2. `fetchSiteSearchAnalytics` does **not** request `dimensions: ['query','page']` together.
3. Repeated `/gsc/data` POSTs re-hit Google; dashboard is not guaranteed to read a local cache first.
4. No first-class `GET` performance API over persisted rows (POST `gsc/data` is live-or-snapshot).
5. Dedup of query+page+date-range rows is not specified as a unique constraint.

**Phase 1 is therefore: persist + query +page Search Analytics on top of existing auth**, not a new GSC client.

---

## 5. Proposed `lib/seo/*` → actual modules

| Spec module | Existing equivalent | Action |
|---|---|---|
| `lib/seo/gsc/*` | `lib/gscAuth.ts`, `gscAnalytics.ts`, `gscConfig.ts`, `seoFactory/gscHistory.ts` | **Extend** these. Optional `lib/seoFactory/gscRows.ts` for normalized rows. |
| `lib/seo/keywords/*` | `keywordContract.ts`, `keywordPlanner.ts`, `suggest-keywords` route, `queryNoise.ts` | Later phases; reuse. |
| `lib/seo/clustering/*` | `lib/seoFactory/keywordCluster.ts` (Jaccard + intent) | Reuse; do not fork. |
| `lib/seo/entities/*` | `lib/seoFactory/semanticNlp.ts`, `lib/seoEngine/ontology.ts` | Reuse. |
| `lib/seo/content/*` | `content_jobs`, `cannibalMerge.ts`, `estateInterlinks.ts`, `deepInterlink.ts` | Reuse. |
| `lib/seo/scoring/*` | `opportunityEngine.ts`, `opportunities.ts`, `lib/seoEngine/planner.ts`, `crucible.ts` | Reuse; later align action labels CREATE/REFRESH/DEFEND/CONSOLIDATE. |
| `lib/seo/briefs/*` | `briefModel.ts`, `suggest-brief`, `prompts.ts`, `contentSpec.ts` | Reuse. |
| `lib/seo/serp/openserp.ts` | none in production | Optional later; **never** a required dep. |
| `app/seo/*` pages | Content Studio + Command Center (`admin-content-studio`, `admin-seo-engine`) | **Do not** add a second SEO app. Surface rows in existing studio GSC/war-room UI. |

---

## 6. Must not duplicate / must not require

**Do not duplicate:** GSC OAuth, Clerk admin gate, `content_jobs` persist door, ship pipeline, keyword Jaccard clusterer, opportunity engine.

**Optional paid adapters (keep optional; never import from Phase 1 core):**

- `lib/seoEngine/ubersuggest.ts` + `/api/content-studio/ubersuggest/*`
- `app/api/seo-engine/ahrefs/`, `backlinkProvider.ts`

**Prohibited in core:** new Ahrefs/Semrush/DataForSEO/SerpApi keys, fake volume/KD/CPC, OpenSERP as production import.

---

## 7. Persistence for the $0 engine

**Reuse now:** `gsc_connection`, `gsc_snapshots`, `gsc_index_coverage`, `content_jobs`.

**Phase 1 new table (required — blobs are not enough):**

```text
seo_gsc_rows
  id uuid PK
  site_url text not null
  query text not null
  page text not null
  clicks int
  impressions int
  ctr numeric
  position numeric
  country text null
  device text null
  start_date date not null
  end_date date not null
  synced_at timestamptz
  unique (site_url, query, page, start_date, end_date)
```

Optional later (do not create in Phase 1): `seo_keyword_candidates`, `seo_keyword_clusters`, `seo_opportunities`, `seo_sync_runs`.

Sync metadata can start as a row in `seo_sync_runs` **or** a `gsc_snapshots` date_key plus `seo_gsc_rows.synced_at`. Prefer one small `seo_sync_runs` if upserts need operator-visible status; otherwise `gsc_snapshots` + row upserts.

**Migration location:** `supabase/migrations/YYYYMMDD_seo_gsc_rows.sql` (same folder as existing GSC migrations).

---

## 8. Environment

Existing (no new paid products):

- `GSC_OAUTH_*`, `GSC_SITE_URL`, `GSC_SERVICE_ACCOUNT_JSON` / `GSC_SERVICE_ACCOUNT_KEY`
- Clerk, Supabase service role
- `CRON_SECRET` for later scheduled sync

Phase 1 must not add new env for third-party SEO APIs.

---

## 9. Tests & deploy

```text
npx jest <focused file> --no-coverage
npx tsc --noEmit
```

E2E: `e2e/gsc-connect-modal.spec.ts` already covers connect UI — do not rewrite; add unit tests for transform/dedup.

Deploy: Cloudflare Worker (`wrangler.toml`). Keep GSC secrets as Worker secrets. Client bundles must not import `gscAuth` / service-account JSON.

---

## 10. Recommended insertion points (Phase 1)

| Change | File |
|---|---|
| Query+page fetch + pagination | `lib/gscAnalytics.ts` (add function; keep existing totals API) |
| Upsert/dedup rows | new `lib/seoFactory/gscRows.ts` |
| Sync + GET | extend `app/api/content-studio/gsc/data/route.ts` **or** add `sync/route.ts` + `performance/route.ts` beside it |
| SQL | `supabase/migrations/` |
| Tests | `tests/gsc-rows.test.ts` (pure transform/dedup; mock fetch) |

**Out of scope for Phase 1:** keyword suggest, clustering, entities, briefs, OpenSERP, new `app/seo` pages, Ubersuggest, Ahrefs.

---

## 11. Phase 1 executor

See `docs/seo/PHASE_1_TASK.md`. Model: **DeepSeek V4 Flash 0731 / Think-High** only. No Max / Terra / Sol unless High fails twice on the same task.
