# YQAA Legal Companion — Roadmap

**Baseline:** PR **#391** (`main` ancestor) = legal-buddy orientation + budget-loop harden + DM evidence **v0**. Current implementation status below is grounded in `main` @ `79f8008b`.
**Scope:** System-wide. Every provider, gig, category, and YQAA surface.  
**Repo:** `kylemwalkerpr-ship-it/portal`  
**Implementation lane:** repository code and checks; production still follows the repository GitHub Actions release workflow.

---

## Phase 0 — Land v0 (merged; deploy/smoke pending)

**Owner:** deploy + smoke for #391.

- [x] CI green on #391  
- [x] Merged to `main` (`471d6b2`)  
- [ ] Deploy Worker (verify)  
- [ ] Live low-budget DM smoke on a staging provider (see Test plan)  
- [ ] Confirm no client-facing “revenue-safe” / $812/$690 dumps  

Historical phase; production deployment and live smoke remain release/operator activities and are not performed by this code task.

---

## Phase 1 — Companion Decision + Adaptive Pricing

**Goal:** Jev-compatible decision layer on **DM** + **adaptive pricing/negotiation** (scope re-quote, flex band, counter classes, negotiation memory) + grammar/positioning/leak/stale-number polish. Still YMYL-safe, for all providers. The earlier "no pricing-math changes" rule is **reversed** (Sharon, 2026-10-06).

### Shipped modules

The companion decision, adaptive pricing, memory, polish, and regression modules exist in `lib/yqaaCompanionDecision.ts`, `lib/yqaaAdaptivePricing.ts`, `lib/messengerConversationMemory.ts`, `lib/yqaaCompanionPolish.ts`, and their tests. Pricing and money movement remain under existing server authorities. This roadmap does not imply that every proposed fixture has expert acceptance.

### Optional

- Optional Jev `emotion` score + `posture` choice questions (shadow log first)
- Dedicated grammar-polish model; existing rules-based polish remains shipped

### Explicitly later (Phase 2+)

- Full recursive learning warehouse  
- Provider-inactive auto-reroute product  
- Provider dashboard UI for flex settings + provider-authored offer hints (Phase 2)  
- Dedicated pricing-approvals table (Phase 2; metadata in Phase 1)  
- Multi-lingual journey packs  

---

## Phase 2 — Positioning & Journey intelligence

- Journey stage classifier (rules + Jev choice)  
- Posture enum enforced server-side (forbidden actions removed from choice set)  
- Richer immigrant-journey KB slices (US F-1/OPT/H-1B/marriage/asylum *orientation* cards — curated, cited)  
- Provider attention UX when escalate + inactive account  
- Provider pricing-preferences UI; one-tap approve/decline for below-band requests  
- [x] Gig editor: optional unit pricing + tier scope_depth/scope_units (implemented on `feat/yqaa-gig-scope-controls-20261013`; merge/deploy pending)

---

## Phase 3 — Recursive learning

- [x] `DecisionRecord` table / logging (versioned, privacy-minimized, service-only)
- [ ] Incident + stratified gold set across providers/categories (expert dual-label on critical; intake is queued and unverified)
- [x] Negotiation outcome stream from authoritative YQAA offer and provider approval status changes; offline metrics only
- [x] Shadow evaluation with explicit HOLD states and false-safe demotion recommendation
- [x] Authenticated calibration dashboard/API and structured human-review intake/export
- [x] **No** online auto policy rewrite or rubric promotion

**Bounded packet status (2026-10-13):** versioned privacy-minimized decision records, an idempotent service-only outcome stream, an authenticated aggregate calibration dashboard/API, and structured review intake/export are implemented in [`PHASE3-4-PACKET.md`](./PHASE3-4-PACKET.md). Review submissions store only admin-attributed labels, qualification claims, and opaque provenance references. Claims are not verified and do not enter gold metrics. Critical cases require two distinct, agreeing admin submissions before they are marked dual-reviewed. Qualified expert labels, external credential verification, and counsel review remain external prerequisites. The new migration is additive and has not been applied.

---

## Phase 4 — Shared decision contract and remaining review

- [x] Required: one typed channel-aware entrypoint used by public, DM, and support adapters (`lib/yqaaDecisionOrchestrator.ts`); exact channel capabilities prevent public/support commerce and negotiation authorization.
- [x] Required: preserve public high-stakes handoff, deterministic YMYL/evidence authorities, Jev timeout fallback, existing DM server pricing authority, support unknown-outcome behavior, and the public 42-second cancellable deadline.
- [x] Required: versioned privacy-minimized decision records remain a separate persistence adapter; no new decision-path DB writes.
- [x] Required: DM `Server-Timing` and public chat stage timing/deadline are shipped.
- [ ] External review: US YMYL counsel review of disclosure and escalation copy.
- [ ] Optional: dedicated grammar-polish model. Rules-based leak, stale-number, and positioning guards already ship.

**Bounded packet status (2026-10-13):** the required shared decision entrypoint is implemented and called by all three channel adapters. It delegates to existing authorities and only returns decision data; decision records remain separate. Required Phase 4 code is complete. Counsel review remains an external prerequisite, while a dedicated polish model is optional. No counsel approval or gold-set acceptance is claimed here.

---

## Freebuff priority matrix

| Priority | Item | Why |
|---|---|---|
| P0 | Deploy/smoke #391 | Stops live budget-loop harm |
| P1 | Jev on DM + Decision Authority block | Sharon: “decision making especially with Jev” |
| P1 | **Adaptive pricing/negotiation** | Sharon: pricing must read client context; flex on reasonable bargains and smaller scope |
| P1 | Polish rules module (incl. leak + stale-number) | Grammar/positioning without new model risk |
| P1 | Regression pack in CI (companion + pricing fixtures) | Never re-loop, never leak, never stale |
| P2 | Journey/emotion memory fields | Context understanding |
| P3 | Learning loop storage | Recursive improvement |
| P4 | Shared channel-aware orchestrator | Required contract shipped; counsel review is still external |

---

## Test plan

### A. Unit (Jest)

- Existing #391: `messenger-pricing-authority.test.ts` (update non-negotiable assertions), `messenger-yqaa-legal-buddy.test.ts`  
- New: `yqaa-adaptive-pricing.test.ts` (PRICING-ADAPTIVE §5)  
- New: companion decision merge (Jev insufficient → escalate; EDUCATE forbids budget-first)  
- Polish: leak scrub; duplicate → escalate reply  
- `jevAdvisory` / orchestration tests remain green  

### B. Regression replays (fixtures, not prod mutation)

System-wide pack. The 2026-10-05 low-budget DM incident is fixture **F1** only. Also: F2 per-page proofreading, F3 form review vs full prep, F4 essay word count, F5 partial packet review, N1–N7 negotiation, M1–M2 memory, L1 leak.

F1 turns:

1. Rich PR/marriage orientation → reply contains pathway substance; **no** immediate hard budget interrogate; evidence appendix requested.  
2. “Going rates?” → no floor/mean dollars.  
3. "$50 to $100 for a consult, I'll do the legwork" → budget parsed as 50–100; scoped consult re-quote or downscope/approval; no blended figure; no “revenue-safe”.  
4. Frustration lines → single escalate handoff; no repeated template or number.  

### C. YMYL / high-stakes

- “What are my chances of winning removal?” → escalate/handoff; no odds.  
- Cross-jurisdiction trap → handoff or clarify.  

### D. Live smoke (post-deploy)

- Staging DM with test providers in ≥3 categories: orientation → budget → scope narrowing → counter → lowball → frustration.  
- Confirm provider attention metadata set; AI does not silent-pause forever.  

### E. Latency

- DM p95 under budget with Jev mocked timeout path covered.  

---

## Dependencies / secrets

- `TYPESAFE_API_KEY` already required in Worker secrets for public YQAA Jev.  
- SuperGrok auth path unchanged.  
- Do not commit secrets; Bridge Freebuff uses Mac env.

---

## Success criteria (companion v1)

1. Regression pack (companion + adaptive pricing) 100% pass in CI.  
1a. Scope narrowing always yields a re-quote; reasonable counters accepted/met; zero stale numbers.  
2. DM turns with orientation queries call evidence + (when configured) Jev.  
3. Zero client-visible internal floor/band/mean language in any path.  
4. Escalation on frustration within one turn after signal.  
5. Architecture docs match shipped modules (update `docs/yqaa/`).  
