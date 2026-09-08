# Content Studio: targeted DeepSeek gap brief

Static code review, 2026-09-07. Implement through the existing engine and ship door; preserve unrelated changes. No paid tools, live ingestion, publishing, migrations, or production writes in this task. Do not promise rankings. Existing ontology matching, real-demand inputs, keyword difficulty, supply/revenue scoring, predictive adjustment, shipped-topic suppression, link verification, draft gates and reward cron are implemented; extend them rather than create parallel systems.

## P1 — Preserve demand jurisdiction and stage (first)

**TASK:** Stop planner filters from relabelling unrelated demand.

**FILES:** `lib/seoEngine/planner.ts:843` (candidate selection), focused planner tests.

**REQUIREMENTS:** `bestCellForTerm` identifies a cell, but lines 848–849 replace it with requested stage/country. A UK-specific query can therefore become a US mission with UK metrics; the same occurs across stages. Treat filters as inclusion constraints on matched cells. Preserve original signal provenance and exclude incompatible candidates; explicitly handle ambiguous queries using existing matching semantics. Keep supply, difficulty and revenue scoring intact.

**VERIFY:** UK-explicit demand never becomes US under a US filter; visa-only demand never becomes housing under a housing filter; matching/unfiltered demand retains metrics and ranking. Empty filtered results remain empty, without synthetic demand.

## P1 — Carry intelligence evidence into the article brief

**TASK:** Connect ingested intelligence to generation as evidence, not only a score multiplier.

**FILES:** `lib/seoEngine/planner.ts:635`, `:1038`; `lib/seoFactory/pipeline.ts:343`; `lib/seoFactory/linkAudit.ts:1021`; existing plan-to-composer adapter and its tests (locate from `AdminSeoEngine`'s `onBrief` callback).

**REQUIREMENTS:** Knowledge rows contain URLs/summaries, but the narrative prompt at 1048–1058 supplies demand, ontology authorities/statutes and generic proof points without selected knowledge items. The generation allowlist contains URL/title lines; URL reachability does not prove a factual claim. Add a bounded evidence packet to each selected plan: source URL, source identity, published/observed dates, relevant supplied excerpt, and explicit verification status. Persist it and carry it through the existing handoff into `sources` and writer context. Do not call AI summaries verified primary evidence or invent excerpts. Require a concrete reader-value deliverable in the brief—e.g. a sourced jurisdiction-specific comparison or decision checklist—and unresolved factual questions when evidence is insufficient. Preserve existing source/link checks.

**VERIFY:** Fixture intelligence survives plan persistence, composer handoff and writer prompt with identical URL/date/excerpt; irrelevant-country evidence is excluded. Missing source text produces an explicit research/verification requirement, not a fabricated fact. Existing manual generation remains compatible.

## P1 — Prevent undated intelligence from appearing fresh

**TASK:** Represent freshness uncertainty consistently.

**FILES:** `lib/seoEngine/planner.ts:635`, `:656`; `lib/seoEngine/knowledge.ts:515`; existing intelligence freshness helper/tests.

**REQUIREMENTS:** Ingestion stores malformed/missing publication dates as null. `knowledgeBias` substitutes `now` for null and age zero for invalid dates (664–666), giving full freshness to undated items indefinitely. Select a stable observed/first-seen timestamp from existing storage where available; preserve unknown publication date separately. Reuse decay logic, assign an explicit uncertainty penalty when neither timestamp is trustworthy, and prevent repeat ingestion from rejuvenating unchanged items. Do not relabel fetch time as publication time.

**VERIFY:** Known old items decay; invalid/null dates never get a fresh-publication bonus; unchanged ingestion retains its age; valid new policy items retain an appropriate advantage. Surface provenance uncertainty in the P1 evidence packet.

## P1 — Make mandatory draft verdicts binding at ship

**TASK:** Align the ship decision with mandatory YMYL evidence checks.

**FILES:** `lib/seoFactory/ship.ts:605`, `lib/seoEngine/gate.ts:137`, focused ship/gate tests.

**REQUIREMENTS:** `gate.ts:148–151` fails a critical draft when either statutory citation or disclaimer is missing. `ship.ts:617–624` blocks only when both are missing (`missingMandatory.length >= 2`) and only for its legal-content subset. Use the authoritative mandatory-check result so one missing required item also holds shipping for mapped critical content. Keep advisory style/score checks distinct; document intentional thresholds. A mandatory evaluation error must produce a hold with a reason, not the current nonblocking catch. Existing depth, quality, render and ownership gates remain in place.

**VERIFY:** Neither/only citation/only disclaimer fixtures cannot write Git for critical content; both-required-present can proceed subject to other gates. Test a thrown mandatory evaluation and relevant regional as well as legal targets. Do not claim citation presence proves substantive legal accuracy.

## P1 — Stop overlapping-window clicks becoming repeated rewards

**TASK:** Correct performance attribution before using rewards to guide priorities.

**FILES:** `lib/seoEngine/rankingModel.ts:1341`, existing reward persistence/tests; cron caller `app/api/cron/seo-engine-daily/route.ts:178`.

**REQUIREMENTS:** The live attribution loop matches a job through a 24-character query substring (`:1362`), supplies the entire GSC window's clicks as `deltaClicks` (`:1382`), and deduplicates by UTC run day (`:1367`). Thus another day can re-credit overlapping observations, and query clicks are not evidence of that page's incremental performance. Match canonical page/property plus query and explicit observation window; use disjoint post-publication periods and a baseline for improvement claims. If required page/window/baseline data is unavailable, retain a labelled observation without improvement reward. Persist actual action identity instead of unconditional `refresh`. Reuse existing GSC access and reward tables; propose a minimal schema change only if essential.

**VERIFY:** Reprocessing the same observation on another run date adds no reward; unrelated pages sharing a query do not receive attribution; pre-publication clicks are excluded; missing baseline yields no invented delta; a controlled before/after fixture credits only measured change.

## Scope and limits

Internal-link generation/verification and competing-page inputs already exist (`interlink.ts:140`, `linkAudit.ts:713`, `pipeline.ts:198,876`); no blanket claim that cannibalization/linking is missing. This review did not validate live inventories, GSC access, source freshness in production, or ranking outcomes. Acceptance is deterministic pipeline behavior with fixtures and targeted tests, not search-position promises. Update architecture docs only for the resulting contracts; no broad rewrite.
