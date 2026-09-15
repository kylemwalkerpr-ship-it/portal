# Content Studio paired editorial benchmark protocol (2026-09-14)

This document defines the benchmark Codex requested. It is **not** a completed benchmark result and the topic list below is **not** evidence that live provider drafts were generated.

## Required paired benchmark

For each of the 12 topics below, produce two evidence-backed drafts from the actual candidate and comparison workflows/models being evaluated. Remove provider/model labels before human review. The reviewer must score each draft independently and choose the preferred draft for the pair.

Do not silently substitute a different production author-model policy. If the originally planned runtime is unavailable, record the actual alternate model/workflow used for that benchmark run.

### Eight scoring dimensions (1-5 each)

1. **Decision usefulness** — answers the reader's real question early and helps them decide what to do next.
2. **Argument coherence** — one connected argument; later sections advance it instead of restarting or repeating the thesis.
3. **Factual support** — material claims are supported by the evidence contract / allowed sources, with unsupported claims omitted rather than guessed.
4. **Qualification and uncertainty integrity** — preserves conditions, exceptions, dates, amounts and uncertainty; does not strengthen evidence into guarantees.
5. **Structure and format fit** — uses the format the problem needs without padding, generic kits, duplicated FAQ/H2 material or manufactured substantive sections.
6. **Natural human readability** — clear, varied, specific prose without keyword stuffing, mill openers, templated filler or obvious AI scaffolding.
7. **Actionability and source navigation** — gives concrete next steps and makes official/source verification easy where the topic requires it.
8. **Commercial/editorial fit** — Marketplace/product CTA is relevant and restrained, or honestly absent when no conversion path belongs in the article.

Also record two explicit headline ratings for each draft:

- **Usefulness:** 1-5
- **Factual support:** 1-5

### Critical factual-defect rule

A fabricated or materially altered **fee, date/deadline, eligibility rule, processing/outcome claim, legal requirement, or guaranteed result** is a critical defect. A draft with a critical defect cannot win its pair regardless of style score, and the benchmark cannot be represented as passing while critical fabricated defects remain.

### Acceptance target

The candidate workflow target is:

- human preference: **at least 9 of 12 pairs**;
- no critical fabricated fee/date/outcome/rule defects in the accepted candidate drafts;
- usefulness and factual-support ratings recorded for every draft;
- evidence/source references retained so Codex can inspect why factual-support scores were assigned.

These are benchmark gates, not production promises.

## Twelve benchmark pairs

| # | Topic | Format | Intended host | Evidence/risk focus |
| --- | --- | --- | --- | --- |
| 1 | Canada inland spousal sponsorship proofs | procedural guide | ca.yousafeconsultancy.com | Evidence sequence; do not infer current processing weeks. |
| 2 | US F-1 to OPT timing | explainer blog | usa.yousafeconsultancy.com | Reader intent must stay distinct from F-1 renewal/general status. |
| 3 | Form I-485 adjustment packet | procedural guide | legal / usa | Must not collide with Australian subclass 485 intent. |
| 4 | Australia subclass 485 work rights | regional guide | au.yousafeconsultancy.com | Jurisdiction and subclass evidence; distinct from I-485. |
| 5 | UK Graduate Route vs Skilled Worker | comparison | uk.yousafeconsultancy.com | Decision comparison, not FAQ padding. |
| 6 | Express Entry CRS without a job offer | long-form analysis | ca.yousafeconsultancy.com | Do not invent current cut-offs or outcomes. |
| 7 | Bookkeeping service for an LLC | business explainer | market.yousafeconsultancy.com | Non-immigration format; no visa/legal kit contamination. |
| 8 | Police certificate timing for inland PR | short explainer | ca.yousafeconsultancy.com | Respect concise intent; do not pad to an arbitrary long-form target. |
| 9 | H-1B specialty occupation evidence | procedural guide | legal.yousafeconsultancy.com | LCA/evidence constraint and qualification preservation. |
| 10 | Canada study permit funds proof | regional guide | ca.yousafeconsultancy.com | Do not invent or stale-copy financial thresholds. |
| 11 | First 30 days after landing | settlement guide | settlement category | Settlement decisions, not another immigration-status explainer. |
| 12 | Marketplace zero-result cluster | research memo | portal / market | Unknown conversion coverage is not zero revenue; first-party counts are not monthly volume. |

## Result table — intentionally empty until a real run

| # | Candidate workflow/model | Comparison workflow/model | Candidate usefulness | Candidate factual support | Comparison usefulness | Comparison factual support | Preferred | Critical defects | Evidence / reviewer notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |
| 2 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |
| 3 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |
| 4 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |
| 5 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |
| 6 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |
| 7 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |
| 8 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |
| 9 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |
| 10 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |
| 11 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |
| 12 | NOT RUN | NOT RUN | — | — | — | — | — | — | — |

## Current status

**Benchmark gate: NOT MET.**

This branch contains regression tests, contract fixtures and this benchmark protocol, but it does not contain 12 real blinded provider pairs or human preference scores. No live 12-article generation, TinyFish paid collection, destination-repository deployment, merge to `main`, or article publication was performed as part of documenting this protocol.
