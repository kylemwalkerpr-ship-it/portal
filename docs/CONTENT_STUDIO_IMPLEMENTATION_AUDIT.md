# Content Studio implementation audit

**Date:** 14 September 2026
**Refreshed main SHA:** `a33243111623ba2ded3332a010c8346bdf7d05cb`
**Feature branch:** `feature/content-studio-evidence-contract`
**Reviewer:** Codex. Do not merge from this Grok session.

## On this branch now

New modules:

- `lib/seoFactory/opportunityIdentity.ts` — stable identity; US I-485 ≠ AU subclass 485
- `lib/seoFactory/rewriteAcceptance.ts` — shared rewrite gate stronger than 40% length
- `lib/seoFactory/publicationStates.ts` — merge / deploy / live phases and labels
- `lib/seoFactory/tinyfishAdapter.ts` — Search+Fetch adapter, SSRF checks, classified failures
- `lib/seoEngine/marketplaceDemandFeeder.ts` — Marketplace aggregates are not GSC impressions

## Still required from the contract (not yet patched on this branch)

These were implemented locally against main, then the sandbox checkout was lost before push:

1. Stop injecting strategy corpus into GSC scoring with `impressions: 1` / fabricated position (`gsc/suggestions/route.ts`).
2. Keyword discover `suggestState`: ok / empty / unavailable (`keywordDiscover.ts`).
3. Remove F-1 / 485 / student-visa from `KEYWORD_NOISE_RE` (`researchDemand.ts`).
4. Stop manufacturing thesis/lede/FAQ in `sealBriefFromAssembly`.
5. Linear desk must refuse `brief_invalid` instead of merging generic fallbacks; use `acceptRewriteCandidate`.
6. Add `marketplace` to `DemandSourceId` and `pullAllDemand`.
7. Live verify must require expected revision marker; merged ≠ verified.
8. Additive migration `20260914_content_studio_evidence_contract.sql`.
9. `WritingContractV2` persistence + server load by `jobId + contractVersion`.
10. Blind 12-article editorial benchmark.

## Production configuration still unverified

Tinyfish key, Marketplace conversion-event emission, and destination-repo workflows were not exercised live.
