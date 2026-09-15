# SEO Cleanup → Expansion Parity Matrix

This matrix is the phase gate for `docs/superpowers/specs/2026-09-15-seo-cleanup-expansion-parity-design.md`.

Allowed statuses: `PENDING`, `IN_PROGRESS`, `PASS`, `ACCEPTED_EXCEPTION`, `BLOCKED_EXTERNAL`, `FAIL`.

Evidence must name the command/query/artifact that proves the state. An agent assertion is not evidence.

| Phase | Requirement | Status | Current evidence / next proof |
|---|---|---|---|
| P0 | Local `main` = fetched `origin/main` = authoritative remote `main` | PASS | 2026-09-15 P0 refresh immediately before final verification: worktree base `HEAD`, fetched `origin/main`, and authoritative `git ls-remote origin refs/heads/main` all equal `c51f99046c122dd3ff34f29afd120996cb8efede`. |
| P0 | Control branch contains only control-plane docs before implementation | PASS | `seo/cleanup-expansion-parity-20260915` is `0` behind / `1` ahead of main at `6329c88a60149f31c655ef3e77af12c681a99b09` before this plan/matrix/ledger commit. |
| P0 | Stale branch deletion queue is exact-tip verified | PASS | 2026-09-15 Task 1 (supervisor): 33 branches deleted only after exact-tip proof — 4 direct/reachable safe deletions plus 29 squash-merge deletions whose CURRENT tip exactly matched its merged PR head and whose reachable main landing commit had an identical Git tree (original PR heads NOT claimed reachable); tree identity proves no unique file state under AGENTS.md. Total deleted=33, remain=47. |
| P0 | Unique/active branches explicitly retained | PASS | 2026-09-15 Task 1 (supervisor): active/unique/ambiguous branches retained, including `seo/gsc-soft404-canonicalization`. |
| P0 | Marketplace category URL generation uses public market host + clean `/categories/<id>` | PASS | `lib/marketplaceSeo.ts` `marketplaceCategoryHref` builds `https://market.yousafeconsultancy.com/categories/<id>` (blank input falls back to `immigration`); `lib/seoEngine/interlink.ts` derives `ESTATE_BASE.market` from the shared canonical helper. Proof: `npx jest tests/seo-estate-public-url-contract.test.ts` — 7/7 pass (2026-09-15); `npx tsc --noEmit` exit 0; `npm run build` exit 0. Runtime source scan: no executable emission of the retired path (only the reconciliation script's retired-prefix constant and docs). |
| P0 | LLM citation estate recognizes public Marketplace host | PASS | `lib/seoEngine/llmVisibility.ts` `ESTATE_DOMAINS` includes `market.yousafeconsultancy.com`; Portal retained as legitimate Portal/auth surface. Proven by `tests/seo-estate-public-url-contract.test.ts` (7/7 pass, 2026-09-15). |
| P0 | Legitimate Portal/auth identity remains distinguishable from Marketplace canonical | PASS | `tests/seo-estate-public-url-contract.test.ts` asserts `ESTATE_DOMAINS` contains both hosts and that the market base is never Portal; runtime scan shows remaining `portal.yousafeconsultancy.com` references in `lib/` are Portal/auth flows (email, clerk, GA4, war-room footer, contact) or the accepted `seoFactory/ownership.ts` legacy-input alias — no Marketplace canonical emission. |
| P0 | Existing stale planned interlinks detected/reconciled | PASS | Task 4: `scripts/reconcile-stale-planned-interlinks.mts` is strictly read-only evidence tooling (query/validate/map/rollback output; no update path). Live dry-run `affected_count=70, malformed_count=0, collision_count=0` saved at `/tmp/p0-interlink-reconcile-dryrun`. Supervisor applied atomically via SQL 2026-09-15: retired planned rows now 0; exactly 70 clean planned rows remain (35 immigration, 17 study-permits, 18 work-permits); wrong target_host=0; none marked applied. |
| P1 | Task 1 boundary: `support_notify(uuid,text,text,text,text,text)` and `support_log_action(uuid,text,text,text,text,jsonb)` are executable only by `service_role`, and `content_job_health_summary` / `inquiry_engagement` / `seo_backlink_dashboard` / `support_user_notes_v` are `security_invoker` views selectable only by `service_role` | PASS | Narrow claim only — does not assert base-table least-privilege (tracked in the next row). Local acceptance (2026-09-15): `tests/support-security-boundary.test.ts` 3/3 pass (exact `to_regprocedure`/`to_regclass` guards); `tests/migration-order.test.ts` 8/8 pass; `npx tsc --noEmit` exit 0. Production acceptance: PR #203 squash-merged to `main` as `9a21bfab291d5f381a2fce765a77a949a4d5ad8e`; `Deploy YouSafe Portal` run `35024648249` completed success including Cloudflare deploy, secrets health, and post-deploy smoke test; post-maintenance production SQL shows both RPCs EXECUTE `anon=false`, `authenticated=false`, `service_role=true`, and all four views SELECT `anon=false`, `authenticated=false`, `service_role=true` with `security_invoker=true` in reloptions. Security advisors at `2026-09-15T21:45:45Z` no longer list either support RPC in `anon`/`authenticated` SECURITY DEFINER warnings and no longer list the four views as `security_definer_view` findings. Migration run `35024648323` overall failed on unrelated older migrations (`20260911_marketplace_search_intelligence.sql`: `42P16` cannot drop columns from view; `content_jobs_fts_index.sql`: HTTP 503 scheduled maintenance) but its log proves `20260915_support_security_boundary.sql = OK`; the migration workflow is NOT green overall. Unrelated security-advisor backlog remains. |
| P1 | Unresolved security follow-up: base-table grants/RLS are not least-privilege — proven anon-readable: `content_jobs`, `seo_backlink_targets`, `seo_backlink_outreach`; `support_audit_log` exposes anon SELECT privilege/policy shape with current effective anon row count 0 | PENDING | Separate from the Task 1 RPC/view boundary; broad base-table hardening is out of scope for Task 1. Live effective anon reads (2026-09-15): `content_jobs` 240 rows; `seo_backlink_targets` 14/14 rows; `seo_backlink_outreach` 14/14 rows; `support_audit_log` anon SELECT privilege/policy shape is exposed, but its current effective anon row count was 0 (no rows leaked). Compatibility constraint: `content_jobs` cannot be locked to `service_role` in this task because the live Content Studio browser Realtime client subscribes to `public.content_jobs` through the anon Supabase client (`lib/supabaseRealtime.ts` → `createSupabaseBrowserClient()`; live caller `components/design/admin-content-studio.tsx:7533`, mounted via `components/design/admin.jsx:19`), so any fix must be Realtime-compatible. Backlink tables are used server-side via `createSupabaseAdminClient()` (`lib/seoEngine/backlinkEngine.ts`); `support_audit_log` is used server-side (`app/api/admin/users/[id]/route.ts`). |
| P1 | Fresh GSC query×page data is reproducible | PENDING | Phase not started. |
| P1 | Priority index/index-coverage evidence is operational | PENDING | Phase not started. |
| P1 | Qualified visibility separated from raw off-mission visibility | PENDING | Phase not started. |
| P1 | LLM audit failures excluded from genuine citation-loss math | PENDING | Existing architecture claims this; phase must prove current behavior/data. |
| P1 | Reward/forecast inputs are tied to real observations | PENDING | Phase not started. |
| P2 | Sitemap contains zero invalid public URLs | PENDING | Phase not started. |
| P2 | Meaningful canonical conflicts = 0 | PENDING | Phase not started. |
| P2 | Redirect/4xx/parameter duplicates/broken internal links reconciled | PENDING | Phase not started. |
| P2 | Priority indexable orphans resolved or justified | PENDING | Phase not started. |
| P3 | 100% strategic intents have one owner | PENDING | Phase not started. |
| P3 | ≥95% active priority intents mapped | PENDING | Phase not started. |
| P3 | CREATE is blocked without owner resolution | PENDING | Phase not started. |
| P4 | Major priority-cluster cannibalization resolved | PENDING | Phase not started. |
| P5 | High-impression off-mission URLs have explicit disposition | PENDING | Phase not started. |
| P5 | Off-mission pages cannot generate missions | PENDING | Phase not started. |
| P6 | Approved internal-link backlog is verified live or rejected/stale | PENDING | Target ≥80%; DB `applied` alone is not proof. |
| P7 | Near-win ranking interventions have before/after evidence | PENDING | Phase not started. |
| P8 | Trust/E-E-A-T surfaces are truthful and source-fresh | PENDING | Phase not started. |
| P9 | External authority operations record verified wins | PENDING | Phase not started. |
| P10 | Conversion attribution is instrumented and truthful | PENDING | Unknown conversion data must remain unknown, never inferred. |
| P11 | GEO/AI visibility evidence is current and failure-aware | PENDING | Phase not started. |
| P12 | Full estate validation gates pass | PENDING | Phase not started. |
| P13 | Controlled expansion passes evidence/content/ownership gates | PENDING | Phase not started. |

## Status discipline

- `PASS`: direct reproducible evidence exists and remains current for the phase decision.
- `ACCEPTED_EXCEPTION`: deliberate exception with owner, rationale, and bounded risk.
- `BLOCKED_EXTERNAL`: required provider/data/system is unavailable; evidence proves the dependency failure.
- `FAIL`: evidence contradicts the target contract.
- `PENDING`/`IN_PROGRESS`: cannot advance the phase.

Every implementation PR updates this matrix before handoff to GPT-5.6 Sol.
