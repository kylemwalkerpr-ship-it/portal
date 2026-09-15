# YouSafe SEO Cleanup-to-Expansion Parity Design

**Date:** 2026-09-15  
**Repository:** `kylemwalkerpr-ship-it/portal`  
**Control branch:** `seo/cleanup-expansion-parity-20260915`  
**Baseline main:** `377a3a3a6fb2db8ac840a2eec41264fc703fbce2`  
**Supervisor:** GPT-5.6 Sol  
**Primary executor:** GLM 5.3 Fast, High effort by default, Max effort for architecture/risk/review gates

## 1. Purpose

This program turns the existing YouSafe SEO estate from a sophisticated but partially disconnected collection of SEO capabilities into a controlled acquisition system that can prove technical integrity, assign one owner to every strategic search intent, concentrate internal authority, improve URLs that already have Google traction, build external authority, measure business outcomes, and only then resume broad content expansion.

The estate already contains substantial SEO infrastructure. This design does **not** replace the current SEO Factory, Master Engine, Content Studio, GSC connection, ranking model, ownership resolver, publishing gates, Marketplace, or MyCaseworks architecture. It closes the gap between what those systems were designed to do and what is measurably happening in production.

The operating sequence is:

**Measure → Correct estate truth → Clean technical debt → Assign intent ownership → Consolidate → Execute internal authority → Strengthen winners → Build external authority → Connect revenue → Validate outcomes → Expand by cluster → Repeat.**

## 2. What “100% parity” means

“100% parity” means **100% implementation parity with the approved YouSafe SEO architecture**, not a promise that Google will rank every target #1.

Every parity requirement must end in exactly one state:

- `PASS` — implemented and supported by evidence.
- `ACCEPTED_EXCEPTION` — deliberately not implemented, with owner, reason, and impact documented.
- `BLOCKED_EXTERNAL` — cannot be completed by repository changes; the exact external dependency and verification evidence are recorded.

There is no `mostly done`, `probably fixed`, or unverified `done` state.

External outcomes are reported separately:

- Google/Bing indexing,
- impressions,
- clicks,
- CTR,
- ranking movement,
- backlinks won,
- qualified conversions,
- LLM/answer-engine citations.

Those are observed outcomes, not implementation claims.

## 3. Current baseline and known facts

The cleanup begins from the September 15 state established by the audit and repository inspection.

### Search/authority baseline

- Latest stored GSC window contains roughly 34k impressions and almost no qualified clicks.
- Roughly 81% of measured impressions are dominated by a small off-mission university-housing/rate-table surface.
- Several qualified pages are within striking distance at roughly positions 11–35.
- Many core immigration terms remain around positions 40–90.
- The database contains roughly 1,850 `seo_interlinks` rows in `planned` state with effectively no comparable applied volume.
- Backlink tracking has identified targets but no recorded won links in the audited state.
- LLM/GEO auditing exists and now distinguishes `audit_failed` from genuine uncited outcomes, but observed citation share remains weak.
- GSC query×page persistence (`seo_gsc_rows`) exists and is already wired into opportunity, cannibalization, brief, and performance paths.
- `gsc_index_coverage` exists with fetch/list/fix routes, but the audited production dataset was not populated sufficiently to act as a dependable index-health layer.
- Ranking forecasts/rewards/calibration infrastructure exists (`seo_forecast_runs`, `seo_reward_events`, `seo_model_calibration`), but the system must prove that real shipped interventions produce matched observations and reward events.

### Existing architecture to preserve

The implementation must reuse:

- `lib/gscAuth.ts`, `lib/gscAnalytics.ts`, `lib/seoFactory/gscRows.ts`
- `app/api/content-studio/gsc/*`
- `lib/seoFactory/ownership.ts`
- `lib/seoFactory/opportunityIdentity.ts`
- `lib/seoFactory/opportunityEngine.ts` / `opportunityAction.ts`
- `lib/seoFactory/cannibalDetect.ts`
- `lib/seoFactory/coverageLinks.ts`
- `lib/seoEngine/interlink.ts`
- `lib/seoEngine/backlinkEngine.ts`
- `lib/seoEngine/llmVisibility.ts`
- `lib/seoEngine/rankingModel.ts` / reward/forecast paths
- `lib/seoFactory/sealedBrief.ts`, writing contract, linear desk, publication proof, execution fencing, and ship gates
- existing Content Studio and Command Center UI; do not build a parallel SEO application.

### Confirmed parity defects discovered during supervisor recon

1. `lib/seoEngine/interlink.ts` still defines `ESTATE_BASE.market` as `https://portal.yousafeconsultancy.com` and constructs Marketplace category targets under `/marketplace/categories/<id>`. The public Marketplace contract is now `https://market.yousafeconsultancy.com/categories/<id>`. Planned links must not be bulk-applied until this is corrected and existing rows are reconciled.
2. `lib/seoEngine/llmVisibility.ts` includes `portal.yousafeconsultancy.com` in the citation estate but does not include `market.yousafeconsultancy.com`. Citation ownership must reflect the current public estate without losing Portal where it is legitimately a portal/auth surface.
3. The engine can generate and persist interlink plans, but planned state is not equivalent to verified deployment. A link must only become `applied` after its source production artifact contains the exact normalized target URL.
4. The branch estate has accumulated many historical merged/superseded branches. Repository rules require exact-tip verification before deletion and preservation of unique work.

## 4. Non-negotiable repository/release rules

The root `AGENTS.md` remains authoritative.

- `main` is the only production source of truth.
- No agent may run direct `wrangler deploy`, `wrangler versions deploy`, OpenNext direct deploy, or replace a Worker from a local tree.
- Code changes follow branch → PR → required checks → merge to `main` → official GitHub deployment workflow.
- Never edit an already-applied migration to imply production changed. Any schema change uses a new additive migration.
- Never replay the already-applied Content Studio evidence-contract migration.
- The execution-lease migration state must be independently verified before any code path is allowed to assume it exists in production.
- No SEO cleanup phase is allowed to mass-delete content, issue redirects, or noindex high-impression/high-link URLs without evidence review.
- No phase advances because an agent says it is complete. Evidence gates advance phases.

## 5. Branch and supervision architecture

The control branch contains specifications, plans, parity matrix, and execution ledger. It is not a long-running implementation branch.

After the control documents are approved and merged, each implementation phase starts from the then-current `main` on a short-lived branch:

- `seo/parity-p0-estate-truth`
- `seo/parity-p1-measurement`
- `seo/parity-p2-technical-integrity`
- `seo/parity-p3-intent-ownership`
- `seo/parity-p4-cannibalization`
- `seo/parity-p5-off-mission-cleanup`
- `seo/parity-p6-interlink-execution`
- `seo/parity-p7-ranking-winners`
- `seo/parity-p8-trust-authority`
- `seo/parity-p9-backlink-operations`
- `seo/parity-p10-conversion-attribution`
- `seo/parity-p11-geo-visibility`
- `seo/parity-p12-validation`
- `seo/parity-p13-controlled-expansion`

Each phase has its own PR and review gate. A later phase does not accumulate on an unmerged earlier feature branch.

## 6. GLM 5.3 operating contract

GLM is the implementation worker. GPT-5.6 Sol is the supervising reviewer and may block, redirect, split, or narrow work.

### Effort selection

Use **High** for deterministic implementation:

- regression tests,
- URL normalization fixes,
- sitemap/canonical fixes,
- internal-link application code,
- data plumbing,
- dashboards,
- migration code,
- repetitive evidence collection.

Use **Max** for:

- initial phase recon,
- canonical/intent ownership decisions,
- redirect/noindex/content-retirement decisions,
- cross-host architecture,
- schema design,
- ambiguous cannibalization,
- failed-test root cause analysis after a straightforward attempt fails,
- final self-review before handoff.

Do not use Max merely to repeat deterministic edits.

### Required execution loop

For every phase:

1. Refresh `main` and read `AGENTS.md` plus this design and implementation plan.
2. Inspect current code/data before editing. Do not assume a plan statement is still current if `main` moved.
3. Run the phase baseline tests and capture failures.
4. Write regression tests for the defect/contract before production code where practical.
5. Implement the smallest coherent change.
6. Run focused tests.
7. Run TypeScript.
8. Run the relevant full suite/build required by repository policy.
9. Update the parity matrix and execution ledger with exact evidence.
10. Commit and push the phase branch.
11. Open/update a PR and **stop**.
12. GPT-5.6 Sol reviews code, test evidence, data evidence, and scope. GLM never self-approves or self-merges.

## 7. Target architecture

### 7.1 Estate truth layer

One canonical data model must answer:

- What hosts exist?
- What is each host for?
- Which public URL is canonical?
- Which repo/path owns it?
- Is it indexable?
- Which strategic intent does it own?
- Which secondary URLs support it?
- Which public URL conventions are retired?

`lib/seoFactory/ownership.ts` remains the owner/host authority. Other engines must consume that truth instead of maintaining stale host maps.

Where practical, `lib/seoEngine/interlink.ts`, LLM citation-domain configuration, and Marketplace SEO emitters should derive current public host values from shared ownership/public-host constants rather than duplicating domains.

### 7.2 SEO Estate Registry

The system needs an operational registry or materialized view capable of representing at least:

- canonical URL,
- host,
- repo/path,
- indexability,
- sitemap membership,
- status code,
- declared canonical,
- Google-selected canonical when available,
- primary intent/query family,
- country/stage/content type,
- GSC impressions/clicks/CTR/position,
- inbound/outbound internal links,
- backlink indicators,
- content freshness,
- cannibalization family,
- strategic disposition (`KEEP`, `KEEP_BUT_SILO`, `MOVE`, `MERGE_301`, `NOINDEX`, `RETIRE`),
- next action,
- evidence timestamp.

Do not introduce a second SEO platform solely to store this. Prefer existing ownership/coverage/GSC/index/interlink stores plus a focused aggregate module/API.

### 7.3 Qualified visibility

Raw GSC visibility and qualified YouSafe visibility are separate metrics.

The system must preserve raw rows for diagnosis while consistently deriving:

- junk,
- off-mission real demand,
- deep-tail,
- qualified actionable demand.

Off-mission housing/campus queries remain visible in reporting but cannot create SEO missions unless they contain an approved immigration/document/admissions/tenancy anchor.

### 7.4 Intent ownership

Every strategic query family has one primary owner URL. Supporting URLs may exist only when their reader intent is distinguishable.

Before `CREATE`, Content Studio must check:

1. current ownership registry,
2. semantic/query-family competitors,
3. GSC pages already earning impressions for the intent,
4. reader intent/jurisdiction/entity identity,
5. whether REFRESH/DEFEND/CONSOLIDATE/INTERLINK is superior to CREATE.

Opportunity identity must preserve jurisdiction + entity + reader intent so I-485 and AU subclass 485 or F-1 renewal and OPT timing cannot collide.

### 7.5 Interlink execution

The interlink system becomes a lifecycle, not a planner-only table.

Required states:

- `planned`
- `approved`
- `applied`
- `verified`
- `rejected`
- `stale`

If the existing database enum/check only supports a subset, add a new additive migration or use a separate verification field; do not silently overload meanings.

A planned edge must be revalidated against current canonical URL truth before approval. An applied edge must be verified against the source artifact/live page before being counted as executed.

### 7.6 Cannibalization/consolidation

Cannibalization detection remains recommend-first. Destructive actions require a decision record containing:

- competing URLs,
- query overlap,
- impressions/clicks/position,
- backlinks/internal links where known,
- primary intent comparison,
- selected owner,
- chosen action,
- redirect/canonical/noindex behavior,
- rollback notes.

### 7.7 Backlink operations

The existing backlink engine remains the ledger. The cleanup adds an operational cadence and truth rules:

- target status reflects actual outreach state,
- `won` requires a verified live backlink URL,
- a follow-up is scheduled only from a recorded prior touch,
- authority score is not treated as real third-party DR/DA unless sourced,
- results are tied to strategic clusters/URLs.

### 7.8 Outcome/reward loop

A repository change counts as an SEO intervention only when it can be associated with:

- URL/query family,
- action type,
- baseline window,
- ship/verification timestamp,
- observation window,
- observed GSC delta,
- optional conversion delta,
- reward attribution.

This makes the ranking model learn from actual interventions rather than generic time-series drift.

## 8. Program phases and gates

### P0 — Estate truth and branch hygiene

Goals:

- finish stale branch cleanup safely,
- reconcile public host/path constants,
- detect stale Marketplace URLs in planned interlinks/LLM estate configuration,
- establish the parity ledger.

Gate:

- no known engine component emits a retired Marketplace public URL;
- branch deletion queue contains only exact-tip merged/superseded branches;
- unique branches are explicitly retained/archived.

### P1 — Measurement integrity

Goals:

- prove GSC sync freshness,
- populate and operationalize index coverage,
- run/ingest a fresh crawl where available,
- expose qualified vs raw visibility,
- prove LLM audit failure accounting,
- prove reward tracking inputs.

Gate:

- reproducible current GSC rows,
- priority URL inspection/index evidence,
- crawl date is current enough for cleanup decisions,
- failed audits do not lower citation share,
- missing provider/API data is explicitly `unavailable`, not `0`.

### P2 — Technical integrity

Goals:

- sitemap correctness,
- canonical normalization,
- redirect/4xx cleanup,
- parameter duplicate cleanup (`?lang=en` and similar),
- schema validation,
- broken internal link cleanup,
- orphan classification.

Gate:

- 0 invalid sitemap URLs,
- 0 meaningful canonical conflicts,
- no known retired public URL emitted by runtime code,
- priority indexable orphans resolved or justified.

### P3 — Intent ownership

Goals:

- map strategic query families to one owner,
- align host roles,
- encode owner checks before CREATE,
- build missing intent registry evidence.

Gate:

- 100% of strategic intents mapped,
- ≥95% of all active priority intents mapped,
- no new article can be created without owner resolution.

### P4 — Cannibalization consolidation

Priority clusters:

1. Canada spouse/spousal sponsorship,
2. US F-1/OPT/STEM OPT,
3. Australia 485,
4. UK Student/Graduate/Skilled Worker/dependants,
5. Express Entry.

Gate:

- no unresolved major collision in priority clusters;
- redirects/noindex actions have evidence and regression coverage.

### P5 — Off-mission cleanup

Goals:

- classify high-impression housing/campus pages,
- keep useful international-student/tenancy content without letting it dominate mission metrics,
- retire/silo only with evidence.

Gate:

- raw visibility and qualified visibility are both available;
- off-mission pages cannot generate missions;
- every high-impression off-mission URL has an explicit disposition.

### P6 — Internal authority execution

Goals:

- repair stale planned edges,
- prioritize targets by ranking opportunity,
- apply in safe batches,
- verify production presence,
- mark rejected/stale edges truthfully.

Priority order:

1. targets positions 8–20,
2. positions 21–40,
3. positions 41–70 with strategic demand,
4. unproven pages only after evidence.

Gate:

- ≥80% of approved useful backlog is verified applied or explicitly rejected/stale;
- strategic canonicals have multiple relevant inbound links;
- no applied count is based solely on DB state.

### P7 — Strengthen ranking winners

Goals:

- optimize near-win pages based on actual query/page evidence,
- improve answer-first structure, information gain, primary sourcing, title/CTR packaging, internal authority, and conversion paths.

Gate:

- every selected near-win has before/after evidence and an observation schedule.

### P8 — Trust/E-E-A-T

Goals:

- truthful author/reviewer surfaces,
- editorial standards/source methodology/correction policy,
- YMYL disclaimers/scope where appropriate,
- source freshness.

Gate:

- priority YMYL pages expose truthful authorship/review/source evidence and no fabricated credentials.

### P9 — External authority

Goals:

- move backlink targets through real outreach,
- reclaim broken/unlinked mentions,
- create citation-worthy tools/data assets where evidence supports them.

Gate:

- backlink process produces verified `won` links;
- won state requires live URL verification.

### P10 — Conversion attribution

Goals:

- track organic landing → CTA → Marketplace/service → lead/order/revenue while preserving privacy.

Gate:

- at least one strategic cluster can be traced from organic landing to meaningful business event without inferring unknown conversions.

### P11 — GEO/AI visibility

Goals:

- correct estate-domain truth,
- improve quotable answer structure and sources,
- measure citation share by successful engine,
- compare competitor citations.

Gate:

- audit failures are excluded,
- current public estate domains are recognized,
- remediation is based on measured query/page ownership rather than generic “add llms.txt” output.

### P12 — Validation

Goals:

- compare interventions against GSC and business outcomes,
- populate reward events where observation windows mature,
- decide which tactics actually work.

Gate to expansion:

- technical debt gates remain green,
- priority clusters show measurable ranking/qualified-click progress or have a documented failure diagnosis,
- link/backlink execution is functioning,
- measurement is current,
- Content Studio is not creating duplicate intent owners.

### P13 — Controlled expansion

Expansion happens by cluster, not article count.

Recommended first waves after evidence validation:

1. Australia 485,
2. Canada family,
3. US F-1/OPT,
4. UK student/dependant/work,
5. Express Entry.

A new page requires an immutable SEO writing contract containing identity, evidence, owner, query family, internal-link plan, sources, unique information gain, commercial path, and publication/observation requirements.

## 9. Expansion allocation

After expansion unlocks, SEO actions should remain portfolio-based rather than CREATE-dominated. Default planning allocation:

- 40% refresh/defend existing winners,
- 20% consolidate/cannibalization/technical ownership,
- 20% new supporting cluster pages,
- 10% authority asset/tool,
- 10% high-intent commercial opportunity.

The ranking/reward model may adjust this mix only after sufficient observed evidence.

## 10. Testing strategy

Each implementation PR must include focused regression coverage for changed contracts and run the repository-required checks.

Minimum local/CI sequence unless a narrower repo rule supersedes it:

```bash
git diff --check
npx jest <focused test files> --runInBand
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json
TZ=UTC NODE_OPTIONS=--max-old-space-size=8192 npx jest --ci --runInBand
npm run build
```

Production-dependent verification must be separated from unit/CI proof. A green build is not proof that Google indexed a page, a backlink exists, or a live page contains an internal link.

## 11. Evidence rules

Evidence recorded in the execution ledger must identify:

- branch,
- head SHA,
- PR,
- tests/checks,
- database/crawl/GSC observation timestamp when relevant,
- exact URLs/query families affected,
- whether the evidence is repository, staging, production, Search Console, crawl, or external.

Do not convert missing data into zero.

## 12. Safety rules for destructive SEO actions

A redirect/noindex/retirement action is prohibited when the source URL has material impressions, clicks, links, or strategic value until the decision record is complete.

Mass operations require:

- dry run,
- affected URL list,
- pre-change snapshot,
- deterministic rollback path,
- post-change live verification.

## 13. Automation/terminal supervision design

The ideal local loop uses an authorized terminal connector (Remote Desktop Commander) against the user’s Mac.

Once connected, the supervisor may:

- inspect the local clone under Documents,
- verify the working tree is clean,
- fetch/prune origin,
- create worktrees/branches,
- run tests/builds,
- invoke the user’s Freebuff/GLM command if it exposes a CLI or interactive terminal command,
- feed the exact phase contract to GLM,
- capture GLM output/logs,
- inspect diffs,
- commit/push only when the phase contract allows,
- delete proven stale branch refs after exact-tip verification.

The terminal connector does not change production authority: no direct Cloudflare deploy, no bypass of GitHub review, no unapproved destructive DB migration.

## 14. Definition of program completion

The cleanup-to-expansion program is complete when:

1. every parity-matrix requirement is `PASS`, `ACCEPTED_EXCEPTION`, or `BLOCKED_EXTERNAL` with evidence;
2. the estate’s runtime host/canonical/link truth is consistent;
3. measurement is fresh and qualified visibility is separated from raw pollution;
4. strategic intent ownership is enforced before CREATE;
5. major cannibalization is resolved;
6. internal authority recommendations become verified live links;
7. external authority operations produce verified wins;
8. ranking interventions can be tied to observed outcomes/rewards;
9. conversion attribution is truthful;
10. expansion is gated and cluster-based rather than volume-based.

The end state is a self-correcting acquisition loop:

**Demand → qualification → identity/intent owner → evidence → action choice → content/technical/link intervention → verified publication → search/authority/conversion observation → reward attribution → recalibration → next action.**
