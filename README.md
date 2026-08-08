# portal-patch — Hardening for kylemwalkerpr-ship-it/portal (Next.js + Supabase + Cloudflare)

This directory is the **portal twin** of the `P0-P3` suite already live in `github-content-bot` (this repo, Vite+Convex). Copy it onto `portal` before the next Cloudflare build so both repos have identical guarantees.

## What this patch adds (identical hardening, Supabase-shaped)

| Track | Files | Guarantee |
|---|---|---|
| **P0-1 liveVerify** | `lib/seoFactory/liveVerify.ts` | purge CDN → sitemap ping → IndexNow → fetch live → re-audit → `content_jobs.live_* + event_log` |
| **P0-2 dedup** | `supabase/migrations/20260806_hardening.sql` (`dedup_key`) | day-scoped idempotency, same suffix as Convex `by_dedup` |
| **P0-3 deployMonitor** | `lib/seoFactory/deployMonitor.ts` | CI failure → `needs_revert/revert_reason` |
| **P1-1 gscHistory** | `lib/seoFactory/gscHistory.ts` + `gsc_snapshots` table | daily snapshot versioning + decay delta |
| **P1-2 crawlChecks** | `lib/seoFactory/crawlChecks.ts` + `crawl_checks` table | sitemap/llms/crawl-budget drift |
| **P1-3 anchorLedger** | `lib/seoFactory/anchorLedger.ts` + `anchor_ledger` | PageRank-weighted interlink ledger |
| **P2-1 EEAT** | `lib/seoFactory/eeat.ts` | `buildEeatJsonLd()` JSON-LD graph |
| **P3 circuitBreaker** | `lib/seoFactory/circuitBreaker.ts` | per-isolate 3-fail/5-min breaker for ai providers |

Existing portal-patch files (`lib/githubContents.ts`, `lib/seoFactory/prompts.ts`, etc.) are **unchanged** — this patch is additive only, no breaking change.

## Cannibal merge resolution fix (v2)

Fixes the deployed `Content Studio`/`Command Center` error banner:
`term, winnerUrl and at least one loserUrl are required`.

| Track | Files | What changed |
|---|---|---|
| **cannibalMerge** | `lib/seoFactory/cannibalMerge.ts` | `executeCannibalMerge` now treats `winnerUrl`/`loserUrls` as optional. When they are missing or contain a bare keyword, it resolves the real competing pages from Google Search Console query×page data (`resolveCannibalPages`, winner = highest impressions) before merging — no more keyword-as-URL or empty-payload failures. Unresolvable cases throw an actionable message instead. |
| **cannibal-merge route** | `app/api/seo-factory/cannibal-merge/route.ts` | Returns friendly `400` with `guidance` for resolution/validation failures instead of a raw `500` banner. `term` is the only required field. |

Apply by copying both files over the portal checkout (same copy step below).

## Shared cannibal merge history (Supabase sync)

Both products now write/read **one** merge-decision audit trail.

| Track | Files | What changed |
|---|---|---|
| **migration** | `supabase/migrations/20260808_cannibal_merges.sql` | `cannibal_merges` table — shared by both writers, `unique (cluster_id, source)`, admin RLS policy. **Must be run once** (`npx supabase db push` or the SQL editor). |
| **cannibalMerge engine** | `lib/seoFactory/cannibalMerge.ts` | After every merge/skip, records the decision to `cannibal_merges` (source = `portal`, deterministic `cluster_id` derived from the term stem so both products use the same key). Best-effort — a sync failure never fails the merge. |
| **cannibal-merges route** | `app/api/seo-factory/cannibal-merges/route.ts` | `GET` returns the shared history (latest 100, both sources) for the Content Studio; `POST` upserts a decision keyed by `cluster_id,source`. 503 with guidance if the migration hasn't run. |
| **Content Studio UI** | `components/design/admin-content-studio.tsx` | New **🔀 Merge History** panel (right column, under Job History) renders the shared trail from `GET /api/seo-factory/cannibal-merges` — status (merged/skipped), source badge (COMMAND CENTER vs PORTAL), terms → winner, loser/redirect counts, PR link, time ago. Handles loading, empty, auth/migration-guidance, and retry states. |

**Other side (Convex / Command Center):** `cannibalizeActions.ts` upserts each Command Center merge to the same table with `source = command_center`, and `pullPortalMergeHistory` pulls portal rows into the Command Center's audit trail on panel mount — so the Cannibalization Watch shows one cross-product history (`portal` badge on portal-originated rows). Env needed on Convex: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (same pair the portal already uses).

## Apply on `portal`

Run on `portal` checkout (or have its CI copy `portal-patch/*` before `next build`):

```bash
cp -r portal-patch/lib portal-patch/supabase ./
# (or rsync -a portal-patch/ ./ )

# Supabase migration
npx supabase db push   # picks up supabase/migrations/20260806_hardening.sql
# or: psql "$DATABASE_URL" -f supabase/migrations/20260806_hardening.sql

# Wire ship→liveVerify on next ship (patch _diag/lib__seoFactory__ship.ts → lib/seoFactory/ship.ts):
# import { verifyLiveInBackground } from './liveVerify'
# and after the PR/merge block:
#   verifyLiveInBackground({ canonicalUrl: plan.canonicalUrl, jobId, title, primaryKeyword, contentType: plan.contentType })
# The Convex repo already wires this via scheduler.runAfter(verifyLive); the Next.js twin is inline.
```

Cloudflare will then deploy with the full hardening.
