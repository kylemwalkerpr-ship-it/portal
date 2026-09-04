# $0 SEO intelligence — implementation ledger

| Phase | Status | Model | Notes |
|---|---|---|---|
| 0 Recon | **done — awaiting review** | Grok supervisor | `REPO_INTEGRATION_MAP.md` |
| 1 GSC persist query×page | **done** | Grok after review (High-scope task) | `seo_gsc_rows`; POST `/api/content-studio/gsc/sync`; GET `/api/content-studio/gsc/performance` |
| 2 Keyword discovery | **done** | Grok | `keywordDiscover.ts` + `POST /api/content-studio/keywords/discover` |
| 3 Clustering | **done** | Grok | `keywordGrouping.ts` Jaccard + `POST /api/content-studio/keywords/cluster` |
| 4 Entities | **done** | Grok | `topicGraph.ts` + `POST/GET /api/content-studio/topics/analyze` |
| 5 Coverage / links | **done** | Grok | `coverageLinks.ts` + `POST /api/content-studio/coverage/suggest` |
| 6 Opportunity scoring | **done** | Grok | `opportunityScore.ts` spec weights + `GET/POST /api/content-studio/opportunities/score` |
| 7 Action classify | **done** | Grok | `opportunityAction.ts` CREATE/REFRESH/DEFEND/CONSOLIDATE/WATCH + reasons |
| 8 Cannibalization | blocked | High | reuse `cannibalMerge.ts` |
| 9 Briefs | blocked | High | |
| 10 Dashboard | blocked | High | existing studio UI |
| OpenSERP | not scheduled | — | optional, never production dep |

Escalation used: none.
