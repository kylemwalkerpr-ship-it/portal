# YouSafe Revenue Engine v1: cash-first addendum

Date: 2026-10-02
Mission: REVENUE-V1-20261001 (addendum CASH-1)
Status: PLAN_ONLY / NOT_ADMITTED_TO_EXECUTION
Builds on: docs/superpowers/plans/2026-10-01-yousafe-revenue-engine-v1.md (branch docs/yousafe-revenue-engine-v1-20261001, commit 476f54940cf00495208996556e4c11abd757a1c4)
Repository snapshot: planning base e42d3eb9e41f92d8edfce4dba99f1072077ad0e9; portal main observed at 010407026438a3f68e063f41ae0c0cd778ac6d50 on 2026-10-02. Re-pin at admission.
Evidence window: repository reads and public-page fetches on 2026-10-02, roughly 01:20 to 01:50 ET.

This addendum does not replace the base plan. It keeps every safety rule in the base plan and changes only the order of work, the definition of the first commercial target, and what counts as "done enough" to start selling. It authorizes nothing: no implementation, merge, deploy, production catalog edit, payment-account change, customer email, post, outreach or spend.

## 0. What changes, in one screen

1. Add Track $ that runs in parallel with R0. It sells what already exists this week instead of waiting for R0 to R8.
2. Something is already purchasable today: the YouSafe File Shop sells F-1, OPT, STEM OPT and Canada study-permit preparation workbooks through Payhip with guest checkout and instant delivery. The fastest legitimate first dollar is to send qualified article traffic to those existing products.
3. Recommend Hero Offer #1 = I-765 OPT application review (post-completion OPT). A public Caseworks service page already exists with scope, a named reviewer, tier price ranges, turnaround and a refund policy. It is missing one exact price and a purchase path that survives sign-up.
4. Collapse R1 to R4 for the hero: one dossier, no new offer projection, no new checkout code unless R$0 finds a blocker, and P10-lite measurement using events that already exist.
5. Target: hero offer live and purchasable through the existing card checkout in about 7 to 10 days from admission, if Kyle supplies the facts in section 9.
6. Defer YQAA commercial concierge, email sequences, Jev feedback and offers #2 and #3 until the first genuine service sale.
7. Pause work that does not move traffic, conversion, AOV, retention or referrals (kill list, section 8).

## 1. Evidence: verified vs unverified

Repository facts (read on 2026-10-02 from the planning branch):

| Fact | Source | Consequence |
| --- | --- | --- |
| Payment registry has nmi, authorizenet and manual; code default is nmi, but the production Worker var sets PAYMENT_PROVIDER = "authorizenet" with AUTHORIZENET_ENVIRONMENT = "production" and Accept.js tokenization. | lib/payments/index.ts, wrangler.toml [vars] | Correction to base plan section 2: the configured default gateway is Authorize.Net, not NMI. Merchant status and secret presence are still unverified. No Stripe anywhere. |
| The manual adapter records every charge as pending and cannot refund. It is selected by the same estate-wide PAYMENT_PROVIDER switch. | lib/payments/providers/manual.ts, lib/payments/README.md | Do not flip PAYMENT_PROVIDER to manual to make one sale: it would turn every card checkout in the estate into an unpaid pending order. |
| Gig checkout requires a Portal client role and Clerk identity, supports wallet, saved card and new card for gigs, records charge_without_order incidents, and has idempotency with REQUIRE_KEY = false. | app/api/checkout/order/route.ts | A gig is the only direct card-purchasable unit today. Retry protection depends on the client sending a key; verify before paid traffic. |
| Custom offers (offers/[id]/accept) support wallet, saved card and new card through the default gateway. Attorney offers add the platform fee on top of the offer price. After-capture order failure returns an error but does not write a payment_incidents row. | app/api/offers/[id]/accept/route.ts | Viable fallback path for sale #1 (B2 below). The missing incident record is a small reconciliation gap to fix before volume. |
| Sign-in handoff accepts a return_to on trusted estate origins, including legal.yousafeconsultancy.com. | lib/marketplaceSignInHandoff.ts | A Caseworks CTA can deep-link to an exact Market gig and keep the selection through sign-in without new auth code. |
| File Shop: 16 immigration preparation packs, each with payhip_url and payhip_published = true; product page CTA is "Buy on Payhip". | lib/immigration-shop-products.ts, app/shop/[slug]/page.tsx, docs/CHECKOUT_RETIREMENT_2026-09-10.md | Live guest-checkout channel with instant fulfillment that needs no provider capacity. |
| Repo list prices for those packs ($29 F-1, $25 OPT, $29 STEM OPT, $29 Canada study permit, $79 bundle) differ from live prices (below). Batch-01 status file still says hold. | lib/template-packs/catalogue.json, lib/immigration-shop-products.ts, docs/payhip-product-audits/batch-01-status.json | Price source-of-truth drift between repo data and live listings. Reconcile (R$5); do not let YQAA or a new page quote repo prices. |
| P10 pilot is locked to us_f1_opt (102 top-20 GSC rows, 724 top-20 impressions, best position 8.5) with meaningful event order_paid. P9 to P11 IN_PROGRESS, P12 and P13 PENDING, broad net-new CREATE frozen until P13. | docs/superpowers/seo-parity-matrix.md | OPT/F-1 is the evidenced demand cluster. Track $ edits existing pages only, so it does not need CREATE. |
| P10 middleware strips tracking parameters with a 301 to the clean canonical and captures campaign data only with granted consent. Browser events are limited to landing and cta_click; the cross-domain emitter is not shipped. | docs/superpowers/seo-parity-matrix.md (P10 row), lib/attribution/contract.ts (per base plan) | UTM tags on links into Market or Portal will not reach GA4. Day-1 attribution must use referrer, CTA clicks and server-side paid orders (section 6). |

Live public facts (fetched 2026-10-02, about 01:30 to 01:50 ET):

| Fact | Where |
| --- | --- |
| Payhip listings are live with Buy Now: F-1 DS-160 + I-20 pack $16.99 (UuQMj), OPT I-765 pack $15.99 (g7efi), STEM OPT I-765 + I-983 pack $18.99 (1LXUs), Canada study permit pack $19.99 (oOzae), USA + Canada bundle $49.99 (Ap382). Titles now say "Fillable PDF" and file sizes are 50 KB to 280 KB. | shop.yousafeconsultancy.com/b/<id> (payhip.com/b/<id> redirects there) |
| Market File Shop pages show the same prices in Product JSON-LD and link to the matching Payhip product. | market.yousafeconsultancy.com/shop/<slug> |
| Caseworks I-765 OPT review page lists what is included, tier price ranges (Basic $99 to $199, Essential $299 to $499 with a 5 business day turnaround, Enhanced $599 to $899), a named US-licensed lead reviewer, a refund policy link and a "Start an I-765 OPT review" CTA. | legal.yousafeconsultancy.com/services/i-765-opt-review/ |
| That CTA goes to /intake/?service=i-765-opt-review, which tells the visitor to start in the Portal and links to Portal sign-up with return_to=/dashboard. In the static HTML the selected service is not carried into the Portal. | legal.yousafeconsultancy.com/intake/ |
| Refund policy: full refund within 24 hours if work has not started, 50 percent after preparation starts, none after attorney review begins. | legal.yousafeconsultancy.com/refund-policy/ |
| High-intent OPT and F-1 articles do not link to the matching pack or the exact service page. They show generic Market links and "Book"/"consult" CTAs. Only the product-led /blog/shop-* posts link to packs. | Articles listed in section 7 |
| Market gig search: no I-765/OPT gig and no STEM OPT gig. Four F-1 gigs: one is an F-1 reinstatement review (order_count 5; reinstatement is not initial F-1 preparation, per base plan section 3). The other three show 0 orders and 0 reviews, and their provider accounts look inactive in public data. Canada study-permit gigs in the sample show 0 orders. | market.yousafeconsultancy.com/api/marketplace/gigs |

Not verified (needs Kyle or R$0):

- Whether Payhip has recorded any sale, and which payment processor and payout method the Payhip account uses. Payhip sells through its own connected processors; this plan does not add Stripe or any processor to YouSafe code, but Kyle must confirm the Payhip setup is acceptable given the Stripe history.
- Authorize.Net production readiness: account in good standing, Worker secrets present, a real capture and refund succeed.
- That the named OPT reviewer is active, has accepted the exact scope, price and capacity, and has (or will create) a Portal provider account.
- Real per-article traffic (GSC/GA4). Candidate articles below are chosen by intent, not by measured volume.
- Whether Caseworks client JS adds the service to the sign-up handoff.
- Whether a new gig can pass moderation and publication within days.
- Mail capability for order messages (RESEND_API_KEY is documented for attorney decision emails only).
- YQAA production Jev credential: Hjarni [YQAA checkpoint](https://hjarni.com/notes/38378) records the TYPESAFE_API_KEY Worker binding as absent, so Jev-assisted commercial recommendations cannot ship to production yet.
- A public-surface privacy check of Marketplace API responses is needed before routing paid traffic to Market pages (R$0 item; details reported to the supervisor, not in this public document).

Hjarni: no notes were found for YouSafe pricing, provider rosters, gig economics or revenue figures. Relevant governance facts used here: [Supervisor Arc](https://hjarni.com/notes/33465) (execution route, P9 to P11 in progress, P12 and P13 pending, CREATE freeze, no spend, outreach or production mutation without separate authority), [Supervisor-executor playbook](https://hjarni.com/notes/34597) (packet and evidence format), [SEO Brief](https://hjarni.com/notes/34332) (phase gates stay binding), [YQAA checkpoint](https://hjarni.com/notes/38378) (server-authoritative pricing and offer guard, answer first, Jev credential gate, one central YQAA brain).

## 2. Hero Offer #1 recommendation

Recommend: I-765 OPT application review for post-completion OPT, sold as one exact-price tier, with the existing $15.99 OPT workbook as the low-cost alternative for self-filers.

Why OPT first, with evidence:

1. Demand: P10 locked its pilot to us_f1_opt from persisted GSC evidence (724 top-20 impressions). The estate has at least eight OPT/I-765 pages across Caseworks and Apex.
2. An offer page already exists: the Caseworks I-765 OPT review page answers most of the eight questions today (included items, reviewer, turnaround, refund terms, inputs). Upgrading an existing owned destination is what base plan section 4 prefers.
3. Narrow, checkable scope: a field-by-field I-765 check against USCIS instructions is a bounded document review. That is easier to scope-review and fulfill on time than broad "F-1 readiness", which spans DS-160, funding and interview preparation.
4. Timing: under USCIS OPT rules, post-completion OPT can be filed up to 90 days before the program end date, and the I-765 must be filed within 30 days of the DSO recommendation. Students finishing in December 2026 are inside that window in October and November. Re-verify these rules against uscis.gov at launch.
5. Built-in AOV ladder: free article, then $15.99 workbook, then the review service, then STEM OPT later for the same buyers.

Why not F-1 first: the three initial-F-1 gigs show no orders and providers that look inactive, F-1 interview demand for fall intake peaks later in the cycle, and the scope is broader. F-1 keeps selling as a pack now and becomes offer #3. STEM OPT becomes offer #2: same reviewer, overlapping page, separate intent per base plan section 6. Canada study permit keeps selling as a pack; its service supply is unverified.

Scope boundary: keep pre-completion (c)(3)(A) and STEM (c)(3)(C) out of offer #1 unless Kyle and the scope reviewer approve them. The current page mixes all three codes; per base plan section 6, OPT and STEM OPT must stay separate offers.

## 3. Track $: fastest path to first dollar (parallel with R0)

Track $ never blocks on R0 and never mutates production without Kyle. It has two lanes.

### Lane $A: self-serve packs (purchasable today)

What exists: live Payhip checkout, instant digital delivery, Market product pages, Apex /blog/shop-* product posts.
What is missing: qualified traffic. The authority articles that rank do not link to the packs.

| Step | Owner | Engineering | Lever |
| --- | --- | --- | --- |
| A1. Confirm Payhip processor, payouts and refund setting; open each hero file as a buyer would. | Kyle | None | Conversion (no broken delivery) |
| A2. Add one contextual "Need help with this step?" block to 6 to 10 OPT articles: free checklist stays first, then the $15.99 workbook, then the review service once live (R$1). | DS packet + scope review | Small copy/component edit in Caseworks and Apex repos | Traffic to offer, conversion |
| A3. Add the same block to the F-1 checklist and interview articles pointing to the $16.99 F-1 pack. | DS packet | Same | Traffic, conversion |
| A4. Distribution of existing articles (section 7). | Kyle approves each item | None | Qualified traffic |

Fastest first-dollar outcome: M1a, the first stranger Payhip sale. It counts as a genuine customer transaction with an automatically fulfilled deliverable. It does not close the P10 production gate, because it never creates a Portal order_paid.

### Lane $B: OPT review service, sale #1

Ranked paths, all using existing code:

- B1 (preferred): one Market gig, "I-765 OPT application review", published under the reviewer's provider account with exactly one active tier at the Kyle-approved price and turnaround. The buyer pays by card through the existing gig checkout (configured gateway: Authorize.Net). createPaidOrder binds the real order_paid event, so this does satisfy the P10 meaningful event. The Caseworks page CTA links to the gig using the sign-in return_to handoff instead of the generic /dashboard.
- B2 (fallback without a new gig): intake, then a chat thread, then the reviewer sends a custom offer at the approved price, then the buyer accepts with a card. This also produces a paid Portal order. It is more manual and depends on a chat thread existing between buyer and reviewer.
- B3 (last resort, only with Kyle's explicit decision): an out-of-band invoice or payment link from the merchant account's own tools, if the merchant agreement permits it. It produces no order_paid and no platform fulfillment record, it must go into a manual sales ledger, and it is reported separately. Never implemented by switching PAYMENT_PROVIDER.

Do not: reintroduce Stripe; flip the estate gateway; sell a gig whose provider is not confirmed active; publish an invented price, credential, testimonial or turnaround; promise outcomes; run a real charge without separately admitted scope and a refund plan.

### Track $ day plan (from admission)

| Day | Lane $A | Lane $B |
| --- | --- | --- |
| 0 | Kyle completes A1 and section 9 decisions 1 to 6. | Kyle confirms reviewer, price, scope reviewer. |
| 1 | R$1 drafts the article block copy for 6 to 10 articles. | R$0 read-only recon of the hero path. R$2 drafts gig copy and page edits. |
| 2 | Scope review of block copy. | Scope review of gig and page copy. Reviewer creates or confirms provider account. |
| 3 to 4 | R$1 PRs through each repo's official workflow; Kyle approves release. | Gig published by the provider through the existing gig builder; R$3 only if R$0 found a checkout blocker. |
| 5 | Distribution week 1 starts (Kyle-approved). | Live QA: page to gig to sign-in to checkout screen, without a real charge unless admitted. |
| 6 to 7 | Daily dashboard running (R$4). | Optional admitted real low-value charge and refund to prove the gateway; the OPT CTA goes live. |
| 8 to 10 | Watch funnel; fix the single worst leak. | First genuine service order target window; fulfillment within the published turnaround. |

## 4. Cash-weighted re-sequence of R0 to R10

| Order | Packet | Change from base plan | When |
| --- | --- | --- | --- |
| 1 | R$0 cash recon | New. A narrow read-only R0 slice limited to the OPT path, Payhip channel, gateway readiness and hero surfaces. Full R0 keeps running for everything else but is off the critical path. | Day 1 |
| 2 | R1-lite | One dossier (OPT review) instead of three. Offers #2 and #3 move to R7. | Day 0 to 2 |
| 3 | R$1 article CTA links | New. Replaces the R5 cohort for the hero only (6 to 10 OPT and F-1 pages), using existing pages and existing products. | Day 1 to 4, parallel |
| 4 | R$2 hero gig and page completion | Replaces R2 for offer #1. No shared offer projection yet: the Market gig is the authoritative price and the Caseworks page links to it. Build the projection when offer #2 needs price parity across surfaces. | Day 1 to 4 |
| 5 | R$3 hero checkout hardening | Replaces R3 for the hero. Conditional: only the gaps R$0 proves on the exact hero path (client idempotency key, offers after-capture incident record). Guest checkout stays deferred. | Day 3 to 5, if needed |
| 6 | R$4 daily dashboard (P10-lite) | Replaces R4 for day 1: read-only queries over existing order_paid, orders and payment incidents, plus GA4 and Payhip exports. No new event vocabulary before sale #1. | Day 2 to 6 |
| 7 | R8-lite | Independent audit sized to the changed surfaces, before any release. Not skipped. | Before each release |
| 8 | R$5 price source reconciliation | New, small. Align repo catalog data with live Payhip prices so no surface or assistant quotes stale prices. | Week 2 |
| 9 | R7 | Offer #2 STEM OPT, then #3 F-1, reusing the accepted pattern. | After sale #1 |
| 10 | R5 full | Expand article modules beyond the hero cohort. | After 5 sales |
| 11 | R6 | YQAA concierge after sale #1 and after the production Jev credential gate is resolved. A deterministic, answer-first link to the hero page may come earlier if YQAA owners agree. | After sale #1 |
| 12 | R9 | Email resource and recovery after the journey is proven; review requests after first delivery. | After 5 sales |
| 13 | R10 | Jev commercial feedback when there are real observations. | After about 10 sales |

Parallelism stays within the base plan rule of at most three primary workers and one writer per conflict domain: R$1 (Caseworks/Apex content), R$2 (Market gig copy plus Caseworks service page) and R$4 (read-only analytics) touch different domains. R$2 and R$1 both touch Caseworks, so serialize their Caseworks edits or give one packet that domain.

## 5. Hero Offer #1 launch kit

### 5.1 Page outline (upgrade the existing Caseworks page; the gig mirrors it)

| # | Question the page must answer | Existing content | Gap |
| --- | --- | --- | --- |
| 1 | What do I get? | "What is included" list | Trim to the approved tier only; state the deliverable format (annotated I-765, correction checklist, evidence summary). |
| 2 | Who provides it? | Named lead reviewer, "US-licensed attorneys" | Kyle confirms the reviewer is active and approves the exact wording and public verification link. |
| 3 | What is included and excluded? | Included list; "not retained legal representation" | Add explicit exclusions: no filing on the buyer's behalf, no eligibility determination beyond the stated checks, no STEM or pre-completion unless approved, government fee not included. |
| 4 | What is the price? | Ranges only ($99 to $199, $299 to $499) | One exact price and currency for the sold tier: TBD-KYLE. |
| 5 | How long does it take? | Essential: 5 business days from submission | Exact turnaround and when the clock starts (after complete intake vs at payment). Must match the Market order deadline logic, which starts at purchase (base plan section 5). TBD-KYLE. |
| 6 | What do I need to provide? | Completed I-765, I-20 with OPT recommendation, supporting documents | Final input list; how documents are uploaded securely after payment (never in checkout metadata). |
| 7 | What happens after payment? | "We confirm scope and match you to a reviewer" | Replace with concrete steps: order reference, secure upload link, reviewer assignment, delivery date, support contact. |
| 8 | Why trust this? | Refund policy link, reviewer credential, disclaimers | Real refund terms summary, public credential verification link, no testimonials until real ones exist, no government affiliation. |

One primary button: "Get started - $[TBD-KYLE]". Secondary: "Filing yourself? Get the OPT I-765 workbook - $15.99" (live price; confirm before publishing).

### 5.2 CTA and module copy templates (fill only with approved facts)

- Service page button: "Get started - $[PRICE] [CURRENCY]"
- Under the button: "Delivered within [TURNAROUND] after you upload your documents. [REFUND SUMMARY]."
- Article module heading: "Need help with this step?"
- Article module body: "Have a US-licensed attorney check your Form I-765 field by field before you file: category code, OPT recommendation date window, photo, fee and prior EADs. [PRICE], delivered in [TURNAROUND]. Document review only; not legal representation."
- Article module secondary link: "Prefer to do it yourself? The OPT I-765 preparation workbook is $15.99."
- Placement: after the article's own checklist or answer, never above the free guidance. One module per article.

### 5.3 Kyle fill-in checklist

| Fact | Value |
| --- | --- |
| Offer name and version | TBD-KYLE |
| Codes in scope ((c)(3)(B) only, or also (c)(3)(A)) | TBD-KYLE |
| Tier sold (Basic, no attorney; or Essential, attorney review) | TBD-KYLE |
| Exact customer price and currency, including any platform fee shown to the buyer | TBD-KYLE |
| Provider payout and platform margin | TBD-KYLE |
| Provider identity, active status, public verification link | TBD-KYLE |
| Provider accepted scope, price and weekly capacity (orders per week) | TBD-KYLE |
| Turnaround and clock start | TBD-KYLE |
| Revisions included | TBD-KYLE |
| Scope reviewer (qualified person approving activities and copy) and review date | TBD-KYLE |
| Refund terms for this offer (existing policy or a variant) | TBD-KYLE |
| Support contact and escalation owner for late or unassigned orders | TBD-KYLE |
| Purchase path: B1 gig, B2 custom offer, or B3 invoice (sale #1 only) | TBD-KYLE |
| Authorize.Net live readiness confirmed (yes/no, date) | TBD-KYLE |
| Approval to link authority articles to paid products | TBD-KYLE |

### 5.4 After payment (existing workflow, no new code assumed)

1. Card capture through the configured gateway, then createPaidOrder and order_paid.
2. Buyer sees the order in the Market order workroom; the reviewer sees the order with its deadline.
3. Documents uploaded through the existing access-controlled order workroom or intake (confirm the exact upload surface in R$0), never by email attachment or URL parameters.
4. Reviewer delivers the annotated form and checklist through the order; buyer accepts.
5. Escalation: unassigned within 1 business day or late delivery goes to the named owner (TBD-KYLE). Refunds go back through the stored gateway.

## 6. Revenue math and day-1 instrumentation

Funnel math: revenue = qualified sessions x service-view rate x checkout-start rate x purchase rate x price. All rates are unknown today; measure them, do not assume them.

AOV lever, using live public prices only: one service sale at the floor of the published Basic range ($99) earns about as much as six OPT workbook sales ($15.99). Ten workbook sales a week is about $160 gross before Payhip and processor fees. The revenue target therefore depends on the service, while the pack proves the traffic-to-purchase path cheaply.

### 6.1 Minimum events for the five funnel questions (day 1, no new P10 vocabulary)

| Question | Day-1 evidence | Exists today? |
| --- | --- | --- |
| Visitors | GA4 page views on hero-cohort articles, by country and referrer | GA4 property is configured on Market/Portal (NEXT_PUBLIC_GA_MEASUREMENT_ID). Caseworks/Apex GA4 coverage: verify in R$0. |
| Qualified intent | Page views on the reviewed OPT/F-1 cohort list (the list itself is the intent proxy) | Yes, as a static list |
| Service views | Page views of the Caseworks OPT review page, the Market gig page and the Market /shop pack pages | GA4 (verify on Caseworks) |
| Checkout starts | Clicks on the primary CTA (GA4 outbound click or P10 cta_click where consented); for Payhip, clicks to shop.yousafeconsultancy.com/b/<id> | Partially; confirm GA4 outbound click measurement is on |
| Purchases and revenue | Portal: orders and conversion_events order_paid (server-observed). Payhip: seller sales report. | Yes, in two separate systems |

Rules: staff, provider, friends and test purchases are excluded and labelled. Payhip revenue is an off-platform channel and is never merged into P10 order_paid counts. UTM parameters on links into Market/Portal are stripped by the P10 middleware, so use page_referrer and CTA clicks instead of UTMs. Unknown source stays unknown.

### 6.2 Daily dashboard spec (works before full P10)

A daily sheet or CSV produced by R$4 from read-only queries and manual exports, one row per day (ET) and per surface:

- date (ET); surface (article URL or offer page); channel (Payhip or Portal)
- sessions; qualified sessions; offer-page views; CTA clicks
- checkout attempts (Portal only, when observable); payment declines and payment incidents
- paid orders; gross collected; refunds; provider payout; platform revenue
- source class from referrer (organic search, internal, referral, AI referral if a real referrer exists, unknown); visitor country (GA4); provider
- fulfillment: open orders, overdue orders
- data gaps: missing GA4 coverage, consent-limited sessions, export not yet pulled

Daily decision rule: find the stage with the worst drop-off and make one change to that stage only. Record it, then observe.

## 7. Zero-cost distribution playbook, weeks 1 to 4

Nothing in this section is sent, posted or published without Kyle approving the specific item. Drafting is allowed; sending is not.

Hero cohort, chosen by intent (rank by GSC in R$0 before editing):

- OPT, for offer #1 and the OPT workbook:
  - https://legal.yousafeconsultancy.com/guide/optional-practical-training-opt-application/
  - https://legal.yousafeconsultancy.com/us/student-visas/i-765-opt-common-mistakes/
  - https://legal.yousafeconsultancy.com/us/student-visas/opt-stem-opt-complete-guide/
  - https://legal.yousafeconsultancy.com/us/student-visas/pre-completion-opt/ (workbook only unless pre-completion is in scope)
  - https://yousafeconsultancy.com/blog/opt-application-mistakes-2026
  - https://yousafeconsultancy.com/guide/opt-guide
  - https://yousafeconsultancy.com/blog/shop-us-opt-i765-application-prep-pack (add the service as the step up)
- STEM OPT, offer #2 later, workbook now: legal /us/student-visas/stem-opt-extension-checklist/, legal /guide/stem-opt-extension-requirements-2026/, apex /blog/stem-opt-extension-2026
- F-1, F-1 pack now: legal /us/student-visas/f1-document-checklist-2026/, legal /us/us-student-visa-interview-preparation-checklist/, apex /blog/f1-visa-requirements-2026, apex /blog/f1-visa-interview-questions
- Exclude for now (wrong stage or intent): opt-ead-replacement, us-opt-vs-canada-pgwp, opt-to-h1b-cap-subject-window-2026, green-card-after-opt.

| Week | Channel | Action | Guardrail |
| --- | --- | --- | --- |
| 1 | Owned pages | Ship R$1 links on the cohort. Make sure the Payhip product pages and the Apex shop posts link back to the free guides and to the service. | Free answer first, one module per page, approved copy only. |
| 1 | Search Console | Request re-crawl of edited pages (no new pages). | No new URLs; CREATE freeze respected. |
| 2 | University and student-org resources | Draft a short list of international-student office and student-org resource pages that accept useful guides; draft a polite resource email that links the free OPT guide, not the paid page. | Kyle sends personally, one at a time. No bulk email or scraped addresses. |
| 2 to 3 | Short video | Turn the "I-765 OPT common mistakes" article into 2 to 3 short videos with Video Studio drafts or a manual recording; link the free guide in the description. | Existing publication gates; no outcome claims; AI disclosure where the platform requires it. |
| 3 | Communities (Reddit, Facebook groups, Discord) | Answer real OPT questions fully in-thread; link the free guide only where community rules allow; disclose the YouSafe affiliation. | No link-only posts, no sock puppets, no DMs, no posting from automation. Kyle posts from his own account. |
| 4 | Newsletter | Send the OPT checklist to existing opted-in Caseworks subscribers ("Get weekly immigration updates"), if that list and its consent are verified. | Only consented subscribers, working unsubscribe, Kyle approves the send. |
| Any | Google Ads | Do not run. Google's government documents and services policy starts enforcement on October 5, 2026, and immigration audiences are a sensitive interest category. Revisit only after an offer-specific policy review. | No spend in v1. |

## 8. Kill list (recommendation only; Kyle decides)

Pause or keep paused until the first genuine service sale, unless the work fixes a measured failure on the hero journey or a security or privacy issue:

| Item | Why it does not move the five levers now | Recommendation |
| --- | --- | --- |
| P7 near-win ranking interventions beyond what is merged | Low-impression wins (for example Duke: 10 impressions over the window) do not reach paying intent in time | Pause new batches |
| P9 external authority outreach | Slow, outreach-heavy, no direct path to a purchase | Pause |
| P11 GEO/AI visibility production observation | Measurement of visibility, not of revenue | Keep the branch; pause new work |
| P12 full estate validation and P13 controlled expansion | Gates for new content, which Track $ does not need | Do not start |
| Lifting the CREATE freeze | Track $ edits existing pages only | Leave frozen; spend no effort on it |
| Gig slug backfill, taxonomy, Marketplace copy-rewrite and profile-copy campaigns | Catalogue hygiene across hundreds of gigs with 0 orders | Pause, except the one hero gig |
| Marketplace visual polish (palettes, themes, landing paging, first-paint tuning) | No evidence the visual layer is the bottleneck | Pause unless the dashboard shows a page-level drop |
| Payhip batches 2 to 4 non-immigration products (planners, wedding, prompts) | Off-mission for immigration buyers | Pause |
| Content Studio A1 to A7 accelerated build | Produces future content; the bottleneck is offer-to-purchase now | Reduce to one worker or pause after the current merges |
| Video Studio VS0 to VS12 build | A manual recording reaches distribution sooner | Pause the build; make 2 to 3 videos manually |
| Guest checkout redesign, shared offer projection, new event vocabulary | Needed for scale, not for sale #1 | Defer to after sale #1 |
| YQAA commercial concierge (R6) | Blocked by the Jev production credential anyway; answering-first already works | Let the in-flight YQAA mission reach a safe stop; start R6 after sale #1 |

Do not pause: payment reconciliation and incident handling, P10 truth rules, security and privacy fixes, order fulfillment tooling.

## 9. Decisions only Kyle can make (in order)

1. Hero offer #1: approve I-765 OPT application review (post-completion), or pick another.
2. Price: one exact price and currency, which tier (Basic or Essential), and payout split.
3. Provider: confirm the named reviewer is active, accepts the exact scope and price, sets weekly capacity, and has or will create a Portal provider account.
4. Scope reviewer: name the qualified person who approves the activities and all customer-facing copy (page, gig, article module).
5. Payment readiness: confirm Authorize.Net production is live, and decide whether to allow one admitted low-value real charge and refund as gateway proof.
6. Payhip: confirm the connected processor and payouts are acceptable, and that Payhip stays the approved channel for packs.
7. Sale #1 path: B1 gig (recommended), B2 custom offer, or B3 manual invoice. Is a manual invoice acceptable at all?
8. Approve linking authority articles to paid products, and approve each distribution item before it goes out.
9. Approve or amend the kill list.

## 10. DS packet additions

These sit in front of the base plan packets; the base template, route and stop conditions apply unchanged. Model and effort remain UNRESOLVED_BLOCKING until a live probe. Task and execution ids spell R$n as RCASHn because "$" is unsafe in identifiers and paths.

| Packet | Priority / dependency | Bounded deliverable | Acceptance |
| --- | --- | --- | --- |
| R$0 | P0-cash, none | Read-only recon of the hero path, Payhip channel, gateway readiness, GA4 coverage, cohort ranking | Evidence table with exact SHAs and URLs; blocker list; no writes |
| R$1 | P0-cash, R$0 plus copy approval | "Need help with this step?" module on 6 to 10 cohort articles | Approved copy, correct links, free answer first, official release workflow |
| R$2 | P0-cash, R$0 plus section 9 items 1 to 4 | Hero gig copy and Caseworks OPT page upgrade with an exact-price CTA into the gig | Eight questions answered with approved facts; CTA keeps the selection through sign-in |
| R$3 | P0-cash, conditional on an R$0 blocker | Minimal hero checkout hardening | Only proven gaps fixed; tests for retry and after-capture incident |
| R$4 | P0-cash, R$0 | Daily dashboard (P10-lite) | Reproducible daily rows; unknown stays unknown; Payhip separate |
| R$5 | P1, after R$0 | File Shop price source reconciliation | Repo data matches live prices or is clearly marked non-authoritative |

~~~yaml
mission_id: REVENUE-V1-20261001
task_id: REVENUE-V1-20261001-RCASH0-v1
packet_revision: 1
contract: multirepo-supervisor-executor/2026.09.23.7-rdc1
transport: RDC_UNIFIED_HARNESS
tier_selection: USER_EXPLICIT_DS_CUSTOM_HARNESS
executor_lane: native_deepseek # resolve against actual broker capabilities
exact_model: UNRESOLVED_BLOCKING
effort: UNRESOLVED_BLOCKING
capability_evidence: REQUIRED_BEFORE_ADMISSION
execution_id: REVENUE-V1-20261001-RCASH0-v1
repo_worktree: UNRESOLVED_BLOCKING # portal, caseworks, consultancy read-only
base_sha: FRESHLY_VERIFIED_REQUIRED
objective: Prove or disprove that the OPT hero path and the Payhip pack channel can take a genuine sale within 7 to 10 days
allowed_scope: Read-only source, public pages, approved read-only analytics and gateway status views
exclusions: Writes of any kind, secrets, real charges, provider contact, active YQAA worktrees
dependencies: []
acceptance: >
  (1) Gig checkout client sends an Idempotency-Key, yes or no, with file evidence;
  (2) Caseworks intake handoff carries the service, yes or no;
  (3) GA4 present on Caseworks and Apex cohort pages, yes or no;
  (4) gig publication and moderation path for one new gig documented;
  (5) public Marketplace API responses checked for private fields;
  (6) cohort articles ranked by GSC impressions and clicks over the last 28 days;
  (7) blocker list mapped to R$1 to R$3 with exact paths.
reviewer: Distinct read-only identity; supervisor re-checks items 1, 2 and 5
driver: Chat supervisor; Astra disabled; OpenClaw autonomy not delegated
stop_conditions: Missing authority, credential exposure, need for a write, unsupported model
evidence_location: Durable harness journal plus repository task evidence index
~~~

~~~yaml
mission_id: REVENUE-V1-20261001
task_id: REVENUE-V1-20261001-RCASH1-v1
packet_revision: 1
contract: multirepo-supervisor-executor/2026.09.23.7-rdc1
transport: RDC_UNIFIED_HARNESS
tier_selection: USER_EXPLICIT_DS_CUSTOM_HARNESS
executor_lane: native_deepseek
exact_model: UNRESOLVED_BLOCKING
effort: UNRESOLVED_BLOCKING
capability_evidence: REQUIRED_BEFORE_ADMISSION
execution_id: REVENUE-V1-20261001-RCASH1-v1
repo_worktree: UNRESOLVED_BLOCKING # caseworks and consultancy, isolated worktrees
base_sha: FRESHLY_VERIFIED_REQUIRED
objective: Add one contextual "Need help with this step?" module to 6 to 10 existing OPT and F-1 articles linking the exact live pack and, once live, the hero service
allowed_scope: Existing article templates or front matter for the R$0-ranked cohort; one shared module component per repo
exclusions: New URLs, canonical or indexability changes, mass edits, prices typed into copy that are not read from the approved source, STEM offers on non-STEM pages
dependencies: [REVENUE-V1-20261001-RCASH0-v1, scope_review_of_copy]
acceptance: >
  Module renders after the free answer on every cohort page and nowhere else;
  links resolve to the exact Market shop page or hero page; F-1, OPT and STEM intents never cross;
  mobile and keyboard accessible; module can be disabled by one flag;
  repository checks green; release only through the repo's official workflow after Kyle approval.
reviewer: Distinct reviewer plus scope reviewer for copy
driver: Chat supervisor
stop_conditions: Ownership conflict, CREATE gate triggered, unapproved copy, price mismatch with live listing
evidence_location: Durable harness journal plus repository task evidence index
~~~

~~~yaml
mission_id: REVENUE-V1-20261001
task_id: REVENUE-V1-20261001-RCASH2-v1
packet_revision: 1
contract: multirepo-supervisor-executor/2026.09.23.7-rdc1
transport: RDC_UNIFIED_HARNESS
tier_selection: USER_EXPLICIT_DS_CUSTOM_HARNESS
executor_lane: native_deepseek
exact_model: UNRESOLVED_BLOCKING
effort: UNRESOLVED_BLOCKING
capability_evidence: REQUIRED_BEFORE_ADMISSION
execution_id: REVENUE-V1-20261001-RCASH2-v1
repo_worktree: UNRESOLVED_BLOCKING # caseworks service page; gig copy delivered as a draft for the provider
base_sha: FRESHLY_VERIFIED_REQUIRED
objective: Make the I-765 OPT review purchasable at one exact price through the existing gig checkout
allowed_scope: Caseworks /services/i-765-opt-review/ copy and CTA target; draft gig title, description, requirements and single tier for the provider to enter in the existing gig builder
exclusions: Creating or publishing the gig on the provider's behalf, catalog or database writes, checkout or auth code, invented facts
dependencies: [REVENUE-V1-20261001-RCASH0-v1, kyle_decisions_1_to_4]
acceptance: >
  Page answers the eight questions with TBD-KYLE values filled from the approved dossier;
  one primary button "Get started - $PRICE" deep-links to the published gig via the sign-in return_to handoff;
  page price equals gig tier price; exclusions and refund summary present;
  live QA reaches the checkout screen from a fresh mobile session without losing the selection;
  no real charge unless separately admitted.
reviewer: Distinct reviewer plus scope reviewer
driver: Chat supervisor
stop_conditions: Provider not confirmed, price not approved, publication blocked by moderation, ownership conflict
evidence_location: Durable harness journal plus repository task evidence index
~~~

~~~yaml
mission_id: REVENUE-V1-20261001
task_id: REVENUE-V1-20261001-RCASH3-v1
packet_revision: 1
contract: multirepo-supervisor-executor/2026.09.23.7-rdc1
transport: RDC_UNIFIED_HARNESS
tier_selection: USER_EXPLICIT_DS_CUSTOM_HARNESS
executor_lane: native_deepseek
exact_model: UNRESOLVED_BLOCKING
effort: UNRESOLVED_BLOCKING
capability_evidence: REQUIRED_BEFORE_ADMISSION
execution_id: REVENUE-V1-20261001-RCASH3-v1
repo_worktree: UNRESOLVED_BLOCKING # portal
base_sha: FRESHLY_VERIFIED_REQUIRED
objective: Close only the hero-path payment gaps that R$0 proved
allowed_scope: Gig purchase client (send a stable Idempotency-Key per attempt); offers/[id]/accept after-capture failure writes a payment_incidents row; focused tests
exclusions: Guest checkout, gateway switch, new providers, schema changes beyond an additive reviewed migration if strictly required
dependencies: [REVENUE-V1-20261001-RCASH0-v1]
acceptance: >
  Double-click and retry replay the stored outcome with no second capture;
  simulated order failure after capture produces exactly one incident row with the transaction id;
  existing checkout and offer tests green; typecheck and build green; independent review of the diff.
reviewer: Distinct reviewer; supervisor reads the financial diff
driver: Chat supervisor
stop_conditions: Change touches auth guards, gateway selection or stored financial evidence
evidence_location: Durable harness journal plus repository task evidence index
~~~

~~~yaml
mission_id: REVENUE-V1-20261001
task_id: REVENUE-V1-20261001-RCASH4-v1
packet_revision: 1
contract: multirepo-supervisor-executor/2026.09.23.7-rdc1
transport: RDC_UNIFIED_HARNESS
tier_selection: USER_EXPLICIT_DS_CUSTOM_HARNESS
executor_lane: native_deepseek
exact_model: UNRESOLVED_BLOCKING
effort: UNRESOLVED_BLOCKING
capability_evidence: REQUIRED_BEFORE_ADMISSION
execution_id: REVENUE-V1-20261001-RCASH4-v1
repo_worktree: UNRESOLVED_BLOCKING # portal, read-only queries or a script under scripts/
base_sha: FRESHLY_VERIFIED_REQUIRED
objective: Produce the section 6.2 daily dashboard from existing data
allowed_scope: Read-only SQL over orders, conversion_events and payment_incidents; GA4 and Payhip exports supplied by Kyle; one script or saved query that emits the daily CSV
exclusions: New tracking events, schema changes, writes to production tables, merging Payhip revenue into P10
dependencies: [REVENUE-V1-20261001-RCASH0-v1]
acceptance: >
  Re-running for the same day gives identical rows; test, staff and synthetic orders excluded and counted separately;
  unknown sources reported as unknown; Payhip and Portal shown as separate channels;
  time window and timezone (ET) stated on every output.
reviewer: Distinct read-only identity
driver: Chat supervisor
stop_conditions: Any need to write production data or read private message or document content
evidence_location: Durable harness journal plus repository task evidence index
~~~

~~~yaml
mission_id: REVENUE-V1-20261001
task_id: REVENUE-V1-20261001-RCASH5-v1
packet_revision: 1
contract: multirepo-supervisor-executor/2026.09.23.7-rdc1
transport: RDC_UNIFIED_HARNESS
tier_selection: USER_EXPLICIT_DS_CUSTOM_HARNESS
executor_lane: native_deepseek
exact_model: UNRESOLVED_BLOCKING
effort: UNRESOLVED_BLOCKING
capability_evidence: REQUIRED_BEFORE_ADMISSION
execution_id: REVENUE-V1-20261001-RCASH5-v1
repo_worktree: UNRESOLVED_BLOCKING # portal
base_sha: FRESHLY_VERIFIED_REQUIRED
objective: Remove File Shop price drift between repository data and live Payhip listings
allowed_scope: lib/template-packs/catalogue.json, lib/immigration-shop-products.ts and their tests
exclusions: Changing any live Payhip price, inventing prices, editing Payhip listings
dependencies: [REVENUE-V1-20261001-RCASH0-v1, kyle_confirms_live_prices]
acceptance: >
  Every immigration pack price in repository data equals the Kyle-confirmed live price, or the field is clearly marked non-authoritative and unused by public pages and YQAA;
  tests pin the values; no rendered page shows a price different from its Payhip listing.
reviewer: Distinct reviewer
driver: Chat supervisor
stop_conditions: Live and repository prices disagree and Kyle has not confirmed which is correct
evidence_location: Durable harness journal plus repository task evidence index
~~~

## 11. Milestones and stop rules

- M1a: first genuine stranger Payhip sale (pack). Proves traffic to purchase.
- M1b: first genuine stranger service order with order_paid and delivery inside the published turnaround. Proves the service journey and feeds the P10 production gate review.
- Then 1, 5, 10 per week, 1 per day, as in the base plan. Counts are goals, not promises.
- Stop and diagnose if: 7 days after R$1 ships, cohort CTA clicks are zero (traffic or placement problem); clicks exist but no purchases after about 100 offer-page views (offer, price or trust problem); a service order goes unassigned for more than 1 business day (supply problem; pause the CTA by flag).
- Any payment incident on the hero path pauses paid traffic until it is reconciled.

## 12. Safety rules carried over unchanged

No auth guard removal; no Stripe; no estate gateway flip; no invented provider, credential, price, testimonial or turnaround; qualified scope review before publication; Portal releases only through branch, PR, required checks, authorized merge and the official .github/workflows/deploy.yml (never a direct Wrangler or OpenNext publish); other repos through their own official workflows; manual invoice is never order_paid; government identifiers and documents never in payment metadata, URLs or analytics; staff and test purchases never count as the stranger milestone; no outreach, posting, email or spend without Kyle approving the exact item.

## Source index

Repository (planning branch): lib/payments/index.ts, lib/payments/README.md, lib/payments/providers/manual.ts, wrangler.toml, app/api/checkout/order/route.ts, app/api/offers/[id]/accept/route.ts, lib/marketplaceSignInHandoff.ts, lib/immigration-shop-products.ts, lib/template-packs/catalogue.json, lib/payhipBatch1Commercial.ts, app/shop/[slug]/page.tsx, docs/CHECKOUT_RETIREMENT_2026-09-10.md, docs/payhip-product-audits/batch-01-status.json, docs/payhip-product-audits/batch-01-blog-routing.md, docs/payhip-product-commercial-audit.md, docs/superpowers/seo-parity-matrix.md.

Public pages (2026-10-02): market.yousafeconsultancy.com/shop/* (F-1, OPT, STEM OPT, Canada study permit, bundle), shop.yousafeconsultancy.com/b/UuQMj, /b/g7efi, /b/1LXUs, /b/oOzae, /b/Ap382, legal.yousafeconsultancy.com/services/, /services/i-765-opt-review/, /services/f1-student-support/, /services/canada-study-permit-support/, /intake/?service=i-765-opt-review, /refund-policy/, the cohort articles in section 7, estate sitemaps, market.yousafeconsultancy.com/api/marketplace/gigs (public search).

Hjarni: [Supervisor Arc](https://hjarni.com/notes/33465), [Supervisor-executor playbook](https://hjarni.com/notes/34597), [SEO Brief](https://hjarni.com/notes/34332), [YQAA checkpoint](https://hjarni.com/notes/38378).

Recovery state: addendum written only. No harness job admitted, no worktree created, no production, catalog, payment, Payhip or provider change, no message sent. Next action: Kyle answers section 9; then admit R$0 alongside the base plan R0 when RDC and the DS route are available.
