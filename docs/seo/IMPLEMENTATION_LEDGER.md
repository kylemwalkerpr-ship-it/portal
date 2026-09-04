# $0 SEO intelligence — implementation ledger

| Phase | Status | Model | Notes |
|---|---|---|---|
| 0 Recon | **done — awaiting review** | Grok supervisor | `REPO_INTEGRATION_MAP.md` |
| 1 GSC persist query×page | **done** | Grok after review (High-scope task) | `seo_gsc_rows`; POST `/api/content-studio/gsc/sync`; GET `/api/content-studio/gsc/performance` |
| 2 Keyword discovery | blocked on 1 | High | |
| 3 Clustering | blocked | High | reuse `keywordCluster.ts` |
| 4 Entities | blocked | High | |
| 5 Coverage / links | blocked | High | |
| 6 Opportunity scoring | blocked | High | reuse `opportunityEngine.ts` |
| 7 Action classify | blocked | High | |
| 8 Cannibalization | blocked | High | reuse `cannibalMerge.ts` |
| 9 Briefs | blocked | High | |
| 10 Dashboard | blocked | High | existing studio UI |
| OpenSERP | not scheduled | — | optional, never production dep |

Escalation used: none.
