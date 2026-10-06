# Freebuff Task Brief: YQAA Legal Companion Phase 1 (system-wide)

**For:** Freebuff on Mac via YouSafe Bridge
**From:** CoS research/planning (box docs at `/workspace/yqaa-legal-companion/`)
**Repo:** `kylemwalkerpr-ship-it/portal`. Base: `main` @ `471d6b2` (PR #391 merged: empathy + DM evidence v0 + budget-loop harden). Do not regress #391.
**Scope:** **System-wide.** Covers every provider, gig, category, and YQAA surface (provider DMs, public chat, AI offers). Do not hard-code any provider, client, or practice area. Incident transcripts are only test fixtures.

**Mode:** Implement Phase 1 only. No drive-by refactors. No secrets in git.
**Pricing rule (CHANGED 2026-10-06):** The earlier "no pricing-math changes" rule is **REVERSED**. Phase 1 **includes** the Adaptive Pricing / Negotiation layer (see `PRICING-ADAPTIVE.md`). The blended market floor stays as evidence. Scoped quotes, flex bands, and negotiation are new.

---

## Objective

Make YQAA a context-aware **legal companion and fair negotiator** on every provider's DMs:

1. Substance-first, compassionate, YMYL-safe replies.
2. **Jev (TypeSafe SystemOne) in the decision loop** for posture and negotiation posture.
3. Deterministic grammar/positioning polish.
4. **Adaptive pricing**: re-quote when the client narrows scope, flex within a provider-configurable band on reasonable counters, downscope or escalate below the band, and never leak internal numbers or repeat stale ones.

---

## Context (read first)

1. Current pricing is scope-blind (see `PRICING-ADAPTIVE.md` §1). `buildMessengerPricingAuthority()` gates on a blended all-tier category mean × 0.85. `extractClientBudget()` drops the upper end of ranges like "50 dollars to 100". `guardMessengerOffer()` is binary. `maybeAutoReply()` nulls every offer on `budget_too_low`.
2. Jev already exists for **public** chat: `lib/jevAdvisory.ts` → `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`, `TYPESAFE_API_KEY`. `messengerAi.ts` does **not** call Jev yet.
3. Full design: `ARCHITECTURE.md`, `PIPELINE.md`, `ROADMAP.md`, **`PRICING-ADAPTIVE.md`** (copy into `docs/yqaa/`).

---

## Phase 1 deliverables (code)

### 1) Shared decision module: `lib/yqaaCompanionDecision.ts`
- Input: redacted query, evidence chunks, adaptive pricing decision, frustration/duplicate flags, channel.
- Deterministic gates first: frustration → empathize + escalate; budget gap already explained with no new scope or counter → escalate; high-stakes triggers → escalate.
- If `TYPESAFE_API_KEY` is present: Jev advisory (reuse `requestJevAdvisory` or a thin wrapper, 1400 ms timeout). Questions: `posture` (choice) and, when pricing is in play, `negotiation_posture` (choice). Both choice sets are pruned server-side.
- Output: `{ posture, negotiationAction?, escalate, reasons[], jev|null }`. Posture ∈ `EDUCATE|DISCOVER|EMPATHIZE|COMMERCE|NEGOTIATE|ESCALATE_PROVIDER|HANDOFF_SUPPORT|ABSTAIN`.
- If Jev is unavailable: deterministic posture/action defaults (PRICING-ADAPTIVE §3.5).

### 2) Adaptive pricing module: `lib/yqaaAdaptivePricing.ts` (pure + thin loaders)
- `extractScopeSignal(messages, memory)`: depth (`consult|review|partial|full`), units (page/word/document/form/hour/session), narrowing, self-serve.
- `extractNegotiationSignal(messages, memory)`: **range-aware budget** (fix the "X dollars to Y" upper bound), explicit counters, counter count, abuse flag.
- `resolveGigForScope` / `quoteScope`: unit pricing → tier depth match → pro-rata from the smallest tier → market p25 basic (provider confirm, no auto-offer).
- `resolveFlexPolicy`: gig → `provider_pricing_preferences` → platform defaults (code constants if settings keys are absent).
- `classifyCounter` → `reasonable | reasonable_meet | stretch | lowball | abusive | none`. `eligibleActions` → subset of `ACCEPT|MEET_MIDDLE|DOWNSCOPE|HOLD_VALUE|ESCALATE_PROVIDER`.
- `finalizeNumbers`: round to $5, clamp ≥ scopedFloor and ≤ client budget, monotonic per scope_hash, max concessions.
- `buildAdaptivePricingDecision()` wraps `buildMessengerPricingAuthority()`. The effective status comes from the scoped quote, not the blended floor, once scope is known.
- `renderNegotiationAuthority()`: model-facing block with **only client-safe numbers** (approved quote, client's own figures, public tier list prices, `includes[]`). Remove floor/mean lines from the model prompt (keep them in `pricingAuditSnapshot`). Change the header off "NON-NEGOTIABLE".
- Extend `guardMessengerOffer` with an optional `negotiation` arg: validate against scopedFloor; require a provider approval token below the band.

### 3) Wire into `maybeAutoReply` (`lib/messengerAi.ts`)
- Replace the unconditional `decision.offer = null` on `budget_too_low` with the adaptive decision. ACCEPT/MEET_MIDDLE/DOWNSCOPE may produce a guarded offer at the server-approved number. ESCALATE_PROVIDER sets `ai_pricing_approval_pending` + provider attention.
- Keep #391 anti-loop behavior: no duplicate replies, frustration → escalate once.
- Append `# DECISION AUTHORITY — SERVER` + `# NEGOTIATION STATE` to the system context.
- Update `SYSTEM_PROMPT` pricing rules: acknowledge the constraint warmly, explain what the reduced price includes, use only server-approved numbers, never mention floors/bands/percentages.

### 4) Polish module: `lib/yqaaCompanionPolish.ts` (rules only)
- Reuse `leaksInternalFloorLanguage`, `isNearDuplicateReply`, `clientFrustrationOrExit`.
- Extend the leak lexicon with `floor`, `minimum I can`, `band`, `Marketplace average`, `% off` style band talk.
- **Stale-number guard:** every currency amount in a reply must be in the allowed set. Otherwise regenerate once, then fall back to a template built from the approved number.
- Posture check: EDUCATE/DISCOVER must not open with a budget interrogation.

### 5) Memory (additive, v1 → v2)
- `journey_stage`, `last_posture`, `emotion_band` (nullable).
- `negotiation` block per PRICING-ADAPTIVE §3.7: scope_current/history, budget_latest (range), client_counters, quotes_made, concessions_used, approval. The reader must accept v1 rows.

### 6) DB migration (additive, safe defaults): `supabase/yqaa_adaptive_pricing.sql`
- `gigs`: `negotiation_enabled`, `negotiation_flex_pct`, `min_floor_cents`, `unit_pricing jsonb` (all nullable = inherit).
- `gig_tiers`: `scope_depth`, `scope_units` (nullable).
- New `provider_pricing_preferences` (RLS: own row). See PRICING-ADAPTIVE §4.
- Do **not** apply to production without Sharon's go-ahead. Code must work if the migration has not run (treat missing columns as null).

### 7) Tests
- `tests/yqaa-companion-decision.test.ts`: orientation → EDUCATE. Frustration → escalate even if Jev says sufficient. Jev timeout → deterministic, no throw. Jev picks a pruned option → ignored.
- `tests/yqaa-adaptive-pricing.test.ts`: fixtures **F1–F5, N1–N7, M1–M2, L1, J1, P1** from PRICING-ADAPTIVE §5. At minimum:
  - F1 low-budget immigration consult replay: budget = 50–100, scoped consult re-quote, never the blended full-scope figure, no repeat.
  - F2 per-page proofreading reduction, F3 form review vs full prep, F4 word-count reduction, F5 partial packet review.
  - Reasonable 8% counter accepted. 13% counter → midpoint. 50% lowball → downscope. 3 counters → provider escalation. Abusive → no concession.
  - No floor/band leak and no stale number in **any** reply.
- Polish tests: leak scrub, stale-number scrub, duplicate → escalate.
- Update `messenger-pricing-authority.test.ts` where it asserted non-negotiable behavior. Keep all other #391 tests green.

### 8) Docs
- `docs/yqaa/COMPANION-PHASE1-NOTES.md` + `docs/yqaa/PRICING-ADAPTIVE.md`: what shipped, defaults, how providers override, how to toggle.

---

## Defaults to ship (flagged: pending Sharon/provider confirmation)

| Setting | Default |
|---|---|
| negotiation_enabled | true (provider/gig opt-out) |
| auto_accept_pct | 10% |
| flex_pct (meet-middle ceiling) | 15% |
| approval_band_pct | 35% |
| max_auto_concessions | 2 per scope |
| haggle_escalate_after | 3 counters |
| round_to | $5 |
| consult_min_cents | unset |

Keep these as named constants in one file so they are easy to change.

---

## Out of scope (Phase 1)
- Provider dashboard UI for flex settings (Phase 2; DB/API only now)
- Provider-authored offer hint UI (Phase 2)
- Learning warehouse / DecisionRecord DB (Phase 3)
- Public chat rewrite. Only add the shared leak/stale-number polish and "no negotiation in public" behavior.
- New npm dependencies unless essential
- Deploy or production migration unless Sharon asks

---

## Acceptance checklist
- [ ] `npx jest` green on messenger + companion + adaptive pricing + jev orchestration tests
- [ ] DM path invokes Jev when the key is configured (mock asserted)
- [ ] Scope narrowing produces a new lower scoped quote (F1–F5), never a restated full-scope floor
- [ ] Reasonable counters accepted or met. Lowball → downscope. Repeated haggling → provider escalation.
- [ ] Zero floor/band/"revenue-safe" leaks and zero stale numbers across all fixture replies
- [ ] Frustration path escalates once, no loop
- [ ] Code works with and without the additive migration applied
- [ ] No secrets committed. `TYPESAFE_API_KEY` stays Worker-only.

## Suggested branch / PR
`feat/yqaa-companion-adaptive-pricing-p1` from `main`.
PR title: `feat(yqaa): companion decision plane (Jev) + adaptive pricing/negotiation + polish (phase 1)`

## Reference paths
`lib/messengerPricingAuthority.ts` · `lib/messengerAi.ts` · `lib/messengerConversationMemory.ts` · `lib/jevAdvisory.ts` · `lib/fiverr.ts` (`getPaymentSettingsForApi`) · `supabase/fiverr_gig_system.sql` (gigs, gig_tiers) · `supabase/provider_offers_and_gigs.sql` (offer discount fields) · `app/api/chat/route.ts` · `docs/yqaa/*` · box pack `/workspace/yqaa-legal-companion/*`
