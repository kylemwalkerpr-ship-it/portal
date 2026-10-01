# YouSafe Revenue Engine v1 — execution plan

Date: 2026-10-01  
Mission: REVENUE-V1-20261001  
Status: PLAN_ONLY / NOT_ADMITTED_TO_EXECUTION  
Planning repository: kylemwalkerpr-ship-it/portal  
Planning branch: docs/yousafe-revenue-engine-v1-20261001  
Verified planning base: e42d3eb9e41f92d8edfce4dba99f1072077ad0e9

## 1. Decision and first milestone

Operate YouSafe as a revenue system: qualified discovery → useful guide/YQAA answer → exact offer → payment → secure intake → fulfillment → honest review/referral.

The first business milestone is one genuine stranger-to-customer paid transaction with a deliverable fulfilled within the published scope. The technical milestone is one independently verified end-to-end journey. These are separate: fixtures, staff purchases, sandbox charges and synthetic events cannot prove market demand or close the production paid-order gate.

Concentrate on three hero offers, launching the strongest complete journey first. Build against existing Marketplace supply and the existing payment, order, attribution and YQAA contracts. Extend infrastructure only where a measured failure prevents purchase or delivery. Every packet must identify its effect on qualified traffic, conversion, average order value, retention or referral.

This request authorizes preparing the plan on a GitHub branch. It does not start implementation, merge, deployment, production catalog edits, payment-account changes, customer email delivery, ads or outreach. The future DS loop must separately record the admitted scope and capabilities.

## 2. Evidence and corrections to the proposal

| Observation | Consequence |
| --- | --- |
| Portal main was e42d3eb9e41f92d8edfce4dba99f1072077ad0e9 at inspection. | Re-pin all affected repos at execution admission; this is a planning snapshot. |
| Public Apex and USA pages expose broad Market/discovery CTAs. Caseworks publicly displays 339 guides. | The funnel hypothesis is plausible; obtain current qualified traffic and conversion baselines before claiming which bottleneck dominates. Reading page text does not prove live checkout behavior or audience size. |
| lib/payments/index.ts registers nmi, authorizenet and manual; default is NMI unless configured otherwise. Payment README documents Stripe removal. | Replace the proposal's Stripe dependency with the existing PaymentProvider abstraction. Actual production configuration, merchant entitlement and transaction readiness remain unverified. Do not reintroduce Stripe. |
| app/api/checkout/order/route.ts requires a Portal client and Clerk identity. Card payment is supported for gigs; other source types use wallet here. | Guest checkout is a product/security change, not an existing feature. Audit account/order ownership first; avoid forcing wallet top-up for a directly purchasable hero gig. |
| Checkout idempotency exists but keys are optional in the inspected route. Paid orders bind server-observed order_paid. | Require stable retry protection for the hero journey; audit payment-to-order crash windows and durable reconciliation before reducing friction. |
| lib/attribution/contract.ts distinguishes attributed, session_only and unknown_source; browser events are limited to landing/cta_click. Handoff emitter is explicitly pending. | Extend P10 rather than create competing analytics. Source continuity and new funnel events require coordinated contract, schema and consumer changes. |
| Ownership resolver assigns transactional content to Market/Portal and long-form guides to Caseworks. | Dedicated commercial pages belong to the existing transactional owner. Never invent a parallel host map or conflicting intent owner. |
| Current repository matrix records P9/P10/P11 IN_PROGRESS and P12/P13 PENDING. | Reconcile current ledger/deployment evidence. New commercial pages require ownership and applicable CREATE/publication clearance or a recorded bounded exception. |
| RDC device Darnes-MacBook-Air.local was offline at planning time. | Harness capability, exact DS model and local worktree/job state are NOT verified. No worker was admitted. |

Repository files take precedence over stale notes for runtime facts. In particular, payment registry code adds Authorize.Net beyond the README, and current YQAA files/migrations postdate parts of the saved checkpoint. The checked-in Content Studio execution policy still contains older Luna-only instructions; reconcile project applicability and the user's explicit DS selection before implementation, without rewriting that policy as part of this plan.

Relevant Hjarni sources: [Supervisor Arc](https://hjarni.com/notes/33465), [Supervisor–executor playbook](https://hjarni.com/notes/34597), [SEO Brief](https://hjarni.com/notes/34332), and [YQAA integration checkpoint and conversational-intelligence amendment](https://hjarni.com/notes/38378). Do not infer active-job state from their dated records.

## 3. Offer selection and launch contract — P1

Provisional three-offer shortlist:

| Offer | Exact intent | Launch prerequisite |
| --- | --- | --- |
| F-1 application document organization/readiness | Preparing an initial F-1 application | Active matched gig/tier, willing provider, approved administrative scope, real price and fulfillment capacity |
| STEM OPT document organization/review | Preparing a STEM OPT extension | STEM-specific supply and approved scope; distinguish ordinary OPT and institution/employer responsibilities |
| Canada study-permit document organization | Preparing a Canada study-permit application | Verified provider authority and scope for the actual jurisdiction and service |

UK Student Route is the first reserve. A broader professional review is deferred until provider qualifications, jurisdiction and scope are established. Do not invent inventory to fill three slots. If Canada is unready, evaluate UK against the same evidence; if neither is ready, launch fewer offers and record the supply blocker.

Score candidates using current qualified demand, existing intent ownership, purchasable supply, provider availability, fulfillment confidence and contribution margin. The US F-1/OPT P10 pilot is the starting hypothesis, supported by repository-recorded demand/supply evidence; refresh it before selecting exact products. Reinstatement is a distinct problem and cannot silently stand in for initial F-1 preparation.

For each hero offer, produce a reviewed offer dossier with:

- Stable offer ID/version, existing gig/tier/catalog ID, canonical commercial URL and jurisdiction/intent.
- Actual provider identity, public qualifications/verification basis and permitted role.
- Exact deliverables, exclusions, customer fit, unsuitable cases and human-review triggers.
- Total customer price/currency including platform charges, government fees excluded or itemized, payout and expected margin.
- Turnaround and when its clock starts, capacity limit, required inputs, revision limits and missing-input handling.
- Post-payment receipt, secure intake, provider assignment, escalation/support, cancellation/refund terms.
- Named business owner, provider acceptance, scope review evidence and review expiry.

A label such as “document preparation” is not sufficient legal-scope evidence. A qualified reviewer must approve the actual activities and copy before publication. No outcome promises, invented credentials, testimonials or government affiliation.

## 4. Shared commercial contract and pages — P1

Create a small versioned hero-offer projection of the authoritative Marketplace catalog, not a second price store. Extend existing catalog/API contracts if adequate; add a focused public resolver only if discovery proves it necessary.

Public data may contain approved offer facts, public provider profile, deliverables, price, turnaround, availability and canonical purchase target. Exclude private provider records, orders, messages, wallets and customer data. Prices and availability must be re-resolved server-side at checkout. Store the purchased offer version and financial snapshot on the durable order so later edits do not alter what was sold.

Each commercial page answers: what I receive, who supplies it, inclusions/exclusions, total price, delivery timing, required inputs, next step after payment and trust/refund/support evidence. Use one primary CTA, “Get started — [actual amount/currency]”; consultations only where required by the approved scope. Design mobile-first, keyboard-accessible and readable without assistant use.

Resolve canonical path through existing ownership sources. Prefer upgrading an existing owned service destination before proposing a new URL. Feature flags should allow each offer/entry surface to be disabled without disabling fulfillment or hiding existing orders. Unavailable supply must remove the purchase action or explain the actual next step, never silently replace the service.

## 5. Checkout, secure intake and fulfillment — P1

Audit the current gig checkout flow and representative provider order workflow before edits. Choose the minimum safe route:

1. If guest order ownership is supported safely, use email-based secure purchase/claim with explicit terms, durable customer/order association and protected recovery.
2. Otherwise preserve authenticated ownership, shorten the account step, retain the exact selected offer/tier through sign-in and explain the next step. Record guest checkout as deferred with a concrete ownership blocker.

Never remove auth guards to simulate guest checkout. An analytics identity is not an order-access credential. No government identifiers or immigration documents in payment metadata, URLs or telemetry; collect sensitive inputs afterward through existing access-controlled intake.

Gate the journey on live gateway readiness through approved read-only access. Use the stored gateway for later refunds. Manual invoice means pending payment, not order_paid, immediate fulfillment or a purchase success screen.

Verification must cover correct totals/currency, fee disclosure, inactive tiers, stale price, wrong jurisdiction, self-purchase, failed/declined/ambiguous charges, double-click/retry, network timeout after capture, charge success with failed order persistence, account claim/resume, refund and provider earnings reconciliation. Add durable reconciliation for gaps found; never retry an uncertain charge blindly.

Fulfillment starts only after confirmed payment and durable order ownership. Customer receives order reference, scope, secure intake link and next-step timing. Provider receives assigned scope and delivery deadline through the existing workflow. Reconcile the current order deadline (which presently starts at purchase) with any promise that turnaround begins after complete intake; no contradictory clocks. Define unassigned-order, missing-document, overdue-provider and refund escalation owners.

## 6. Caseworks and regional entry modules — P1

Start with a small reviewed cohort of existing high-intent pages, selected from current qualified demand and matched supply; target approximately 10–20 if evidence supports them. Expand to every eligible article only after the representative pattern passes independent review.

Mapping identity must preserve canonical article, jurisdiction, route subtype, reader stage/problem, approved offer/version and mapping-review evidence. F-1, ordinary OPT and STEM OPT remain separate; housing/tenancy gets no student-visa offer. Ambiguous, unowned or unsupported intent yields no paid recommendation.

Use one primary contextual module per relevant article: “Need help with this step?” + exact deliverable + verified scope/price + service-page link. Place it after a useful answer or checklist; retain the complete free guidance. Track exposure and click separately when permitted. Provide a free resource alternative where useful.

Update Apex/USA and relevant regional entry cards with exact approved paid destinations when intent is clear, retaining navigation for undecided visitors. Do not mass-rewrite all 339 guides or change canonical/indexability rules. A controlled signed attribution handoff should preserve consented continuity across approved hosts; denied/unknown consent must still allow navigation and purchase without tracking.

## 7. YQAA commercial concierge — P1 after offer contract

Extend the one centralized YQAA backend; no per-repo assistant brains. Reuse estate corpus, current public knowledge ingestion and existing grounded generation/privacy/pricing guards.

Answer the question fully first. Offer a relevant service only when explicit context supports it and a live approved offer exists. Use a bounded structured decision: none / clarify / relevant_offer / qualified_human_handoff. Deterministic eligibility, public-data, price and legal-scope rules override Jev or model suggestions. Do not infer legal eligibility from a marketing intent score.

An OPT question must not recommend STEM OPT without STEM-extension intent. Explicit jurisdiction beats host affinity. Suppress repetitive suggestions after refusal; avoid fake urgency, outcome guarantees and services that do not match the user's problem. Recommendation failure must leave informational answering usable.

YQAA reads exact public offer ID, scope, provider and price from the shared contract and links to the canonical page/purchase flow. External sources may verify factual guidance but cannot rewrite YouSafe prices. No automated discounting, catalog edits or private-customer retrieval.

QA: cross-jurisdiction questions, F-1 versus reinstatement, OPT versus STEM, ambiguous context, follow-ups, stale/unavailable offer, declined recommendation, unsafe advice, malicious page context, private-data requests, Jev failure and external-research failure. Record only bounded consent-permitted recommendation metadata, not raw immigration conversations.

## 8. Measurement and daily decision dashboard — P1

Extend lib/attribution/contract.ts, its server binder, migrations, consumers and existing admin conversion-attribution surface coherently. Proposed additional event vocabulary requires review; it is not currently supported merely because this plan names it.

| Stage | Proposed evidence | Denominator / truth rule |
| --- | --- | --- |
| Visitors | Qualified landing/page view with consent and bot/internal/test classification | Show measurable cohort and coverage; consented sessions are not all visitors |
| Qualified intent | Reviewed article-intent mapping or safe explicit YQAA intent | Observed proxy, never a legal-status assertion |
| Offer exposure/view | CTA impression and commercial page view | Separate shown, clicked and loaded |
| Checkout | Server-observed checkout attempt plus permitted frontend step/error events | Button click alone is not successful checkout creation |
| Paid purchase | Existing trusted order_paid after confirmed payment + durable order | Browser success page cannot declare revenue |
| Delivery/refund/referral | Durable order lifecycle and verified referral outcome | Invitation sent is not review received or referral sale |

Report breakdowns by canonical article, destination jurisdiction, source class/campaign, offer/version, public provider reference and recommendation context. Visitor location is distinct from service jurisdiction. Search query is normally unavailable at individual transaction level; GSC query aggregates must not be joined as invented buyer-level facts. AI referrals count as known only with actual source evidence; otherwise unknown.

Preserve attributed / session_only / unknown_source, consent state, timestamps, raw/qualified/off-mission/test cohorts and coverage freshness. Store no raw documents, identity numbers, private profile IDs or free-text questions in analytics.

Daily dashboard: observed visitors → qualified intent → service-page views → checkout attempts → paid orders → revenue, with stage rates, counts, missing-data flags, source coverage, payment failures and fulfillment backlog. Distinguish gross customer collections/GMV, provider payouts, platform revenue, refunds, payment costs and contribution margin; group currencies unless an explicit exchange-rate policy exists. Show time window/timezone, attribution model and ingestion delay.

Track first-touch acquisition separately from last contextual CTA. YQAA-assisted and article-assisted revenue must not double-count the same order. Use deduplication keys, bounded retries and an explicit pending-reconciliation queue; analytics failure must not block valid purchases. P10 closes only against its actual production gate, not dashboard completeness.

## 9. Recovery, reviews and distribution — P2

After the first journey is safe, add a useful email resource with optional separately recorded marketing permission. Resource delivery and marketing consent are distinct; checkout/order service messages have a separate purpose. Audit the existing mail system and suppression handling first.

Proposed sequence: day 0 resource, day 1 guidance, day 3 mistakes, day 5 exact approved service, day 8 questions/objections. Stop/suppress marketing on unsubscribe, relevant purchase, invalid address or complaint. Use idempotent job IDs, cancellation/reconciliation and a named operator. No forced registration, sensitive abandonment tracking without permission or fabricated scheduled jobs. Test with fixtures/sandbox; live customer sends await admitted communication scope.

After accepted delivery, request an honest review using existing tools; referral terms must be explicit, lawful and budgeted. No invented social proof or incentives contingent on positive ratings.

Prepare distribution assets matched to existing guide → approved offer journeys: short videos, newsletters, student organizations and university/community resources. Content Studio and Video Studio retain their existing boundaries and publication gates. Drafting assets does not authorize posting, outreach or recipient contact.

Paid acquisition is later. Google's official notice states the government-documents/services update begins enforcement October 5, 2026; the immigrants-sensitive-interest policy also needs offer-specific review. Do not infer that all preparation services are prohibited or that YouSafe qualifies for an exception. Record applicable category, certification/authorization needs, geography and targeting limits before any campaign. No ad spend in v1 admission by default.

## 10. Content Studio/Jev commercial feedback — P2

Feed audited observed commercial outcomes into existing evidence/reward mechanisms. Keep acquisition, CTA, offer, checkout and delivery failures distinct; preserve sample size, freshness, confidence and missing attribution. No LLM-inferred revenue.

Jev recommends among bounded interventions: improve an existing CTA, clarify deliverables, add verified trust evidence, repair checkout, investigate supply or hold for more observations. Pricing/provider changes and publication require their own authority. Do not autonomously produce new articles, move canonical owners, discount prices or route sensitive audiences from sparse signals.

Use a single before/after intervention at a time for small cohorts. Low sample results are directional; diagnose with reproducible journey failures and real customer feedback before claiming statistical uplift.

## 11. Dependency-ordered DS packets

The user explicitly selects the DS custom harness for future execution. Preserve that Tier-2 selection through the unified broker; do not silently substitute Codex, Grok or Freebuff. Exact native DeepSeek model/effort must be discovered and positively probed before admission. Historical names and examples are not current entitlement proof.

| Packet | Priority / dependency | Bounded deliverable | Acceptance / supervisor checkpoint |
| --- | --- | --- | --- |
| R0 | P1, first | Read-only estate, jobs/worktrees, catalog, payments, attribution, auth, mail and gate reconciliation | Exact repo SHAs; live capability/source access; gap register; design options, no implementation |
| R1 | P1, R0 | Three reviewed offer dossiers and canonical mapping contract | Real inventory/provider/price/scope/capacity; blocked slots explicit; supervisor approves model before replication |
| R2 | P1, R1 | Shared offer projection and first commercial page | Server-authoritative totals/availability; public/private boundary; reviewed representative UI/diff |
| R3 | P1, R2 | First checkout → paid order → intake → provider fulfillment journey | Sandbox end-to-end, idempotency/crash-window/auth tests; supervisor inspects financial evidence |
| R4 | P1, R1–R3 | P10-compatible events, consented handoff and dashboard | Unknown stays unknown; replay-safe counts; consent denied still purchases; synthetic data excluded |
| R5 | P1, R2–R4 | Representative Caseworks/regional CTA integrations | Exact intent fit; canonical links; no inappropriate offers; live host/consent QA after authorized release |
| R6 | P1, R2–R4 plus YQAA ownership reconciliation | Central YQAA offer recommendations | Answer-first, public-data-only, intent-specific and graceful failure regressions |
| R7 | P1, first pattern accepted | Extend approved pages/CTAs to remaining ready hero offers | Same reviewed contracts, price parity and three complete journeys or explicit supply blockers |
| R8 | P1, R3–R7 | Independent audit and release candidate evidence | Fresh reviewer, exact-head checks, migration/release prerequisites, rollback, no unsupported PASS |
| R9 | P2, safe journey live | Resource recovery and review/referral implementation | Permission, suppression, scheduler/retry and fulfillment evidence; no ungranted live sends |
| R10 | P2, meaningful observations | Commercial feedback and distribution experiments | Known outcome inputs; approved intervention and observation owner; publication/spend gates preserved |

R0 freezes the exact implementation file inventory; paths below are anchors, not permission to edit everything in those directories:

- Portal: lib/payments/*, lib/checkoutOrders.ts, app/api/checkout/order/route.ts, lib/idempotency*, lib/attribution/*, app/api/admin/analytics/conversion-attribution/route.ts, current YQAA route/generation/knowledge files, existing Market public pages, affected tests and additive migrations.
- Caseworks: current guide renderer/CTA component and selected existing article metadata.
- Consultancy: relevant Apex/USA/regional entry components and consented link adapter.
- Support: existing fulfillment/support destination only if required; identify its actual owner first.

One writer per conflict domain. Start serially; no more than three primary workers within proven Mac capacity if disjoint packets later justify parallelism. Content Studio's seven-worker exception does not automatically apply to this revenue mission. Shared contracts/schema/auth changes are serialized before consumer updates. Do not modify the active YQAA mission/worktree or historical dirty assistant branch.

## 12. Supervisor–executor admission and loop

Route: user/chat supervisor → RDC → canonical unified harness/broker → Jev → explicitly selected DS lane → deterministic verification → independent supervisor review. This request does not delegate an autonomous OpenClaw mission or install a recurring controller.

Preflight:
1. RDC online; inspect existing unified broker executions, native DS sessions and Freebuff retained leases without reading credentials.
2. Read current root/scoped AGENTS, normative schemas/gates and relevant source paths. Fetch/reconcile remote identity, local/remote SHAs, dirtiness and upstream parity. Create isolated worktrees; preserve dirty/diverged/owned trees.
3. Discover current pipeline_route/pipeline_execute/reconciliation schema from the installed harness. Record harness version, exact model, supported effort, selected rationale and authenticated live probe.
4. Verify required GitHub/Supabase/Cloudflare capabilities inside the executor with bounded relevant reads. Configured is not connected. Missing capability blocks dependent work.
5. Use stable execution identity per packet revision, e.g. REVENUE-V1-20261001-R0-v1. After timeout reconcile durable state before retry; never create duplicate writers.
6. Admit R0 read-only first. Implementation packets wait for the approved findings, offer scope and exact path list. No worker inherits merge/deploy/production-mutation authority.

Packet template:

~~~yaml
mission_id: REVENUE-V1-20261001
task_id: REVENUE-V1-20261001-R0-v1
packet_revision: 1
contract: multirepo-supervisor-executor/2026.09.23.7-rdc1
transport: RDC_UNIFIED_HARNESS
tier_selection: USER_EXPLICIT_DS_CUSTOM_HARNESS
executor_lane: native_deepseek # resolve against actual broker capabilities
exact_model: UNRESOLVED_BLOCKING
effort: UNRESOLVED_BLOCKING
capability_evidence: REQUIRED_BEFORE_ADMISSION
execution_id: REVENUE-V1-20261001-R0-v1
repo_worktree: UNRESOLVED_BLOCKING
base_sha: FRESHLY_VERIFIED_REQUIRED
objective: Reconcile the existing paid customer journey and return a bounded implementation inventory
allowed_scope: Read-only relevant estate source, existing jobs and authorized readiness evidence
exclusions: Active YQAA owners, dirty trees, secrets, production mutation, spend, outreach, merge/deploy
dependencies: []
acceptance: Exact source/capability evidence, offer/payment/auth/attribution gap register, recommended next packet
reviewer: Distinct read-only identity; supervisor independently verifies critical evidence
driver: Chat supervisor; Astra disabled; OpenClaw autonomy not delegated
stop_conditions: Ownership conflict, missing authority, uncertain mutation, credential exposure, unsupported model
evidence_location: Durable harness journal plus repository task evidence index
~~~

Supervisor checkpoints: discovery/design → first representative change → complete candidate. Use supported steering; if safe mid-run pause is unavailable, end bounded jobs at these checkpoints. Updates contain stage, changed paths, current gate, blocker, next action and evidence reference.

After two unsuccessful repairs of the same failure, stop that approach and return root cause/options. Completion prose is advisory. Evidence bundle must record cwd, tested SHA/diff hash, commands, exit status, counts, artifact/run URLs and missing checks. The supervisor reads critical raw diffs/test evidence independently.

## 13. Thirty-day sequence and release gates

This is a dependency-based timebox from actual admission, not a booked schedule or guarantee.

| Window | Focus | Exit |
| --- | --- | --- |
| Days 1–3 | R0/R1: reconcile system and select actual supply | Approved offer dossiers, current gate register, exact packet scopes |
| Days 4–10 | R2/R3/R4: first complete paid journey and measurement | Sandbox proof, reviewed financial/auth boundaries, visible truthful dashboard |
| Days 11–17 | R5/R6/R7: article and assistant funnels; ready offers | Representative pattern accepted and matched entry surfaces |
| Days 18–23 | R8: release and first customer observation | Authorized official deployment/live proof; real sale outcome tracked separately |
| Days 24–30 | R9/R10 when ready: recovery, delivery learning, distribution preparation | Evidence-based changes; explicit observation report and remaining bottleneck |

Required release evidence: approved provider/scope/price, ownership/CREATE clearance, security/privacy and order-access checks, focused behavior tests, current typecheck/lint/build and required repository CI, migration/RLS evidence when applicable, reviewed exact candidate SHA and independent audit. Resolve runnable lint commands from current tooling: package.json's “next lint” must not be assumed functional.

Portal release uses branch → PR → required checks → authorized merge to main → official .github/workflows/deploy.yml. Never direct Wrangler/OpenNext publish. Consumer releases follow their own approved workflows and pinned source evidence. Any applicable Worker CPU/performance gate stays unverified until measured; a build is not runtime proof.

Live QA uses Playwright attached to the existing Opera CDP session when RDC permits. Verify mobile/desktop offer → checkout → secure intake/support, consent variants and inactive-offer behavior, with exact deployment provenance. Real charge/refund tests require separately admitted scope and cost/customer safeguards. No test purchase is presented as the stranger milestone.

Rollback: disable affected offer/CTA/recommendation flags or revert reviewed commits through official release. Preserve paid orders, access, fulfillment and financial audit trail. Migrations must be additive/backward compatible with a reviewed recovery procedure; never edit applied migrations or delete financial evidence.

## 14. Operational success and next decisions

Daily owner: supervisor/operator until a named business owner is assigned. Provider owns accepted delivery; commercial owner handles scope, supply, price and support; technical supervisor owns independent evidence and release decisions.

Milestones: 1 genuine sale → 5 genuine sales → measured repeatability → 10/week → at least 1/day sustained over a defined observation window. Counts are goals, not promises. Estimate CAC/LTV only from real cost/cohort evidence; first-sale data cannot justify scaling.

Before implementation resolve: exact DS model/access; three available providers/products; approved prices/turnaround; scope reviewer; existing versus new commercial URLs and publication clearance; safe guest/account ownership choice; live gateway readiness; mail capability/communication scope. R0 can investigate these; it cannot invent business facts.

Final checklist:
- [ ] R0 admitted through a live probed unified DS route with durable recovery identity.
- [ ] Ready hero offers have real supply, price, scope and delivery owners.
- [ ] First complete journey passes payment/auth/crash-recovery/fulfillment checks.
- [ ] Relevant articles and YQAA link to exact offers; unsupported intents remain informational.
- [ ] Dashboard distinguishes paid facts, consent coverage, unknown sources and platform revenue.
- [ ] Exact-head independent review, official deployment and live acceptance recorded separately.
- [ ] First real stranger order independently observed and delivered; applicable P10 gate reviewed.
- [ ] Recovery/review/distribution operate only within recorded permissions.
- [ ] Next intervention follows observed funnel failure; no broad architecture expansion.

## Source index and planning checkpoint

Repository anchors (read from main during planning):
- AGENTS.md
- lib/payments/README.md; lib/payments/index.ts
- lib/checkoutOrders.ts; app/api/checkout/order/route.ts
- lib/attribution/contract.ts
- lib/seoFactory/ownership.ts
- docs/superpowers/seo-parity-matrix.md
- docs/superpowers/content-studio-execution-policy.md
- package.json and current Git tree

Public sources inspected 2026-10-01:
- https://yousafeconsultancy.com/
- https://usa.yousafeconsultancy.com/
- https://legal.yousafeconsultancy.com/
- https://support.google.com/adspolicy/answer/17260489?hl=en
- https://support.google.com/adspolicy/answer/16701957?hl=en-AU

Recovery state: plan written only; no harness job admitted; no local worktree created; no production mutation, merge or deployment. RDC offline at inspection. Next action is review/admit R0 when transport is available, reconcile existing broker ownership and exact DS capability, then return the source-grounded implementation inventory before R1–R3 edits.
