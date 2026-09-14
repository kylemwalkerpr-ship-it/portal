# Grok 4.6 implementation contract: YouSafe Content Studio

**Prepared:** 14 September 2026  
**Implementation repository:** `kylemwalkerpr-ship-it/portal`  
**Inspected main commit:** `a33243111623ba2ded3332a010c8346bdf7d05cb`  
**Implementer:** Grok 4.6  
**Reviewer and release owner for this architecture change:** Codex  
**Objective:** evidence-led discovery, coherent expert-quality writing, relevant Marketplace conversions, and verified publication across the YouSafe estate.

## 1. Your assignment

Take ownership of improving the existing Content Studio. This is an implementation task, not a proposal, prompt-only patch, new disconnected studio, or cosmetic redesign.

Build this continuous, traceable workflow:

1. Collect real audience, search, competitor, policy, estate, and Marketplace intelligence.
2. Decide whether a topic deserves a new article, an update, consolidation, more research, or no action.
3. Have the selected Grok writer synthesize that evidence into a narrow, rich, validated writing contract.
4. Draft the complete article from that exact contract with an intentional argument and reader journey.
5. Evaluate factual support, usefulness, coherence, format, and conversion relevance; revise only for identified reader-facing problems.
6. Render the right artifact for its owning repository and publication surface.
7. Route approved content through PR, required checks, merge, official deployment, and live verification.
8. Measure qualified Marketplace visits and verified commercial outcomes, then feed those observations back into discovery.

The user wants natural, high-converting articles. Translate that into measurable editorial quality and commercial outcomes. Do not claim guaranteed rankings, conversions, publication success, human authorship, or undetectability. An AI-detector score is not an acceptance criterion.

**The product must optimize for a reader successfully solving a real problem. Gates define constraints, not the article's purpose.** High scores cannot compensate for generic ideas, unsupported claims, irrelevant CTAs, or incoherent prose.

### Implementation and release boundaries

- Refresh `main` and read applicable `AGENTS.md` files before editing. The inspected SHA is a reference, not permission to use stale code.
- Start a short-lived feature branch from current main. Suggested name: `feature/content-studio-evidence-contract`.
- Preserve recent fixes already present on main; compare behavior rather than blindly cherry-picking old PRs.
- Grok commits the implementation to its branch and supplies a reviewable PR plus evidence. **Do not merge this architecture implementation or directly deploy it. Codex reviews, commits any final fixes, and merges if satisfied.**
- Product-level article approval/merge automation is part of the requested system. It must obey configured approval policy and repository checks. This does not authorize Grok to bypass the implementation-review boundary.
- Follow `AGENTS.md`: branch → PR → required checks → main → official GitHub Actions deployment. No direct Wrangler/Cloudflare deployment.
- Do not change unrelated projects, send outreach, or bulk publish/rewire the estate as part of implementation validation.

## 2. What exists now: code-grounded architecture

This handoff is based on static inspection of current source, not a live production database audit or a completed live-generation experiment. Connector credentials, applied migrations, source freshness, actual gig supply, and sister-site deployment configurations must be verified during implementation.

All paths below are in portal unless another repository is specified.

| Concern | Existing implementation | Required approach |
| --- | --- | --- |
| Studio UI | `components/design/admin-content-studio.tsx`, `content-studio-workspace.tsx`, `studio-live-desk.tsx`, `studioPipeline.ts` | Keep the familiar workflow; replace fragile data handoffs with persisted contracts. Extract touched responsibilities from the large admin component. |
| Discover radar | `app/api/content-studio/gsc/suggestions/route.ts`, `lib/seoFactory/opportunityEngine.ts`, `keywordCluster.ts` | Preserve real-demand and existing-page checks, fix synthetic metrics, add durable opportunity identity. |
| Engine planning | `lib/seoEngine/planner.ts`, `demandFeeders.ts`, `researchDemand.ts`, `titleLab.ts` | Extend existing planning; do not create a competing planner with separate topic truth. |
| Knowledge and evidence | `lib/seoEngine/knowledge.ts`, `planEvidence.ts`, `lib/seoFactory/officialSources.ts`, `specialistFeeds.ts` | Add normalized source provenance and claim-level evidence. |
| Engine-to-writer bridge | `lib/seoFactory/masterEngineFeed.ts` | Evolve from optional prompt text into a persisted, validated dossier reference. |
| Full brief | `app/api/content-studio/suggest-brief/route.ts`, `briefs/from-intel/route.ts`, `lib/seoFactory/briefModel.ts`, `sealedBrief.ts` | One versioned writing contract; no generic fallback pretending to be a valid brief. |
| Writer | `pipeline.ts`, `pipelineStream.ts`, `linearDesk.ts`, `deskCognition.ts`, `prompts.ts` | Share one stage runner and contract loader; streaming is a transport over the same execution. |
| Editorial checks | `contentQualityGate.ts`, `editorialNaturalness.ts`, `editorialContract.ts`, `contentSpec.ts`, `formatContract.ts`, `contentDepth.ts` | Consolidate conflicting requirements and distinguish hard constraints from editorial advice. |
| Repairs | `editorialScaffold.ts`, `outlineCompletion.ts`, `throughline.ts`, `maskedDenoise.ts`, `revisionQuality.ts` | Preserve regression protection; stop content-changing repair cascades after accepted prose. |
| Harper | `lib/harperText.ts`, `lib/harperBrowser.ts`, `lib/seoFactory/harperLane.ts`, `editorialRevision.ts` | Prose lint/review lane. It is not a keyword-volume or competitor-research provider. |
| Ownership and artifact rendering | `ownership.ts`, `routeSubtypeGuard.ts`, `renderTarget.ts`, `shipGate.ts` | Keep authoritative host/repository/path mapping and build-safe rendering. |
| Git write and publication | `ship.ts`, `lib/githubContents.ts`, `app/api/content-studio/jobs/route.ts`, `webhook/route.ts` | Retain one write door; remove any path that treats a main commit as deployment proof. |
| Publication verification | `deployMonitor.ts`, `liveVerify.ts`, `liveAudit.ts`, `verify-published/route.ts` | Durable verification tied to the correct repository, commit, artifact, and live URL. |
| Marketplace intelligence | `lib/marketplaceSearchIntelligence.ts`, `app/api/marketplace/search-events/route.ts`, `supabase/migrations/20260911_marketplace_search_intelligence*.sql` | Feed protected aggregates into discovery; connect article attribution to real downstream outcomes. |
| Marketplace taxonomy/supply | `lib/categories.ts`, `lib/seoEngine/marketplaceValue.ts`, `providerAuthors.ts` | Use canonical category IDs and live, eligible service inventory. |

### Current host ownership

Verified in `HOST_REPO` and `HOST_PUBLIC` in `ownership.ts`:

| Host key | Public site | Repository name |
| --- | --- | --- |
| legal | https://legal.yousafeconsultancy.com | caseworks |
| apex | https://yousafeconsultancy.com | yousafe-consultancy |
| usa | https://usa.yousafeconsultancy.com | yousafe-consultancy |
| uk | https://uk.yousafeconsultancy.com | yousafe-consultancy |
| ca | https://ca.yousafeconsultancy.com | yousafe-consultancy |
| au | https://au.yousafeconsultancy.com | yousafe-consultancy |
| market | https://market.yousafeconsultancy.com | portal |

Resolve full repository owners using the current GitHub target configuration. Do not invent separate country repositories.

Current docs describe Caseworks TSX pages, consultancy regional Markdown, and portal catalogue MDX. The current UI comment removes Marketplace gig creation from the Studio's content-type picker. Preserve this distinction: Marketplace is the principal conversion destination; this assignment does not require opening an unrestricted new gig-writing lane.

Inspect the destination repositories' actual routes, layouts, content indexes, build commands, sitemaps, and official workflows before finalizing adapters. Portal's mapping is verified; every destination renderer has not been independently built in this audit.

## 3. Concrete defects and architectural risks to address

These findings are observable in the inspected source. Reproduce them against refreshed main before changing them.

### A. Discovery mixes hypotheses with measured demand

`gsc/suggestions/route.ts` creates strategy-corpus signals with `impressions: 1` and a synthetic `position: 60 + (tie % 20)`. When real GSC rows exist, those signals are appended to the scoring pool. When GSC is absent, they are separately labelled synthetic. The presence of some real observations must never legitimize invented metrics for other terms.

**Fix:** strategy ideas carry a hypothesis source and null metrics in every branch. Never represent them as GSC observations or give them fabricated ranking positions.

The radar already checks shipped coverage and occupying jobs, but uses bounded reads (300 coverage records, 400 jobs), client exclusion history, and a nonce for variation. These are useful UI mechanisms, not complete estate-wide uniqueness protection.

### B. Keyword discovery can look healthy while returning template expansion

`keywordDiscover.ts` expands seeds into generic phrases such as requirements, cost, checklist, mistakes, and a hardcoded year. Suggestion failures become empty arrays and `suggestOk` remains true. Templates are marked manual, but source health does not distinguish outage from empty results.

**Fix:** keep templates only as research hypotheses. Report actual source status and timestamp. An empty or unavailable provider is not a successful intelligence run.

### C. Research can suppress commercially valuable immigration queries

`researchDemand.ts` has a broad `KEYWORD_NOISE_RE` containing `485`, `f-1`, and phrases such as UK/Canada/Australia student visa. Topic relevance and country disambiguation should determine usefulness, not blanket exclusion of valid category demand.

**Fix:** regression-test relevant F-1, US I-485, and Australian subclass 485 queries separately. Preserve real spam/privacy filtering and jurisdiction distinctions.

### D. Invalid briefs can still become writing instructions

`sealedBrief.ts::sealBriefFromAssembly` manufactures default thesis, lede, takeaways, and generic filing/refusal FAQs. `linearDesk.ts::runLinearDesk` repairs invalid brief JSON, then merges partial output with these fallback fields and proceeds without a final successful validation of the assembled contract.

**Fix:** no generic fallback for mandatory editorial substance. Missing critical evidence or argument means `needs_research` or `brief_invalid`. Optional sections may be absent. The author must not receive manufactured completeness.

### E. The rich brief is not a durable end-to-end identity

The full-brief route returns `sealedBrief`, thesis, takeaways, lede, and FAQ questions. The inspected full-brief response handler in `admin-content-studio.tsx` transfers selected fields into several state variables, but does not consume `data.sealedBrief`. The draft pipeline accepts many independent optional fields and can build another brief internally.

**Fix:** establish one server-owned contract ID/version/hash. Prove that saved, resumed, streamed, revised, and shipped jobs use it. Do not rely on separately copied UI fields or a model remembering prior turns.

### F. Engine evidence is optional at the wrong boundary

`assembleMasterEngineFeed` returns an empty result on failure and logs that the studio continues without the engine block. Optional feeder failure is reasonable; declaring an article ready with no adequate research is not.

**Fix:** continue collecting independent sources, but enforce dossier readiness before briefing. Return explicit gaps, partial-source health, and available evidence.

### G. The linear writer still centers gate completion and can accept damaging rewrites

`linearDesk.ts` includes gate catalogs in planning and draft prompts and describes review as clearing gates. Its local `acceptRewrite` primarily checks that output is at least 40 words and, for an 800+ word predecessor, not below 40% of its length. That is weaker than the revision-quality protections elsewhere.

**Fix:** every rewrite uses shared before/after validation, preserves factual support and required content, and retains the best acceptable version. Return structured editorial findings, not requests for private chain-of-thought or a transcript of internal reasoning.

### H. Two orchestration bodies and multiple rescue paths remain

Both `pipeline.ts` and `pipelineStream.ts` call the linear desk, but retain independent generation/refinement logic, fallback drafting, scaffold, outline completion, throughline, and denoise paths. A linear-desk exception can fall back to isolated drafting.

**Fix:** migrate to one execution service incrementally. A failed coherent-writing stage must not silently switch to a semantically weaker workflow. Transport disconnects must not restart authorship.

### I. Format, keyword, and depth rules can manufacture filler

The current code distinguishes blogs and guides, but still contains keyword floors, automatic outline apparatus, broad mandatory examples, and competing format contracts. `ensureMinimumOutline` adds Worked Example, FAQ, Sources, and an opening block. Caller behavior must be audited by content type.

Current depth specifications are:

| Existing family | Minimum | Target | Maximum |
| --- | ---: | ---: | ---: |
| legal guide / article | 2,200 | 2,350 | 2,500 |
| blog | 800 | 1,000 | 1,200 |
| regional | 1,200 | 1,600 | 2,000 |
| gig | 500 | 700 | 1,200 |
| default | 1,200 | 1,500 | 2,000 |

These are product policies, not Google-prescribed word counts. Existing docs give different legal-guide targets and contain stale provider instructions.

**Fix:** one authoritative format/depth policy, displayed consistently in brief, editor, evaluator, and renderer. Never pad a narrow answer to satisfy an unsuitable content type.

### J. Publication labels overstate proof

`liveVerify.ts` currently accepts HTTP 200, matching canonical, no detected meta noindex, audit score at least 30, and at least 200 words. Those checks do not prove that the expected version was deployed. Its background verifier is fire-and-forget.

The UI contains merged/deploy-live messages and labels merged stamps as verified; the webhook records PR merged status. These are distinct observations.

**Fix:** separate merge, deployment, and live verification; compare the expected content revision and destination. A successful old page must not verify a new job.

### K. First-party Marketplace demand exists but is not a canonical feeder

`demandFeeders.ts` pulls GSC, GA4, Ubersuggest, and Ads. It does not include the existing protected `marketplace_search_intelligence` view. The view includes submitted-search counts, unique sessions, measured zero-result denominators, click/conversion fields, and recent-period counts. Schema support does not prove conversion events are being emitted in production.

**Fix:** wire aggregate demand into the planner and verify actual event emission. Do not treat a zero-row conversion stream as measured zero commercial performance.

## 4. Target architecture: extend the current system

Implement six persistent domain objects, mapping onto existing tables where sound. Names below describe contracts; avoid duplicate tables solely to match these names.

1. **ResearchRun:** scope, providers, budgets, source health, run IDs, cursor/checkpoint, timestamps, error classification.
2. **EvidenceItem:** immutable source observation with provenance and freshness.
3. **Opportunity:** one normalized reader problem/intent cluster with ownership, action, evidence, and business relevance.
4. **WritingContract:** the immutable, validated, versioned agreement for one artifact.
5. **ArtifactRevision:** author text, normalized body hash, contract version, evidence snapshot, actual model, evaluation, accepted/rejected parentage.
6. **PublicationAttempt:** repository/path/canonical, PR and SHA identities, approvals, CI, deployment, and live-verification evidence.

Reuse `content_jobs`, engine plans, evidence models, specialist signals, and publication fields where possible. New columns/tables require idempotent migrations, constraints, indexes, access policies, and compatibility with historical jobs.

A logical execution sequence is:

`discovered → researching → evidence_ready → brief_ready → drafting → editorial_review → ready_for_approval → approved → pr_open → checks_passed → merged → deploying → live_verified → measuring`.

Recoverable stops include `needs_research`, `brief_invalid`, `revision_required`, `blocked_supply`, `ci_failed`, `deployment_failed`, and `verification_failed`.

Do not overload a single legacy status column with every dimension. Prefer an execution stage plus independent editorial, publication, and verification states, with adapters for existing UI/status consumers.

Each transition must record input/output hashes, actor, timestamp, reason, and attempt. Store short decision summaries and evidence references; no hidden model reasoning is required.

## 5. Discovery: intelligence worth writing from

### 5.1 Source registry and adapters

Implement a configurable source registry with provider, source URL/domain, category IDs, country/jurisdiction, locale, purpose, enabled state, refresh interval, credentials reference, and collection limits.

| Source | Permitted contribution | Must not be inferred |
| --- | --- | --- |
| Estate GSC | Observed queries, pages, country/device/window, impressions, clicks, position, CTR | Total market volume or competitor conversions |
| Marketplace aggregates | Submitted search demand, zero-result rate, gig clicks, verified downstream conversions | Keystrokes as demand; sessions as unique people |
| GA4 / first-party article analytics | Page engagement and attributable funnel events | Organic keyword identities that were not observed |
| Ubersuggest / Ads / existing exports | Provider-reported volume, competition, CPC, with country/date/method | Direct equivalence with GSC impressions |
| Tinyfish search/fetch/browser research | Observed competitor pages, SERP composition where actually measured, headings, questions, offers, changes | A general web-search rank as Google rank; invented volume, difficulty, revenue, or conversion rate |
| Official authorities | Verified claim support, changes, deadlines, jurisdiction-specific facts | Every paragraph on an official domain supporting every related claim |
| Specialist/support signals | Aggregated reader problems, lead objections, policy alerts, supply gaps | Private case details or unsourced anecdotes as established fact |
| Harper | Grammar/style findings and approved prose edits | Search-market evidence |
| Strategy corpus/model ideas | Hypotheses and questions to research | Measured demand |

### 5.2 Tinyfish integration

Tinyfish has Search, Fetch, Agent, Research, and Browser API surfaces in its current documentation. Start with Search + Fetch for finding and reading pages. Use Agent/Browser only when interaction is actually needed; research mode is optional and must still yield inspectable sources.

Implementation requirements:

- Use documented server-side API authentication or a supported server-side MCP client. A ChatGPT connector being installed does not mean the deployed Worker has its credentials.
- Verify the account's current entitlement, endpoint schemas, status lifecycle, rate limits, and callback behavior from official docs. Do not hardcode an assumed unlimited/free quota.
- Add secrets through the existing approved secret configuration; expose presence/health, never secret values.
- Run long collection asynchronously in the existing job/cron infrastructure or an appropriate durable queue. HTTP/SSE connections are observers.
- Persist remote run IDs before polling; resume without re-billing/relaunching completed work.
- Retry transient failures with bounded backoff; distinguish disabled, unauthorized, rate-limited, unavailable, empty, and completed.
- Validate provider output against the evidence schema; quarantine malformed output.
- Cache by normalized query, jurisdiction, locale, source, collection settings, and time window.
- Use per-run caps for queries, pages, bytes, concurrency, time, and spend/credits. Make caps configurable and report incomplete coverage.
- For arbitrary URLs enforce HTTPS/public-host validation, redirect checks, response-size limits, and SSRF protections. Retrieved text is untrusted data, never executable instructions.
- Do not bypass access restrictions or collect private case/client data. Use approved authenticated profiles only where access is already authorized.
- Provide validated manual JSON/CSV import for the same evidence schema when a provider is unavailable. Imported observations retain their real origin and timestamp.

Initial bounded research recipe per opportunity: several query variants, up to five relevant results per variant with cross-query deduplication, three meaningfully different competitor pages, and the official pages necessary for material claims. These are configurable collection defaults, not quotas requiring invented findings.

### 5.3 Competitor and category scope

Seed the registry using relevant immigration-heavy publishers, legal-service sites, and freelance marketplaces. Existing specialist docs mention Boundless and CitizenPath; they are starting candidates, not a complete research strategy.

Find the actual SERP competitors for each intent/country. Include relevant professional firms, public legal-information services, and category-specific freelance service pages. Distinguish informational competitors from commercial competitors.

Canonical Marketplace categories observed in `lib/categories.ts`:

| ID | Name |
| --- | --- |
| immigration | Immigration Services |
| education | Education & Admissions |
| academic-writing | Academic Writing & Application Support |
| legal | Legal Services |
| settlement | Settlement & Integration |
| career | Career Development |
| business | Business Services |
| credentials | Credentials & Assessment |
| mentorship | Mentorship & Coaching |

Read subcategory IDs from the registry and reconcile with live gigs. Do not maintain a second hardcoded category list in discovery. Country relevance is not mandatory for every business/career topic; do not force immigration forms and refusal FAQs into non-immigration articles.

For each competitor page capture query/intent, URL, publisher, observed time, locale, actual result position if observed, title, heading structure, content type, questions answered, useful tools/examples, claim sources, freshness signals, service offer, CTA destination, and observable friction.

Grok then proposes an evidence-grounded **information advantage**: the specific reader decision, explanation, comparison, checklist, or worked scenario our article will supply. “Longer,” “more keywords,” or “competitor omitted an FAQ” is insufficient.

Do not copy competitor prose or reproduce another publisher's article structure mechanically. Competitor analysis is evidence of coverage and positioning, not a source of legal truth.

### 5.4 Evidence schema

At minimum, each item carries:

```ts
type EvidenceItem = {
  id: string;
  runId: string;
  sourceKind: "gsc" | "marketplace" | "analytics" | "keyword_provider"
    | "competitor" | "official" | "support_aggregate" | "hypothesis";
  sourceUrl?: string;
  publisher?: string;
  observedAt: string;
  effectiveAt?: string;
  jurisdiction?: string;
  locale?: string;
  categoryIds: string[];
  query?: string;
  observation: string;
  excerpt?: string;
  contentHash?: string;
  sourceRecordId?: string;
  metrics?: {
    name: string;
    value: number | null;
    unit: string;
    windowStart?: string;
    windowEnd?: string;
    country?: string;
    method: string;
  }[];
  confidence: "observed" | "inferred" | "unverified";
  verification: "pending" | "supported" | "contradicted" | "unavailable";
  expiresAt?: string;
};
```

Keep source authenticity separate from claim support. A government URL can be authentic while failing to support the proposed statement. Store material claim → supporting excerpt/source relationships and explicit contradictions.

Use shorter refresh policies for volatile fees/deadlines and longer policies for stable explanations. Missing dates remain missing. Never insert today's date as evidence of freshness.

### 5.5 Opportunity identity, novelty, and ranking

Every card must explain:

- Who is searching and what decision they face.
- The primary intent and query cluster, preserving meaningful country/form/stage distinctions.
- What evidence exists, its age, and what remains unknown.
- What our estate already covers, including draft/PR reservations.
- The specific new value and why this action is preferable to updating an existing page.
- The owning host and category/service path.
- The proposed action: create, update, consolidate, research, supply-first, or reject.

Use normalized intent/entity/jurisdiction/audience-stage identity. Exact keyword normalization alone cannot detect repeated ideas; use semantic comparison plus deterministic identity rules and explain collisions. Do not merge US I-485 with AU subclass 485 or collapse different legal stages.

Use paginated/complete inventory and server-side uniqueness/reservation constraints. Two simultaneous requests for the same opportunity must not create two jobs. Persist dismissed/superseded decisions with reasons and a revisit condition. A new nonce changes card presentation, not evidence or opportunity identity.

Extend the existing ranking model using separately displayed components: observed demand, information gap, relevance, supply fit, freshness, effort, uncertainty, and cannibalization. Missing metrics stay null. New authority opportunities can be researched without GSC demand, but must remain labelled unproven.

Where commercial history exists, estimate opportunity value using a transparent range based on qualified visits × relevant Marketplace-click probability × purchase probability × net contribution. Identify sample sizes and attribution coverage. Where history is absent, use labelled priors or no estimate; never display a precise revenue forecast as fact.

## 6. One rich writing contract owned by Grok

### 6.1 Contract construction

The server loads the selected opportunity and evidence snapshot; Grok sees the reader task, relevant source excerpts, competing coverage, estate ownership, real service options, and existing engine recommendations.

Grok produces a structured editorial plan, not an article yet. The contract must include:

- Identity: opportunity ID, version, jurisdiction, category/subcategory, content type, intended host, repo, file path, canonical.
- Reader: audience, current stage, primary question, practical stakes, what they should understand/do after reading.
- Scope: one thesis, included questions, explicitly excluded topics, evidence limitations.
- Original value: the concrete improvement over existing estate/competitor coverage.
- Evidence: approved claims with supporting IDs, disagreements, volatile facts, prohibited/unsupported claims.
- Structure: title, opening answer, ordered sections with purpose, section dependency, format, claim IDs, target budget, and expected reader outcome.
- Query coverage: primary intent, secondary questions/concepts, natural-language variants, and any essential exact entity names.
- Presentation: word window, formatting profile, metadata, authorship/review requirements, accessibility requirements.
- Links: exact validated official/internal/Marketplace destinations, relevance, placement, and allowed anchors.
- Conversion: reader readiness, relevant service/category, why help is useful, CTA promise, objections addressed, and self-service alternative where appropriate.
- Negative constraints: no invented experience, credentials, fees, outcomes, sources, client stories, keyword lists, or filler apparatus.
- Unresolved issues: critical versus optional and the required research action.
- Provenance: evidence hash, policy version, prompt version, requested model, actual model, and generation time.

A suggested `WritingContractV2` should compose existing `SealedBrief`, `ContentSpec`, ownership, and evidence types. Do not merely add another free-text field.

### 6.2 Validation and persistence

- Validate schema AND substantive completeness. A syntactically valid JSON object is insufficient.
- A mandatory claim without adequate support blocks the brief. An optional unverified detail is omitted.
- Validate outline/topic relevance, feasible section budgets, distinct questions, source availability, ownership, and CTA fit.
- Brief rejection returns actionable gaps. Never manufacture generic FAQs, takeaways, examples, or thesis text to clear validation.
- Save an immutable version with a stable hash. Editing scope, evidence, title/identity, or structure creates a new version and invalidates dependent approval/evaluation.
- Generation APIs accept `jobId + contractVersion`; server resolves the contract. During migration, legacy fields are validated and converted explicitly.
- A reload, resume, queue execution, JSON request, and stream request must reconstruct the same writing context.
- Preserve requested versus actual model on every stage. Grok remains preferred; retain configured fallbacks only under explicit policy with visible provenance. A different model cannot silently inherit a Grok-authored claim of approval.
- Resolve current provider IDs/configuration from the repository and provider capability check. Display names and old comments are not evidence that an endpoint/model is available.

### 6.3 Writer instructions to implement

The author-facing prompt should lead with this substance:

> Write for the specific reader described in this contract. Answer their central question promptly, then develop one connected explanation that helps them make the stated decision. Use the approved evidence and source links. Each section must add something the preceding sections did not establish. Explain concrete trade-offs and next steps in plain language. Integrate the selected service only where it naturally helps the reader. Omit optional unsupported details; report critical evidence gaps instead of inventing them. Return the complete artifact in the requested format.

Then provide the exact contract and compact applicable constraints. Keep scoring internals and long gate catalogs out of the main authoring objective. They may inform diagnostic tools without becoming prose instructions.

## 7. Drafting, format, and editorial quality

### 7.1 Shared execution

Refactor incrementally so JSON and streaming entry points invoke the same stage service. Preserve existing route contracts during migration. Streaming emits persisted job events; it does not own job lifetime.

The default path is validated contract → whole-article draft → independent evaluation → bounded targeted revision → rendering. Long articles can use staged composition only when the same full contract and accumulated article remain available, followed by whole-document editorial acceptance.

Do not introduce anonymous per-section writers or append disconnected sections after the final review.

### 7.2 Formats and word counts

Keep current depth windows as initial compatibility defaults. Add a versioned format profile that can distinguish a narrow blog/explainer, procedural guide, long-form analysis, comparison, and regional guide independently from the file renderer.

Use content scope and evidence to justify length. If the narrow problem cannot sustain the selected guide window, select a suitable profile before drafting or return it for scope correction. Any revised default must be tested against representative articles and reviewed as a policy change, not silently lowered for a failing job.

- Blog: direct opening, coherent prose, a modest number of useful sections, optional examples. No mandatory legal-guide kit.
- Procedural guide: eligibility/scope, evidence-backed steps and dependencies, documents, common decision points, currentness/limitations.
- Long-form analysis: clear argument, necessary depth, useful comparisons/examples, sensible navigation.
- Regional content: substantive country-specific evidence and reader circumstances; never country-name substitution.
- Tables compare structured facts; numbered lists express sequences; bullets express genuine sets.
- FAQs appear only for unresolved reader questions; never to pad length.
- Worked examples must teach a real decision. Label hypothetical examples; never fabricate client outcomes.
- Images/callouts must serve comprehension. No mandatory decoration quotas.

Implement one body-word counter and consistent profile resolution across author prompt, editor chip, evaluation, ship checks, and live extraction. Do not mechanically delete sentences to meet a ceiling if that removes qualifications or breaks reasoning.

### 7.3 Editorial evaluation

Separate three results:

1. **Hard constraints:** unsupported material claims, wrong jurisdiction, ownership/path mismatch, unsafe markup, broken required links, invalid metadata, artifact integrity, policy-required review.
2. **Reader/editorial assessment:** usefulness, coherence, specificity, factual explanation, redundancy, tone, scanability, and meaningful service relevance.
3. **Observed outcomes:** actual search and conversion performance after publication.

Grok's self-review is useful but not independent proof. Use deterministic checks plus a separate editorial evaluation context that receives the contract/evidence and article without the author's self-score. Human review is required for benchmark acceptance and for configured higher-risk content.

Natural prose means precise claims, varied topic-driven sentence structure, connected sections, and useful detail. Do not optimize random sentence lengths, misspellings, artificial anecdotes, or “human score” alone.

Harper reports and fixes local prose issues. Structural/coverage changes return to the contract owner; factual gaps return to research. Respect `harperLane.ts`.

### 7.4 Revision acceptance and repair limits

A candidate rewrite must be evaluated before replacing the current accepted revision. Compare:

- Material facts, negation, exceptions, dates, amounts, and jurisdiction.
- Claim/source links and approved URLs.
- Required questions and semantic coverage.
- Contract identity, headings unless an explicit contract revision changes them, and feasible word bounds.
- Reader usefulness/coherence and hard blockers.

Use the shared `revisionQuality.ts` protections and extend them to `linearDesk.ts`; its 40%-length acceptance rule is insufficient. Persist rejected revisions and reasons without losing the accepted article.

Default to at most two editorial revision attempts per contract version, with a configurable total execution/token/time budget. If still inadequate, stop at `revision_required` or `needs_research`. No endless score-chasing loops.

Restrict deterministic post-authoring transformations to render-safe operations such as frontmatter serialization, escaping, and structural component wrapping. Any visible text insertion/removal—including scaffold, links, FAQ, disclaimer, or CTA changes—must invalidate the prior content evaluation and pass final artifact review.

Preserve the current fix that stops mill-kit hero insertion and all valid protections against invented URLs, missing headings, lost demand coverage, and damaging style revisions.

## 8. Build a useful Marketplace funnel across the estate

The article must stand on its own and answer the query. The commercial next step is optional help matched to the reader's situation.

| Surface | Editorial responsibility | Conversion destination |
| --- | --- | --- |
| Caseworks/legal | Legal process, evidence, rights, procedural choices, jurisdiction-specific issues | Eligible legal/provider service or relevant Marketplace category |
| US/UK/CA/AU sites | Country-specific study, admissions, work, settlement, credentials and related guidance | Matching service with the correct jurisdiction |
| Main consultancy site | Broad brand, cross-country comparisons, non-country-specific category problems | Relevant Marketplace category/service |
| Marketplace | Service comparison, provider selection, request/checkout journey | Existing service conversion flow |

Implement a structured conversion plan before drafting:

- category/subcategory ID;
- verified eligible service/provider or filtered category URL;
- availability and jurisdiction match checked at planning and pre-publication;
- concise contextual offer, credible scope, and no outcome guarantees;
- placement after a relevant decision point and/or at the conclusion;
- fallback if supply disappears.

Do not send every reader to the Marketplace homepage. Resolve exact links using current category URL helpers and live inventory. Do not invent slugs, availability, prices, ratings, professional licenses, or author endorsements.

Audit the cross-jurisdiction fallback in `marketplaceValue.ts`. A pricing/supply proxy must not become a recommendation of an ineligible professional.

If no relevant service exists, classify the opportunity `supply_first` or allow a useful informational article under explicit policy without a misleading purchase CTA. Show the missing supply to the operator; never claim universal commercial readiness.

A provider profile is not evidence that the provider wrote or reviewed the article. Authorship/reviewer bylines require actual participation and authorization.

Avoid cross-site duplication and forced interlink chains. Assign one canonical owner per intent; other sites add genuinely different value and contextual links where useful. Do not canonicalize independent country guides to the Marketplace merely to “send SEO value.”

### Attribution and feedback

Reuse existing search-event semantics. Add article context without recording sensitive immigration situations:

- Stable article ID, revision/contract ID, source host, category, CTA ID/placement, and campaign experiment where applicable.
- Track article CTA click → Marketplace landing → service view/contact/request → checkout → confirmed payment where supported.
- Cross-domain continuity uses an opaque short-lived attribution token resolved server-side, not email/case details in URLs.
- Validate attribution origin/destination; prevent arbitrary redirect URLs.
- Confirm payments/conversions from the existing trusted backend/webhook and dedupe on the actual transaction/event identity. A browser click is not revenue.
- Keep self-referrals, internal traffic, bots, retries, refunds/cancellations, and attribution loss visible in measurement.
- If a checkout handoff loses attribution, show that loss rather than inferring purchases.

Report article-to-Marketplace click rate, qualified inquiry rate, verified purchase rate, attributable net revenue where available, and revenue per eligible article session. Display denominators, observation windows, coverage, and uncertainty.

Evaluate content experiments within comparable category/country/intent cohorts. Do not claim causation from an uncontrolled before/after change. Feed reliable findings into prioritization without rewarding fear, misleading claims, or irrelevant CTAs.

## 9. Publication is complete only after the correct artifact is live

### 9.1 Immutable publication manifest

Create one manifest with:

- job/opportunity/contract/revision IDs and hashes;
- destination repository owner/name, base branch/SHA, host, path, canonical;
- content type and renderer version;
- expected file changes, content/body hash and semantic fingerprint;
- PR number, approved head SHA, merge SHA;
- required CI checks/workflow identities;
- deployment workflow/run/environment identity;
- expected live markers and CTA destinations.

Render from the accepted artifact. Check repository/path/canonical consistency using the existing ownership and ship gates. Include content indexes, navigation entries, sitemap or related-page registration required by the real target renderer.

Check the base file SHA before updating existing content; do not overwrite unrelated edits. A changed brief, draft, renderer result, or PR head invalidates old approval/check evidence.

### 9.2 GitHub and deployment verification

Use the existing GitHub integration and `shipContent` write door. Do not add a second hidden Git writer.

- Open/reuse an idempotent PR against the correct parent repository and branch.
- Require the configured approval and required checks for the exact current head SHA.
- Pending, absent, inaccessible, cancelled, or unknown checks are not success.
- A head change or conflict requires reevaluation; no stale approval or test result reuse.
- Merge through GitHub after policy permits.
- Observe the destination repository's official deployment workflow for the merge commit, not merely the portal workflow or an earlier successful run.
- Persist webhook delivery IDs and verify signatures; reconcile repository, PR, SHA, action, and expected transition.
- Poll/reconcile as a durable fallback for missed webhooks. Events may arrive twice or out of order.
- A deployment for a later main commit can verify an earlier article only when ancestry and artifact identity demonstrate that it includes the expected unchanged revision. A higher timestamp alone is insufficient.

### 9.3 Live verification

After deployment succeeds, fetch the expected production URL and prove:

- Final host and path match the manifest with only approved canonical normalization.
- HTTP response is successful and not a soft 404, generic shell, or wrong article.
- Canonical, robots meta, X-Robots-Tag, and intended indexability are correct.
- Expected article title/body fingerprint or revision marker is present.
- Required factual/section content survived rendering; no leaked planning JSON or duplicate kit.
- Structured data matches visible content; no fabricated author/review identity.
- Required internal and Marketplace links resolve to the intended eligible destinations.
- Sitemap/content-index registration is correct where required.
- Representative desktop/mobile layouts have no broken rendering or unusable CTA.

Extract the article body rather than counting navigation/footer text. Hash comparisons should normalize renderer differences using a defined strategy; prefer a stable public revision marker plus body checks when exact bytes differ.

Only then set `live_verified`. Merge success, HTTP 200, IndexNow submission, and GSC indexing are separate facts. Indexing/ranking may lag and cannot be guaranteed.

### 9.4 Failure handling

Persist pending verification with next-attempt time, capped retries, error class, and actionable detail. Never rely on an unawaited function surviving Worker termination.

Deployment failures remain failed/pending until corrected through GitHub. Preserve previous good content. Create a reviewable fix/revert branch when appropriate under configured policy, not a direct provider rollback.

The operator should see a truthful sequence: “PR open,” “checks pending,” “merged,” “deployment pending,” “deployed; verifying article,” and “article verified live.” Never label all merged jobs verified.

## 10. Operator experience and operational integrity

Keep existing design and mobile behavior. Improve stage content:

- **Discover:** reason to write, evidence freshness, source health, duplicate/owner decision, category supply, and missing research.
- **Research/Brief:** inspectable sources and excerpts, approved claims, one structured contract, unresolved questions, change/version history.
- **Draft:** accepted current revision, precise revision findings, source/claim inspection, and render preview.
- **Approve/Track:** exact destination, PR/head/checks, deployment run, live verification, and later outcomes.
- **Configure:** provider health, budgets, source registry, risk/approval policy, and model fallback policy.

Show useful summaries by default; advanced diagnostics may expose gate codes. Replace success-looking empty states with truthful explanations.

All long work is durable and resumable. Use transactional job claims/leases, idempotency keys, cancellation, attempt budgets, server-side timestamps, and schema validation. Restrict admin/control routes and research records; preserve service-role-only Marketplace aggregates and validate RLS with negative tests.

## 11. Implementation phases and concrete deliverables

### Phase 0 — Reconcile current reality and capture a baseline

Read current main, recent relevant PRs, destination adapters/workflows, tables/migrations, provider configuration, and applicable repository instructions.

Create `docs/CONTENT_STUDIO_IMPLEMENTATION_AUDIT.md` containing:

- refreshed SHA and architecture delta from this handoff;
- confirmed defects versus hypotheses;
- active entry points and state transitions;
- source readiness and unverified configuration;
- canonical table/type/module reuse decisions;
- baseline sample set and expected behavior.

Capture current discovery cards and several generated articles with their full lineage using read-only/export or safe draft mode. Never overwrite production to gather baseline data.

### Phase 1 — Evidence, source health, and discovery quality

Add normalized observations, Tinyfish adapter and durable research execution, Marketplace aggregate feeder, category-aware research, transparent ranking, complete inventory matching, and atomic opportunity reservation.

Remove synthetic metrics from measured-demand paths. Fix valid-query overfiltering. Present fewer strong opportunities rather than filling a requested card count with generic ideas.

Exit: every eligible opportunity has provenance, ownership/action, distinct reader problem, information advantage, and justified next step. Source failure and insufficient evidence are visible.

### Phase 2 — Persisted writing contract

Implement validated contract versions and server-side loading across all generation paths. Retire generic substantive brief fallback. Preserve actual Grok ownership and fallback provenance.

Exit: a save/reload/resume delivers identical contract/evidence hashes; no critical missing evidence can produce a “ready” brief.

### Phase 3 — Coherent writing and bounded editorial revision

Unify execution behind JSON/SSE, lead prompts with reader task/evidence, route Harper appropriately, consolidate format policy, and enforce before/after revision acceptance everywhere.

Exit: no isolated fallback silently substitutes a weaker writing flow; representative artifacts improve under blind editorial review; no post-acceptance prose splicing escapes review.

### Phase 4 — Conversion and attribution

Implement real service matching, jurisdiction/availability checks, article-aware CTA plans, and verified conversion attribution using existing event/checkout infrastructure.

Exit: no fabricated/irrelevant destination; a test journey can be traced without sensitive personal data; recorded conversions require trusted server evidence.

### Phase 5 — Publication reconciliation and live proof

Add publication manifest, exact-SHA check policy, durable workflow monitoring, replay-safe webhooks, final artifact verification, and truthful UI labels.

Exit: a stale page, wrong repository, missing required check, failed deployment, or mismatched article cannot be reported as live success.

### Phase 6 — Controlled rollout and Codex handoff

Use feature flags for discovery/contract/writer/publication changes, with shadow-mode comparison first. Keep historical jobs readable; do not silently recertify old publications.

Run a small draft/preview pilot across representative estate surfaces. Real publication pilot follows code review and release policy. Record unresolved configuration blockers honestly.

Submit a PR with implementation summary, migration order, test evidence, model/article samples, live-pilot status, rollback steps, and exact known limitations. Update `CONTENT_STUDIO_ARCHITECTURE.md` and related docs to remove contradictory model, depth, direct-main, and publication definitions.

## 12. Acceptance tests Codex will expect

Write behavioral tests against contracts and state transitions, not source-string tests that merely check a function name exists.

### Discovery and evidence

- Identical evidence produces stable opportunity identity; regenerated titles do not create duplicates.
- Two concurrent create requests reserve one opportunity.
- An existing estate article is proposed for update when appropriate; unpublished drafts reserve work without pretending to be live coverage.
- Pagination finds collisions outside the first 300/400 records.
- F-1 and I-485 valid demand survives filtering; AU 485 remains distinct.
- Strategy hypotheses always have null observed metrics, even alongside real GSC data.
- Tinyfish timeout/auth/empty/malformed output yields distinct source states.
- Unmeasured search ranking/volume/conversion claims cannot enter numeric evidence.
- Unsupported or stale critical policy claims block readiness.
- Private support/search content is excluded from writer input.

### Contract and writer

- `sealedBrief` survives API → persistence → reload → queue → JSON/SSE → revision → ship without field loss.
- Mandatory missing thesis/evidence/reader outcome cannot be filled with generic defaults.
- A critical unresolved item blocks drafting; an optional omitted item does not manufacture a new section.
- Non-immigration category content receives no immigration template FAQ.
- Changing the contract invalidates prior draft approval.
- Rewrites cannot delete qualifications, introduce sources, lose necessary coverage, or exceed approved constraints while claiming improvement.
- JSON and SSE produce equivalent state/artifact behavior with a deterministic fake model.
- Disconnect/retry resumes one job; failures cannot spawn a duplicate publication.
- Renderer changes to visible content invalidate editorial acceptance.

### Funnel and publication

- Missing/wrong-jurisdiction service produces an honest fallback or supply-first state.
- CTA URLs use real canonical route helpers.
- Client-forged conversion events cannot count as paid outcomes; duplicate payment deliveries count once.
- Each relevant host maps to the expected repo/path; wrong-parent PRs are rejected.
- Unknown/pending/absent required checks prevent merge.
- A changed PR head requires new checks/approval evidence.
- Duplicate/out-of-order webhooks and lost callbacks converge on the correct state.
- Merge success + deployment failure does not produce live success.
- Old HTTP-200 article, canonical mismatch, soft 404, X-Robots noindex, missing CTA, and wrong content marker fail verification.
- Live success requires the correct artifact and deployment lineage.
- Unauthorized callers cannot read research dossiers or raw Marketplace intelligence.

### Editorial benchmark: required, separate from unit tests

Use at least 12 paired draft evaluations covering the four countries plus apex/legal surface differences, all requested article families, an existing-page update, a narrow high-intent question, and at least two non-immigration Marketplace categories. Cases can satisfy more than one dimension.

Keep the reader task and evidence set comparable between current and revised writers. Randomize labels and have a human assess without knowing which version is new.

Score 1–5 for direct usefulness, factual support, specificity, coherence, natural prose, format fit, originality/value, and CTA relevance. Report individual scores and reasons, not only averages.

Initial acceptance target: no critical factual/jurisdiction/authorship defect; every proposed publication at least 4/5 for usefulness and factual support; median at least 4/5 for coherence/naturalness; revised drafts preferred in at least 9/12 paired comparisons. These are engineering release criteria for this pilot, not proof of future rankings or conversion lift. Revise the system if it misses them; do not redefine the rubric after seeing results.

Include examples of held/rejected drafts. A system that correctly refuses a weak brief is working.

### Repository validation

Use current package scripts and actual required workflows. At the inspected commit, `npm test` runs Jest, `npm run build` builds Next.js/OpenNext, and `npm run lint` is `next lint`; verify whether the lint command is operational rather than claiming it passed.

Run focused behavioral tests, TypeScript, required unit/build checks, and relevant destination renderer tests. Use a consistent UTC test environment where date tests require it. Report exact commands, outcomes, and blocked checks; old test counts are not current evidence.

## 13. Handoff to Codex

Provide:

1. Feature branch, PR URL, base SHA, latest head SHA, and changed-file summary.
2. Architecture diagram and updated source-of-truth document.
3. Migration files, application order, compatibility and rollback strategy.
4. Source adapter status, configuration required, and whether Tinyfish was exercised live.
5. Sample opportunity dossier, validated contract, accepted/rejected revisions, and render manifest.
6. Behavioral test results and the blind editorial benchmark.
7. CTA attribution demonstration and explicit conversion-coverage limitations.
8. Publication-monitor tests plus any preview/live pilot evidence.
9. Any preserved legacy path and its planned retirement.
10. Specific remaining risks or incomplete requirements.

Codex will inspect code and samples, verify changes against refreshed main, review security/ownership/attribution/publication behavior, and rerun meaningful checks. If satisfied, Codex commits any final fixes, merges through GitHub, and verifies the official deployment. Do not describe the task as complete merely because tests pass or an article clears a gate.

## 14. Source references and evidence limits

Repository references below are pinned to the inspected commit. Implementation must refresh them:

- [Current architecture document](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/docs/CONTENT_STUDIO_ARCHITECTURE.md)
- [Discovery radar](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/app/api/content-studio/gsc/suggestions/route.ts)
- [Sealed brief implementation](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/lib/seoFactory/sealedBrief.ts)
- [Linear writer](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/lib/seoFactory/linearDesk.ts)
- [Full brief route](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/app/api/content-studio/suggest-brief/route.ts)
- [Studio UI and handoff](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/components/design/admin-content-studio.tsx)
- [Engine feed](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/lib/seoFactory/masterEngineFeed.ts)
- [Research-demand filters](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/lib/seoEngine/researchDemand.ts)
- [Demand feeders](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/lib/seoEngine/demandFeeders.ts)
- [Marketplace intelligence metrics](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/supabase/migrations/20260911_marketplace_search_intelligence_metrics.sql)
- [Ownership mapping](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/lib/seoFactory/ownership.ts)
- [Live verifier](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/lib/seoFactory/liveVerify.ts)
- [Agent release rules](https://github.com/kylemwalkerpr-ship-it/portal/blob/a33243111623ba2ded3332a010c8346bdf7d05cb/AGENTS.md)

Official external references checked for this handoff:

- [Google: helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content). Google does not prescribe a preferred word count; usefulness, originality, trust, and honest authorship should guide evaluation.
- [Google: spam policies](https://developers.google.com/search/docs/essentials/spam-policies). Keep each estate page useful and distinct; avoid doorway and scaled low-value content patterns.
- [Tinyfish developer documentation](https://docs.tinyfish.ai/). Use the current documented API surfaces and verify authentication, run lifecycle, and schemas during implementation.

No live database inspection, live Grok article generation, conversion experiment, or destination deployment test was performed while preparing this document. Static defects and proposed requirements are identified separately above.
