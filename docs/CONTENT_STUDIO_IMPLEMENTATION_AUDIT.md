# Content Studio evidence-contract implementation audit

**Date:** 14 September 2026
**Refreshed main SHA:** `a33243111623ba2ded3332a010c8346bdf7d05cb`
**Feature branch:** `feature/content-studio-evidence-contract-20260914`
**Reviewer:** Codex. Do not merge from this Grok session.

## Defects addressed

| Defect | File | Change |
| --- | --- | --- |
| A synthetic GSC metrics | `app/api/content-studio/gsc/suggestions/route.ts` | Strategy corpus never enters the scored pool. Metrics stay null. |
| B keyword source health | `lib/seoFactory/keywordDiscover.ts` | `suggestState`: ok / empty / unavailable. |
| C immigration query suppression | `lib/seoEngine/researchDemand.ts` | F-1, 485, student-visa removed from noise regex. |
| D manufactured briefs | `lib/seoFactory/sealedBrief.ts` | No default thesis/lede/FAQ/takeaways. |
| E durable contract | `lib/seoFactory/writingContract.ts` | Versioned hash identity. |
| F/G desk fallback | `lib/seoFactory/linearDesk.ts` | `brief_invalid` + shared rewrite gate. |
| H isolated draft fallback | `pipeline.ts`, `pipelineStream.ts` | Coherent-writing failure does not switch workflows. |
| J live proof | `liveVerify.ts`, `publicationStates.ts` | Expected revision marker; merge != verified. |
| K marketplace feeder | `demandFeeders.ts`, `marketplaceDemandFeeder.ts` | First-party demand; unknown conversion coverage. |

## Migration

Apply `supabase/migrations/20260914_content_studio_evidence_contract.sql` on staging before production. Columns are additive and nullable.

## Tests

```
npm test -- tests/content-studio-evidence-contract.test.ts tests/research-demand.test.ts tests/keyword-discover.test.ts tests/linear-desk.test.ts
```

## Remaining limitations

- Admin UI still copies some brief fields client-side; server contract ID is the source of truth going forward.
- Destination sister-repo render adapters were not rebuilt in this PR.
- Tinyfish, Marketplace conversion emission, and live deploy verification were not exercised against production secrets.
- 12-article blind generation was not run live; fixtures are in `docs/content-studio/ARTICLE_SAMPLES_20260914.md`.
- `ensureMinimumOutline` still appends kit sections for some callers.
