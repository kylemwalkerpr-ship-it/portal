# YQAA Legal Companion — Phase 1 shipped notes

**Branch:** `feat/yqaa-companion-decision-p1` (base `main` @ `43f9b3e`).
**Sources of truth:** `docs/yqaa/companion/{FREEBUFF-MISSION,BRIEF-FOR-BRIDGE,PRICING-ADAPTIVE,ARCHITECTURE,PIPELINE,ROADMAP}.md`.
**Pricing contract as shipped:** `docs/yqaa/PRICING-ADAPTIVE.md`.

Phase 1 delivers four things, system-wide (every provider, gig, category and
YQAA surface): a **companion decision plane** (deterministic gates + Jev),
**adaptive workload-inferred pricing/negotiation**, a **rules-only polish stage**,
and **memory v2** with negotiation state. Public chat keeps its "no offers, no
negotiation" behavior and shares the leak/stale-number rules.

---

## 1. What shipped

| Deliverable | Where |
|---|---|
| Named constants for every band, weight, rate, multiplier and threshold | `lib/yqaaPricingConfig.ts` |
| Workload/negotiation engine (pure functions + tolerant loaders) | `lib/yqaaAdaptivePricing.ts` |
| Decision plane (deterministic gates, pruned Jev choices, journey stage) | `lib/yqaaCompanionDecision.ts` |
| Polish stage (leak scrub, stale-number guard, posture check, includes, duplicate → escalate) | `lib/yqaaCompanionPolish.ts` |
| Jev companion advisory (`posture` + `negotiation_posture`, money stripped from the payload) | `lib/jevAdvisory.ts` (additive) |
| Range-aware budget parsing, client-safe pricing render, negotiation-aware offer guard | `lib/messengerPricingAuthority.ts` |
| Memory v2 (journey stage, posture, emotion band, negotiation + workload history) | `lib/messengerConversationMemory.ts` |
| DM wiring: re-infer every turn, guarded offers, approval/escalation path, prompt blocks | `lib/messengerAi.ts` |
| Additive, idempotent schema (never applied) | `supabase/yqaa_adaptive_pricing.sql` |

## 2. Turn wiring in `maybeAutoReply` (DM)

1. Evidence + market authority load in parallel (unchanged, PR #391 preserved).
2. `buildAdaptivePricingDecision()` re-infers the workload **every turn** and wraps
   `buildMessengerPricingAuthority()` as audit evidence; the effective status comes
   from the scoped/workload quote, not the blended floor.
3. `buildMessengerDecisionAuthority()` runs the deterministic gates, prunes the
   posture/negotiation sets and consults Jev (≤1400 ms, redacted payload).
4. The system prompt gains `# NEGOTIATION STATE — SERVER-AUTHORIZED NUMBERS` and
   `# DECISION AUTHORITY — SERVER`; the pricing block no longer contains floors,
   means or evidence highs (they remain in `pricingAuditSnapshot`).
5. Post-draft: the server overwrites any model figure with the approved number
   (`ACCEPT` / `MEET_MIDDLE` / `DOWNSCOPE` / `QUOTE`), synthesises an offer when the
   client asked to buy or countered and the model did not, sets
   `ai_pricing_approval_pending` + provider attention for `ESCALATE_PROVIDER` or the
   range path, and never nulls the offer on `budget_too_low` when a scoped number
   was authorized.
6. Polish runs rules-first, regenerates once on a violation, then falls back to a
   template built only from the approved number. A duplicate forces an escalation
   handoff (PR #391 anti-loop).
7. Negotiation memory persists scope, budget, counters, quotes, concessions,
   approval state and `workload_history[]` (≤10).

## 3. Prompt changes

- Removed from the model-facing pricing block: reference mean, floor, market
  mean/median/p25/p90 and the "NON-NEGOTIABLE" header. Header is now
  `# YQAA PRICING AUTHORITY — SERVER-AUTHORIZED NUMBERS — use only these`.
- Pricing rules now say: follow the negotiation state, use only server-approved
  numbers, explain what the reduced price includes, never mention floors, means,
  medians, bands, percentages, rates, weights, multipliers or "revenue-safe".
- A `DECISION AUTHORITY` rule block tells the model to follow the server posture.

## 4. Tests

| File | Coverage |
|---|---|
| `tests/yqaa-adaptive-pricing.test.ts` | F1–F5 scope re-quotes, N1–N7 negotiation bands, M1–M2 stale/monotonic numbers, L1 leak sweep, J1 Jev payload/pruning/timeout, P1 public chat, W1–W6 workload model, migration tolerance |
| `tests/yqaa-companion-decision.test.ts` | orientation → EDUCATE, frustration → escalate even when Jev is sufficient, high-stakes gates, budget-gap gate, duplicate gate, Jev timeout/throw containment, pruned option ignored, DM path calls Jev when the key is configured (recorded fetch), journey stage |
| `tests/yqaa-companion-polish.test.ts` | leak lexicon, stale-number scrub, approved-number fallback template, posture check, includes append, duplicate → escalate, regeneration pipeline |
| `tests/messenger-pricing-authority.test.ts` | updated/added: range budget (`$50 to $100`), scoped-floor offer guard, approval token, client-safe render, audit snapshot retains internal evidence |

All other existing tests are unchanged.

## 5. Migration

`supabase/yqaa_adaptive_pricing.sql` is additive and idempotent
(`add column if not exists`, `create table if not exists`, RLS own-row policy for
`provider_pricing_preferences`) and lives at the top-level `supabase/` folder, **not**
under `supabase/migrations/`. It has **not** been applied anywhere. The code tolerates
its absence: the gig projection falls back to a base select without the adaptive
columns and every preference/tier lookup treats a missing column as "inherit".

## 6. Flags and deviations (honest list)

1. **Verification environment.** `node_modules` in this worktree is a symlink outside
   the permitted sandbox boundary, so `npx jest` / `npx tsc --noEmit` could not be
   executed here (npm could not even resolve a local `jest`). Instead the real test
   files were executed with Node's TypeScript support against the real modules
   (loader + tiny Jest-compatible runner): 95/95 assertion groups pass across
   `yqaa-adaptive-pricing`, `yqaa-companion-decision`, `yqaa-companion-polish`,
   `messenger-pricing-authority` and `messenger-escalation-followup`, plus all other
   runnable `messenger-*`/`yqaa-*` files. Files that use `jest.mock` (e.g.
   `messenger-yqaa-legal-buddy`, `yqaa-evidence-ladder`, `messenger-ai-mode`) could not
   run in that harness and still need the real `npx jest` gate. A type-check gate
   (`npx tsc --noEmit`) also still needs to run in an environment with dependencies.
2. **Range counters.** "could you do $50 to $100" is treated as a *budget range*
   (`min 50 / max 100`), not as a $50 counter (fixture F1), so the server quotes
   within the range instead of reading the low end as their offer.
3. **Downscope cost.** A downscope can land below the client's stated minimum when
   that is what the smaller scope genuinely costs; only "≤ budget max" and "≥ floor"
   are clamped by design.
4. `posture` for a plain quote with commerce intent resolves to `COMMERCE`/`NEGOTIATE`
   depending on whether a counter or scope move is in play — both are server-authorized.
5. Pending Sharon/provider confirmation of the band defaults (auto-accept 10%, flex 15%,
   approval 35%, 2 concessions, 3 counters, `consult_min_cents` unset) — they ship as
   named constants so a single edit changes them.
6. `RANGE_HOURS_THRESHOLD` (10 h) is a judgement call not fixed by the spec; it keeps
   routine mid-size matters firm while large/high-complexity matters go to the range +
   provider-confirmation path.
