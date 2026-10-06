# YQAA Adaptive Pricing & Negotiation Layer (system-wide)

**Status:** Design/spec only (2026-10-06 ET). Implement via Freebuff/Bridge.
**Scope:** **Every provider, every gig/category, every YQAA surface** (provider DMs, public chat, AI offers, provider-authored offer hints). Nothing here is tied to one provider, client, or practice area.
**Repo grounding:** `kylemwalkerpr-ship-it/portal` `main` @ `471d6b2` (PR #391 merged).
**Requirement (Sharon, 2026-10-06):** pricing must read client context. When a client makes a reasonable bargaining request or asks for a smaller scope, YQAA must adapt to those changing variables instead of restating a full-scope floor.
**Supersedes:** the earlier "no pricing-math changes" rule in `BRIEF-FOR-BRIDGE.md` / `ARCHITECTURE.md`. That rule is now **reversed**.

---

## 1. What the code does today (ground truth, `main` @ 471d6b2)

| Where | Behavior | Why it fails adaptive pricing |
|---|---|---|
| `lib/messengerPricingAuthority.ts` → `buildMessengerPricingAuthority()` | `matchMarketplaceIntent()` over the last 12 client messages → one category/subcategory. Collects **all active tier prices (basic + standard + premium blended)** from up to 240 comparable gigs (`activeTierPrices`), plus the provider's same-category tiers. `weightedReferenceMean()` = 0.7·market mean + 0.3·provider mean (blended 80/20 with paid-order mean if ≥5 orders). Floor `minimumAutoOfferCents = max(ceil(0.85 × mean), provider's cheapest same-scope tier, platform min)`. Status is `budget_too_low` whenever `budget.maxCents < floor`. | **Scope-blind.** The floor is a full-category blended mean that ignores which package/depth/quantity the client actually wants. A client asking for a single short consult or a review-only pass gets compared against premium full-prep packages. |
| same file → `extractClientBudget()` | Takes the **latest** client message with budget cue; a range parses only numbers carrying `$`/"dollars"/cue words. "50 dollars to 100" parses as **max $50** (bare "100" is dropped). | Under-reads the budget. No notion of a **counter-offer** as distinct from a budget. |
| same file → `guardMessengerOffer()` / `lowBudgetReply()` / `lowBudgetEscalationReply()` | Binary allow/block: below floor → `below_guarded_floor`; `budget_too_low` → fixed empathy template; no flex, no counter, no midpoint, no downscope quote. `renderPricingAuthority()` labels the block "**SERVER-CALCULATED, NON-NEGOTIABLE**" and feeds floor/mean numbers to the model. | No negotiation exists. The model is told prices are non-negotiable, and it can see the internal floor numbers it is then told not to leak. |
| `lib/messengerAi.ts` → `maybeAutoReply()` (~L1037–1079) | On `budget_too_low` (post-#391): turn 1 = empathic template or the model's non-leaking reply; later turns, frustration, or duplicates = `lowBudgetEscalationReply`. `decision.offer` is **always nulled** on `budget_too_low`. | Even when the client narrows scope, the status stays `budget_too_low` (floor unchanged), so YQAA can only empathize or escalate. It can never quote the smaller scope. |
| `lib/messengerConversationMemory.ts` (`YqaaConversationMemory` v1) | Stores `budget` (latest only), `marketplace_scope` (category), `last_offer` (one). | No scope history, no counters, no quotes made, no concessions. Stale numbers can reappear. |
| DB (`supabase/fiverr_gig_system.sql`) | `gig_tiers(tier basic/standard/premium, title, description, price ≥100¢, delivery_days, revisions, features[])`. No unit pricing, no flex settings. Provider-authored offers already carry `original_price` + `discount_percent` (`provider_offers_and_gigs.sql`). | Package data exists but is unused for scope matching. No per-gig or per-provider flex. |
| Public chat `app/api/chat/route.ts` | No pricing or offers today. | Needs the same leak/stale-number rules if it ever cites prices. |

---

## 2. Design principles

1. **Price the scope the client asked for, not the category.** Scope changes → re-quote from that gig's package/unit data.
2. **Negotiate inside a band. Policy authorizes; Jev recommends.** A deterministic band decides which actions are allowed. Jev picks a posture from that allowed set. The LLM writes prose around numbers the server has already approved.
3. **Never reveal internal numbers.** No floors, bands, means, percentages, "revenue-safe", or "the lowest I'm allowed". Public list prices of a gig's packages are fine to cite.
4. **Monotonic, memory-backed numbers.** Never repeat a stale figure. Never raise a price for the same scope after offering a lower one.
5. **Provider sovereignty.** Providers can widen, narrow, or disable flex per gig. Anything below the band needs provider approval.
6. **Warmth first.** Acknowledge the constraint, say what the smaller price includes, and offer the next step.

---

## 3. Architecture (new module `lib/yqaaAdaptivePricing.ts`, pure functions + thin loaders)

```
client turn
  → extractScopeSignal()        // depth, units, deliverables, narrowing cues
  → extractNegotiationSignal()  // budget (range-aware), counter, haggle count, abuse
  → resolveGigForScope()        // provider-owned gig/tier/unit that matches the scope
  → quoteScope()                // scopedListCents from packages/units
  → resolveFlexPolicy()         // gig → provider → platform defaults
  → classifyCounter()           // reasonable | stretch | lowball | abusive | none
  → eligibleActions()           // deterministic allowed set
  → Jev choice (optional)       // ACCEPT | MEET_MIDDLE | DOWNSCOPE | HOLD_VALUE | ESCALATE_PROVIDER
  → finalizeNumbers()           // clamp, round, monotonic, memory check
  → NEGOTIATION AUTHORITY block (to model; no floors) → draft → polish → offer guard
  → persist negotiation memory
```

`buildMessengerPricingAuthority()` stays the **market-evidence** layer: comparable stats and the evidence-high check. It no longer decides `budget_too_low` on its own. A new `buildAdaptivePricingDecision()` combines it with scope + negotiation and returns the effective status.

### 3.1 Scope signal (`extractScopeSignal`, generic)

Deterministic extractors, category-agnostic:

| Dimension | Examples (any category) | Output |
|---|---|---|
| `depth` | "just review", "look over", "second pair of eyes" → `review`; "quick call", "initial guidance", "point me in the right direction" → `consult`; "only section X", "just the cover letter" → `partial`; "do everything", "file it for me" → `full` | enum `consult \| review \| partial \| full \| unknown` |
| `units` | "8 pages", "1,500 words", "2 documents", "one form", "30 minutes", "1 session" | `{unit: page\|word\|document\|form\|hour\|session, qty}` |
| `narrowing` | "only", "just", "instead", "smaller", "cut it down", "I'll do the legwork", "DIY with guidance", unit qty lower than a prior value | boolean + `delta` vs memory |
| `self_serve` | client offers to do prep themselves | boolean (pushes depth toward `consult`/`review`) |

Optional Jev `choice` over `depth` when regexes disagree (advisory). Server keeps the deterministic value if Jev is unavailable.

### 3.2 Scope quote (`quoteScope`)

Order of evidence. The first one that matches wins:

1. **Unit pricing on the gig** (new optional `gigs.unit_pricing`): `price = base_cents + max(0, qty − included_units) × unit_price_cents`, with a floor of `min_units`.
2. **Tier depth match**: choose the cheapest active tier whose `scope_depth` (new optional) ≥ requested depth and whose `scope_units` (new optional) ≥ requested qty. If those fields are null, infer from `tier` (basic→consult/review, standard→partial, premium→full) and keyword-match `title/description/features`.
3. **Pro-rata from the provider's smallest tier** when qty is below that tier's implied units: `basic.price × (qty / basic_units)`, bounded below by `scopedFloor` (below).
4. **No provider gig in scope** → market **p25 of basic tiers** in the same subcategory, not the blended mean. Mark `needs_provider_confirm=true` and never auto-offer.

Output: `scopedListCents`, `basis` (`unit | tier:<id> | prorata | market_p25`), `includes[]` (human-readable bullets from tier features/description for the reply).

### 3.3 Flex policy (`resolveFlexPolicy`, gig → provider → platform)

| Field | Platform default (**needs Sharon confirmation**) | Meaning |
|---|---|---|
| `negotiation_enabled` | `true` | Provider/gig may disable. When false, the only allowed actions are HOLD_VALUE / DOWNSCOPE / ESCALATE. |
| `auto_accept_pct` | **10%** | Counter ≥ 90% of scoped list → accept at the counter. |
| `flex_pct` | **15%** (matches the existing `MIN_REFERENCE_RATIO = 0.85` policy) | Counter between 85% and 90% → meet in the middle, clamped ≥ scoped floor. |
| `approval_band_pct` | **35%** | Counter between 65% and 85% → offer downscope **or** request provider approval. |
| `max_auto_concessions` | **2** per scope per thread | After two YQAA price moves, hold or escalate. |
| `haggle_escalate_after` | **3** client counters (or 2 after a "final" quote) | → ESCALATE_PROVIDER. |
| `round_to_cents` | **500** ($5) | Prices end on clean numbers. |
| `min_floor_cents` (per gig) | `null` → `max(platform_min, ceil(cheapest_active_tier × (1 − flex_pct)))` | Absolute floor for that gig regardless of scope. |
| `consult_min_cents` (platform, optional) | `null` (unset) → falls back to the rule above | Optional platform-wide minimum for a short orientation consult when a provider has no consult tier. **Sharon to decide** whether to set one (e.g. $50–$75). |

`scopedFloor = max(platform_min, gig.min_floor_cents ?? derived, ceil(scopedListCents × (1 − flex_pct)))`

The old blended `minimumAutoOfferCents` is kept as **audit evidence only**. It stops gating scoped quotes once the scope is known. It still gates when depth = `full`/`unknown` and no tier matched.

### 3.4 Counter classification (`classifyCounter`)

Let `r = counter / scopedListCents` (counter = explicit offer ("would you do $120?") or budget max after a quote):

| Class | Rule | Allowed actions |
|---|---|---|
| `none` | no counter, budget ≥ scoped list | QUOTE / OFFER |
| `reasonable` | r ≥ 1 − auto_accept_pct | ACCEPT (offer at counter, rounded) |
| `reasonable_meet` | 1 − flex_pct ≤ r < 1 − auto_accept_pct | MEET_MIDDLE (midpoint, clamp ≥ scopedFloor), ACCEPT if the provider set `prefer_accept` |
| `stretch` | 1 − approval_band_pct ≤ r < 1 − flex_pct | DOWNSCOPE (largest scope whose scopedFloor ≤ counter), ESCALATE_PROVIDER (approval request), HOLD_VALUE |
| `lowball` | r < 1 − approval_band_pct | DOWNSCOPE if any scope fits; otherwise free public orientation + ESCALATE_PROVIDER; HOLD_VALUE |
| `abusive` | insults, threats, demands for free licensed work, off-platform payment, or >haggle limit with hostility | HOLD_VALUE (polite), ESCALATE_PROVIDER; **no concessions** |

Frustration/exit (`clientFrustrationOrExit`) is **not** abuse. It forces EMPATHIZE + (DOWNSCOPE if available) + ESCALATE, never a repeated template.

### 3.5 Jev role (decision only)

- New Jev `choice` question `negotiation_posture` ∈ {ACCEPT, MEET_MIDDLE, DOWNSCOPE, HOLD_VALUE, ESCALATE_PROVIDER}. The server prunes it to `eligibleActions()` before the call (forbidden options are removed, not down-weighted).
- Jev input = redacted state only: scope enum, units, r-bucket (not raw floor), counter count, emotion band, frustration flag.
- Jev **never** sees or sets a number. `finalizeNumbers()` computes every figure deterministically.
- Timeout or no key → deterministic default: reasonable→ACCEPT, reasonable_meet→MEET_MIDDLE, stretch/lowball→DOWNSCOPE if a fitting scope exists, else ESCALATE_PROVIDER, abusive→HOLD_VALUE+ESCALATE.

### 3.6 Number finalization & guard

- Round to `round_to_cents`. Clamp to ≥ scopedFloor and ≤ client budget max (never quote above a stated budget without asking).
- **Monotonic:** for the same `scope_hash`, a new quote ≤ the previous quote. A narrower scope may be lower; a wider scope may be higher only if the reply explains what was added.
- `guardMessengerOffer` gains a `negotiation` arg. It validates against `scopedFloor` (not the blended floor) when `basis` ≠ `market_p25`, and requires an `approval_token` for anything below scopedFloor.
- Below band with provider approval → set `ai_pricing_approval_pending` on conversation metadata + provider notification. The offer is created only after the provider approves (or the provider sends it themselves using the existing `original_price`/`discount_percent` offer fields).

### 3.7 Negotiation memory (extends `YqaaConversationMemory` → v2, additive)

```ts
negotiation?: {
  scope_current: { depth; units?: {unit; qty}; gig_id?; tier_id?; scope_hash; summary } | null
  scope_history: Array<{ scope_hash; summary; at }>          // ≤10
  budget_latest: { min_cents|null; max_cents; currency; message_id; at } | null   // range-aware
  client_counters: Array<{ cents; message_id; at; class }>   // ≤10
  quotes_made: Array<{ cents; scope_hash; kind: 'quote'|'offer'|'meet'|'downscope'; at; offer_id? }>  // ≤10
  concessions_used: number
  final_quote_scope_hash?: string | null
  approval: { pending: boolean; requested_at?: string; approved_cents?: number } | null
}
```

Rendered to the model as `# NEGOTIATION STATE` with **only client-safe numbers**: latest client budget/counter, the current approved quote, what it includes. Never floors or bands.

**Stale-number guard (polish stage):** every currency amount in the draft must be one of {current approved quote, client's own stated numbers, public tier list prices of the matched gig}. Any other amount → regenerate once, then use a safe templated sentence built from the approved number.

### 3.8 Client copy (tone contract)

- Acknowledge the constraint in the client's own terms ("paid on Friday", "only need the 8 pages").
- State what the reduced price **includes** and what it leaves to them (from `includes[]`).
- One clear next step: "Want me to send that as an offer?" / "I can ask the provider whether they can do $X."
- Never: "floor", "minimum I can auto-send", "revenue-safe", "below what evidence supports", percentages, comparisons to "Marketplace average".
- Escalation copy says a human will review **pricing flexibility**. It does not promise a discount.

`renderPricingAuthority()` header changes from "NON-NEGOTIABLE" to "SERVER-AUTHORIZED NUMBERS — use only these". Internal floor/mean lines move **out of the model prompt** (they stay in the audit snapshot only).

### 3.9 Surfaces

| Surface | Behavior |
|---|---|
| Provider DM (`messengerAi`) | Full layer: scope re-quote, negotiation, offers, approval escalation. |
| Public chat (`/api/chat`) | No offers, no negotiation. May cite public "starting at" tier prices of real gigs and say that smaller scopes and pricing flexibility are handled in the provider DM. Same leak + stale-number polish. |
| Provider-authored offers (dashboard) | Phase 2: show a "suggested scoped price / client counter" hint using the same `quoteScope` + `classifyCounter` functions. The provider always decides. |
| Support handoff | Pricing disputes after an order → HANDOFF_SUPPORT (unchanged). |

---

## 4. Additive DB / settings (all nullable or with safe defaults; no backfill required)

```sql
-- per gig
alter table public.gigs add column if not exists negotiation_enabled boolean;          -- null = inherit
alter table public.gigs add column if not exists negotiation_flex_pct numeric(5,2);    -- null = inherit
alter table public.gigs add column if not exists min_floor_cents integer check (min_floor_cents is null or min_floor_cents >= 100);
alter table public.gigs add column if not exists unit_pricing jsonb;                   -- {unit, unit_price_cents, included_units, min_units, base_cents}
-- per tier
alter table public.gig_tiers add column if not exists scope_depth text check (scope_depth is null or scope_depth in ('consult','review','partial','full'));
alter table public.gig_tiers add column if not exists scope_units integer check (scope_units is null or scope_units > 0);
-- per provider
create table if not exists public.provider_pricing_preferences (
  provider_id uuid primary key references public.profiles(id) on delete cascade,
  negotiation_enabled boolean not null default true,
  auto_accept_pct numeric(5,2),        -- null = platform default
  flex_pct numeric(5,2),               -- null = platform default
  approval_band_pct numeric(5,2),      -- null = platform default
  max_auto_concessions integer,        -- null = platform default
  prefer_accept boolean not null default false,
  updated_at timestamptz not null default now()
);
-- RLS: provider can read/write own row; service role reads.
```

Platform defaults live in the payment settings that `getPaymentSettingsForApi()` reads (`negotiation_default_*` keys). Code constants are used if the keys are absent, so nothing breaks before an admin sets them. Approval state lives in `conversations.metadata` (`ai_pricing_approval_*`) in Phase 1. A dedicated approvals table is Phase 2.

---

## 5. Test specification (`tests/yqaa-adaptive-pricing.test.ts` + replay fixtures)

The fixtures are synthetic and generic. Each one seeds a provider, a gig, tiers/unit pricing, and a thread.

| # | Fixture | Expect |
|---|---|---|
| F1 | **Immigration orientation, low budget** (2026-10-05 incident replay): rich PR/relocation story → "going rates?" → "maybe $50 to $100 for a consult, happy to do the legwork" | Budget parsed as **50–100** (range fix). Scope = `consult` + `self_serve`. Re-quote from the provider's smallest consult/basic tier or pro-rata. If that is still above the counter → DOWNSCOPE/approval path. **Never** emits the blended full-scope figures, never repeats a number, never says "revenue-safe". |
| F2 | **Editing/proofreading per page** (unit $8/page, 20-page full edit quoted $160) → "can you just proofread 8 pages?" | Re-quote = 8 pages at proofread depth (unit math). Lower than $160. Reply lists what's included. |
| F3 | **Form: review vs full prep** (basic=review $150, standard=full prep $400) → "I already filled it out, I just need someone to check it" | Quote $150 (basic/review), not $400. |
| F4 | **Essay word-count reduction** (per-word pricing, 1,000→500 words) | Quote halves, bounded by `min_floor_cents`. |
| F5 | **Partial legal review** (e.g. status-reinstatement packet: client wants only the cover letter reviewed) | depth=`partial` → partial tier or pro-rata. No full-packet price. |
| N1 | Reasonable counter at −8% of scoped list | ACCEPT at the counter (rounded). Offer created. |
| N2 | Counter at −13% | MEET_MIDDLE (≈ −6.5%), ≥ scopedFloor. |
| N3 | Lowball at −50% | DOWNSCOPE option that fits the budget, or escalate. No offer below scopedFloor. |
| N4 | Repeated haggling (3 counters) | ESCALATE_PROVIDER, approval pending, single handoff message (no duplicate). |
| N5 | Abusive counter | No concession. Polite hold + escalate. |
| N6 | Provider `negotiation_enabled=false` / `flex_pct=0` | No price moves. Downscope or escalate only. |
| N7 | Provider override `flex_pct=25` | Band widens accordingly. |
| M1 | Stale number: downscope quote $150 → client "ok let's do it" | Offer at $150, not the original or blended figure. |
| M2 | Monotonic: after quoting $150 for scope S, a later turn for the same S | Never > $150. |
| L1 | **No leak, all fixtures** | Regex over every reply: no `floor`, `revenue-safe`, `reference mean`, `minimum I can`, `%` band talk, `Marketplace average`. Every `$` amount ∈ allowed set. |
| J1 | Jev mocked to pick a pruned option / timeout | Server ignores ineligible picks. Timeout → deterministic default. Jev payload has no cents. |
| P1 | Public chat price question | No offer, no negotiation. Only public "starting at" figures + DM pointer. |

All #391 tests remain green. `messenger-pricing-authority.test.ts` is updated where it asserted the old non-negotiable behavior.

---

## 6. Flags needing Sharon / provider confirmation

1. Default bands: **auto-accept 10%, meet-middle up to 15%, approval zone 15–35%, lowball >35%**.
2. **Max 2 auto concessions**; escalate after **3** counters.
3. `negotiation_enabled` **default ON** for all providers (opt-out). The alternative is opt-in.
4. Platform `consult_min_cents` for short orientation consults: unset by default. Should a floor (e.g. $50–$75) apply across providers?
5. Whether the provider's public tier list prices may be cited in public chat ("starting at").
6. Whether YQAA may offer **free public-resource orientation** on lowball/no-fit (recommended yes, already aligned with the legal-buddy policy).


---

## 7. SPEC CHANGE (Sharon, 2026-10-06 ~17:19 ET, high priority): Workload-inferred pricing

**Every offer must be INFERRED from a workload model**, not from category averages or fixed package floors. This section **takes precedence** over §3.2/§3.3 wherever they conflict. Package/tier/unit prices and the market mean become **inputs and sanity bounds**, not the price.

New pure functions in `lib/yqaaAdaptivePricing.ts`: `estimateWorkload(scope, signals, gig, memory)` → `WorkloadEstimate` and `priceFromWorkload(estimate, policy, context)` → `WorkloadPrice`. All weights, rates, multipliers and thresholds are named constants with comments in **one config file** (e.g. `lib/yqaaPricingConfig.ts`, which also holds the §3.3 band defaults).

### 7.1 Human hours (per component)
Estimate provider hours per task component from the parsed scope:

| Component | Driver |
|---|---|
| `intake_consult` | always present for a new matter; consult-only scope = this plus light prep |
| `document_review` | per document / per page (units from `extractScopeSignal`) |
| `drafting` | per form / per letter / per word block |
| `research` | see 7.2 (separate term) |
| `filing_admin` | filing, packaging, portal submissions (dropped for review-only/consult) |
| `follow_ups` | expected client back-and-forth / RFE response buffer |

Hourly rate resolution: gig `hourly_rate_cents` (new optional additive column) → provider preference → **implied hourly rate** derived from the gig's packages (tier price ÷ implied hours for that tier's scope/delivery days) → platform default constant. Rates are internal only.

### 7.2 Research load
A separate `research_hours` term driven by complexity signals: prior denials, status violations/overstay, multiple jurisdictions, RFE/NOID, criminal history, tight deadlines, novel issues. `complexity_multiplier` = 1 + Σ weights (capped; named constants).

### 7.3 Urgency
Rush multiplier from deadline proximity (named constants): `>30d → 1.0`, `8–30d → 1.15` (band 1.1–1.2), `≤7d → 1.4` (band 1.3–1.5). Deadline parsed from client text (dates, "in 2 weeks", "by Friday", "tomorrow").

### 7.4 Agency / capacity
Client self-service reduces hours: "I'll do the legwork", gathering their own documents, already filled forms, review-only. Each agency signal removes or shrinks specific components (e.g. `document_gathering`/`filing_admin`). Provider capacity/availability (if known) may adjust the urgency multiplier.

### 7.5 Weighted business decision
Transparent weighted score combining:
- cost of hours (hours × effective rate × multipliers),
- market reference (**sanity bound only**: clamp to [market_p25 × lo, market_mean × hi]),
- client budget signal (range-aware),
- likelihood of conversion / repeat,
- risk/liability of the matter,
- **margin floor = hours × minimum effective hourly rate** (hard floor; replaces the blended-mean floor for scoped quotes).
All weights are named constants with comments. Output includes `breakdown[]` (component, hours), `total_hours`, `multipliers`, `price_cents` (rounded $5), `floor_cents` (internal), `confidence`, and `range` when applicable.

### 7.6 Re-infer every turn
Recompute on **every** turn when scope, urgency, agency, complexity, or budget changes (changing circumstances are top priority). Memory (`negotiation.workload_history[]`, ≤10) stores each turn's breakdown + price + reason codes. Replies explain changes in plain terms ("since you'll gather the documents yourself, that's about 2 fewer hours of work") **without** leaking floors, weights, internal rates, or multipliers. Hours deltas and the client-facing price are allowed; rates/weights/floors are not. Monotonic rule (§3.6) applies per *unchanged* workload; a workload change may raise or lower the price with a plain-language explanation.

### 7.7 Jev role
Jev may recommend posture and which components to include/drop (choice/noul over component names); code computes every number. Counter classes and the flex band (§3.4) now apply against the **workload-derived price**.

### 7.8 First line before lawyers
YQAA is first line before the human provider responds. When inferred hours or complexity exceed thresholds (named constants), or confidence is low, quote a **range with provider confirmation** and escalate (`ai_pricing_approval_pending`) instead of a firm price/offer.

### 7.9 Additional tests (W-series)
- W1 urgency rises mid-thread (deadline 45d → 5d) → price rises by the rush multiplier, reply explains why.
- W2 client takes on legwork → hours and price drop; reply mentions fewer hours, no rates.
- W3 complexity revealed mid-thread (prior denial / RFE) → research hours added, price rises, range+confirm if over threshold.
- W4 scope shrinks / grows → hours breakdown moves accordingly.
- W5 hours breakdown is deterministic (same input → identical breakdown).
- W6 high complexity / low confidence → range quote + provider confirm + escalate, no firm offer.
- L1 extended: no rate/weight/multiplier/floor leaks.

### 7.10 DB (additive, optional, not applied)
`gigs.hourly_rate_cents integer null` (and optional `provider_pricing_preferences.hourly_rate_cents`, `min_effective_rate_cents`). Code must work when absent.
