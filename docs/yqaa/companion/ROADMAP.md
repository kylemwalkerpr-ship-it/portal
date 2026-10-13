# YQAA Legal Companion — Roadmap

**Baseline:** PR **#391** (merged to `main` @ `471d6b2`) = legal-buddy orientation + budget-loop harden + DM evidence **v0**.  
**Scope:** System-wide. Every provider, gig, category, and YQAA surface.  
**Repo:** `kylemwalkerpr-ship-it/portal`  
**Implementation lane:** Freebuff via YouSafe Bridge on Mac (not this CoS box coding task).

---

## Phase 0 — Land v0 (merged; deploy/smoke pending)

**Owner:** deploy + smoke for #391.

- [x] CI green on #391  
- [x] Merged to `main` (`471d6b2`)  
- [ ] Deploy Worker (verify)  
- [ ] Live low-budget DM smoke on a staging provider (see Test plan)  
- [ ] Confirm no client-facing “revenue-safe” / $812/$690 dumps  

**Freebuff:** finish any CI flakes only; do not expand scope until merged.

---

## Phase 1 — Companion Decision + Adaptive Pricing (first Freebuff build after #391)

**Goal:** Jev-compatible decision layer on **DM** + **adaptive pricing/negotiation** (scope re-quote, flex band, counter classes, negotiation memory) + grammar/positioning/leak/stale-number polish. Still YMYL-safe, for all providers. The earlier "no pricing-math changes" rule is **reversed** (Sharon, 2026-10-06).

### Build first

1. Extract shared helpers (no behavior change):  
   - `lib/yqaaCompanionDecision.ts` wrapping deterministic budget-loop/frustration gates + optional Jev  
   - `lib/yqaaCompanionPolish.ts` (rules: leak scrub, stale-number scrub, posture check, anti-dup; reuse #391 helpers)
   - `lib/yqaaAdaptivePricing.ts` (scope signal, range-aware budget/counter, scoped quote, flex policy, counter classifier, finalizeNumbers)
2. Wire **Jev into messenger** path (mirror public chat):  
   - After `loadMessengerLegalEvidence`, call `requestJevAdvisory` (or extended companion questions)  
   - Inject `# DECISION AUTHORITY` into system context  
   - On Jev timeout: deterministic-only (loop-safe + pricing defaults)
3. Replace the unconditional `decision.offer = null` on `budget_too_low` with the adaptive decision (ACCEPT / MEET_MIDDLE / DOWNSCOPE offers at server-approved numbers; ESCALATE_PROVIDER approval path)
4. Extend memory schema v1→v2 **additive**: `journey_stage`, `emotion_band`, `last_posture`, `negotiation{…}` (nullable)
5. Additive migration `supabase/yqaa_adaptive_pricing.sql` (gig flex/unit fields, tier scope fields, `provider_pricing_preferences`). Code tolerates it not being applied.
6. Docs: `docs/yqaa/` companion decision contract + `PRICING-ADAPTIVE.md`  
7. Tests: companion fixtures + PRICING-ADAPTIVE §5 (F1–F5, N1–N7, M1–M2, L1, J1, P1)

### Build later (still Phase 1 if capacity)

- Optional Jev `emotion` score + `posture` choice questions (shadow log first)
- Public chat + DM shared orchestrator thin wrapper

### Explicitly later (Phase 2+)

- Full recursive learning warehouse  
- Second-model grammar polish LLM  
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

## Phase 4 — Unification & polish SOTA

- Single Companion Orchestrator for DM + public + support handoff  
- Optional dedicated grammar polish model (content-safe)  
- Latency observability (`Server-Timing` for DM)  
- US YMYL counsel review of disclosure + escalate copy  

**Bounded packet status (2026-10-13):** public, DM, and support paths now share a small deterministic decision-record contract; the existing DM authority remains authoritative. DM `Server-Timing` visibility and a 42-second cancellable public `/api/chat` deadline are implemented. This is not a broad orchestrator rewrite; optional polish model and counsel review remain open.

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
| P4 | Orchestrator unify | Clean architecture long-term |

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
