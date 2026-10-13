# YQAA Adaptive Pricing & Negotiation — as shipped (Phase 1)

**Status:** implemented on `feat/yqaa-companion-decision-p1` (Phase 1). This file
replaces the design-only copy with the shipped contract. The design history lives in
`docs/yqaa/companion/PRICING-ADAPTIVE.md` (untouched planning pack).

**Scope:** system-wide. No provider, client, gig or practice area is hard-coded;
every tunable is a named constant in `lib/yqaaPricingConfig.ts` and every provider
override comes from data.

---

## 1. Modules

| Module | Role |
|---|---|
| `lib/yqaaPricingConfig.ts` | ALL named constants with comments: bands, per-component hours, research/complexity weights, urgency multipliers, agency reductions, rates, business-decision weights, range thresholds. |
| `lib/yqaaAdaptivePricing.ts` | Pure pricing/negotiation engine + thin loaders: signals → workload → price → policy → counter class → actions → finalized (rounded, clamped, monotonic) numbers → client-safe render. |
| `lib/messengerPricingAuthority.ts` | Market **evidence** layer (audit only). Range-aware budget parsing, client-safe model render, negotiation-aware offer guard. |
| `lib/yqaaCompanionDecision.ts` | Deterministic gates first, Jev posture/negotiation advisory second (pruned sets), `renderDecisionAuthority()`. |
| `lib/yqaaCompanionPolish.ts` | Rules-only leak + stale-number scrub, posture check, includes append, duplicate → escalate. |
| `lib/messengerConversationMemory.ts` | Memory v2 (additive; v1 rows still readable): journey stage, posture, emotion band, negotiation block incl. `workload_history[]`. |
| `lib/messengerAi.ts` | `maybeAutoReply` wiring: re-infer every turn, guarded offers at server-approved numbers, approval/escalation path, `# DECISION AUTHORITY — SERVER` + `# NEGOTIATION STATE` in the prompt. |
| `supabase/yqaa_adaptive_pricing.sql` | Additive + idempotent schema (never auto-applied, not under `supabase/migrations/`). |

## 2. Pipeline per turn

```
client turn
  → extractScopeSignal / extractNegotiationSignal / extractUrgencySignal
    / extractComplexitySignal / extractAgencySignal
  → resolveGigForScope (provider gig + tier that matches the scope)
  → estimateWorkload (per-component hours)
  → priceFromWorkload (hours × rate × complexity × urgency, weighted business
    decision, hard margin floor, market + unit-price sanity clamps, $5 rounding)
  → resolveFlexPolicy (gig → provider_pricing_preferences → settings → constants)
  → classifyCounter → eligibleActions → Jev (optional, pruned) → finalizeNumbers
  → NEGOTIATION STATE block (client-safe numbers only) → draft → polish → offer guard
  → persist negotiation memory
```

## 3. Workload model (what actually sets the price)

Internal hourly rate resolution: `gigs.hourly_rate_cents` → provider
`provider_pricing_preferences.hourly_rate_cents` → **implied** rate from the
matched tier (tier price ÷ the hours that tier's declared scope implies, with the
unit taken from the client's scope or the tier copy) → `DEFAULT_HOURLY_RATE_CENTS`
(platform default). Rates are internal and never rendered.

| Component | Driver (constants) |
|---|---|
| `intake_consult` | 0.5 h per new matter |
| `consult_prep` | 0.25 h for consult-only scopes |
| `consult_session` | `CONSULT_SESSION_HOURS` per requested hour/session |
| `document_review` | 0.25 h per document + 0.05 h per page (0.75 h per form review) |
| `drafting` | 1.5 h/form, 1.0 h/letter, 1.0 h/500 words, 0.2 h/page; partial ×0.35, review ×0 |
| `filing_admin` | 1.0 h (dropped for review/consult and for self-service) |
| `follow_ups` | 0.5 h (×0.5 for review, ×0.5 more when the client self-serves) |
| `research` | 0.25 h baseline (non-consult) + complexity weights (prior refusal 2, status violation 2.5, multi-jurisdiction 1.5, RFE/NOID 2, criminal 3, tight deadline 1, novel 1.5; capped at 12 h) |
| multipliers | `complexity_multiplier` = 1 + Σresearch hours × 0.05 (cap 1.75); `urgency_multiplier` 1.0 (>30d) / 1.15 (8–30d) / 1.4 (≤7d) |

Business decision (§7.5): weighted blend of cost-of-hours (0.78), the client's
range-aware budget signal (0.12, never above their figure), conversion likelihood
(0.06, ≤10% discount) and risk/liability (0.04, ≤15% premium). The market
reference and any `unit_pricing` are **sanity clamps only**. The hard floor is
`hours × MIN_EFFECTIVE_HOURLY_RATE_CENTS` (plus `gigs.min_floor_cents` when set).

Range path (§7.8): above `RANGE_HOURS_THRESHOLD` (10 h), above
`RANGE_COMPLEXITY_THRESHOLD` (1.4), below `RANGE_CONFIDENCE_THRESHOLD` (0.5), or
with no matching provider tier → a range with provider confirmation, never a firm
number, and `ai_pricing_approval_pending` + provider attention.

## 4. Defaults shipped (all in `lib/yqaaPricingConfig.ts`)

| Setting | Constant | Value |
|---|---|---|
| negotiation enabled | `NEGOTIATION_ENABLED_DEFAULT` | `true` (gig/provider opt-out) |
| auto-accept | `AUTO_ACCEPT_PCT` | 10% |
| meet-in-the-middle ceiling | `FLEX_PCT` | 15% |
| downscope / approval band | `APPROVAL_BAND_PCT` | 35% (below = lowball) |
| max auto concessions | `MAX_AUTO_CONCESSIONS` | 2 per scope |
| haggle escalation | `HAGGLE_ESCALATE_AFTER` | 3 counters (2 after a "final" quote) |
| rounding | `ROUND_TO_CENTS` | 500 ($5) |
| platform consult minimum | `CONSULT_MIN_CENTS` | `null` (unset) |
| margin floor rate | `MIN_EFFECTIVE_HOURLY_RATE_CENTS` | 4500 ($45/h) |
| fallback hourly rate | `DEFAULT_HOURLY_RATE_CENTS` | 22000 ($220/h) |
| default delivery / revisions / expiry | `DEFAULT_DELIVERY_DAYS`, `DEFAULT_REVISIONS`, `DEFAULT_OFFER_EXPIRES_DAYS` | 5 / 1 / 7 |

## 5. Provider / platform overrides (no deploy needed once the SQL is applied)

Order: **gig → provider → platform settings → code constant**.

| Layer | Fields |
|---|---|
| `gigs` | `negotiation_enabled`, `negotiation_flex_pct`, `min_floor_cents`, `unit_pricing`, `hourly_rate_cents` |
| `provider_pricing_preferences` | `negotiation_enabled`, `auto_accept_pct`, `flex_pct`, `approval_band_pct`, `max_auto_concessions`, `prefer_accept`, `hourly_rate_cents`, `min_effective_rate_cents`, `min_floor_cents` |
| `platform_settings` (key `default`) | `negotiation_default_enabled`, `negotiation_default_auto_accept_pct`, `negotiation_default_flex_pct`, `negotiation_default_approval_band_pct`, `negotiation_default_max_auto_concessions`, `negotiation_default_haggle_escalate_after`, `negotiation_default_round_to_cents`, `negotiation_consult_min_cents` |

Percentages accept either form (`15` or `0.15`). Anything absent falls back to the
code constant, so the app works with the migration unapplied.

## 6. Rules that cannot be broken

1. Every number is computed server-side; the model may only use the
   `# NEGOTIATION STATE` approved figure, the client's own figures, public package
   list prices, or server-priced downscope options.
2. No floors, means, bands, percentages, averages, rates, weights, multipliers or
   "revenue-safe" language reaches the client (polish scrubs; the model prompt no
   longer contains the numbers at all).
3. Prices are rounded to $5, clamped to `≥ scoped floor` and `≤ client budget max`,
   and monotonic per scope hash (a smaller scope may be cheaper; the same scope is
   never re-quoted higher).
4. Frustration / exit escalates once and is never a repeated template.
5. Below the band: downscope if a fitting scope exists, otherwise provider
   approval (`ai_pricing_approval_pending`) — never an offer below the scoped floor.
6. Public chat never offers and never negotiates (`publicChatPricingPolicy()`), it
   may cite public list prices and point to the DM.

## 7. Toggles

- Disable flex for one gig: `gigs.negotiation_enabled = false` (or `negotiation_flex_pct = 0`).
- Disable flex for one provider: `provider_pricing_preferences.negotiation_enabled = false`.
- Disable platform-wide: `negotiation_default_enabled = false` in `platform_settings`.
- Widen/narrow: `negotiation_flex_pct` (gig) / `flex_pct` (provider) / `negotiation_default_flex_pct`.
- Change the hard floor: `provider_pricing_preferences.min_effective_rate_cents` or the constant.
- Change the escalation appetite: `negotiation_default_haggle_escalate_after`, `max_auto_concessions`.
