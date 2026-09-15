# SEO Cleanup → Expansion Parity Matrix

This matrix is the phase gate for `docs/superpowers/specs/2026-09-15-seo-cleanup-expansion-parity-design.md`.

Allowed statuses: `PENDING`, `IN_PROGRESS`, `PASS`, `ACCEPTED_EXCEPTION`, `BLOCKED_EXTERNAL`, `FAIL`.

Evidence must name the command/query/artifact that proves the state. An agent assertion is not evidence.

| Phase | Requirement | Status | Current evidence / next proof |
|---|---|---|---|
| P0 | Local `main` = fetched `origin/main` = authoritative remote `main` | PASS | 2026-09-15 supervisor recon: all at `377a3a3a02c5d3bb21fb7aad766279346c6ddc77`; ahead/behind `0/0`; clean worktree. |
| P0 | Control branch contains only control-plane docs before implementation | PASS | `seo/cleanup-expansion-parity-20260915` is `0` behind / `1` ahead of main at `6329c88a60149f31c655ef3e77af12c681a99b09` before this plan/matrix/ledger commit. |
| P0 | Stale branch deletion queue is exact-tip verified | IN_PROGRESS | Inventory and exact-tip reachability/PR-state proof required before deletion. |
| P0 | Unique/active branches explicitly retained | IN_PROGRESS | Populate branch-disposition evidence during P0. |
| P0 | Marketplace category URL generation uses public market host + clean `/categories/<id>` | FAIL | `lib/seoEngine/interlink.ts` currently emits `https://portal.yousafeconsultancy.com/marketplace/categories/<id>`. |
| P0 | LLM citation estate recognizes public Marketplace host | FAIL | `lib/seoEngine/llmVisibility.ts` contains Portal but not `market.yousafeconsultancy.com`. |
| P0 | Legitimate Portal/auth identity remains distinguishable from Marketplace canonical | IN_PROGRESS | Portal is still used by authenticated/app flows; P0 tests must encode this distinction. |
| P0 | Existing stale planned interlinks detected/reconciled | PENDING | Requires read-only DB count first; never equate planned rows with applied links. |
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
