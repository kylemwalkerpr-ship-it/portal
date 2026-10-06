# YQAA Legal Companion — Turn Pipeline

**Scope:** System-wide. Same pipeline for every provider, gig, and category. Provider DM (`lib/messengerAi.ts` / `maybeAutoReply`) is the primary companion and negotiation surface; public chat (`app/api/chat/route.ts`) shares the Decision, Evidence, and Polish planes (no offers/negotiation).

Each client turn runs the stages below. Stages marked **[exists]** are on portal `main` (incl. merged PR #391); **[target]** are companion expansion.

---

## Stage map

```
1 INTAKE
2 CONTEXT GRAPH
3 INTENT / EMOTION
4 EVIDENCE
4b ADAPTIVE PRICING (scope → quote → flex → counter class)
5 DECISION (Jev + deterministic)
6 DRAFT
7 GRAMMAR / POSITIONING POLISH
8 SAFETY / AUTHORITY
9 SEND / ESCALATE
10 LEARN (async)
```

---

## 1. Intake **[exists]**

**Inputs:** conversation id, latest client message, message history, attachments, `ai_mode`, provider + client profiles.

**Checks:**

- `ai_mode` ∈ {`auto`,`paused`,`off`} — only `auto` auto-replies.
- Ignore typing bubbles / AI echoes.
- Resolve provider label (human name); never claim to *be* them.
- Build turn envelope: `{channel:'dm', text, clientId, providerId, locale?}`.

**Output:** `TurnEnvelope`.

---

## 2. Context Graph **[exists partial → target]**

**Exists:** `buildGroundedConversationMemory` → markets, budget, docs, deadlines, goals, provider attention.

**Target additions:**

- `journey_stage` (orienting → crisis/exit_risk)
- `role_frame` (seeker vs provider human already present structurally)
- `thread_commitments` (hashes/snippets of prior YQAA explanations to block repeats)
- Redacted copy of latest text for Jev (`sanitizeYqaaPublicQuestion`)

**Rules:** client-authored facts only; no model summary as truth.

**Output:** `YqaaContextGraph`.

---

## 3. Intent / Emotion **[exists partial → target]**

**Exists (deterministic):**

- `commerceIntent(text)`
- `messengerNeedsLegalEvidence(text)` (PR #391)
- `clientFrustrationOrExit(text)` (PR #391)
- `yqaaNeedsFreshWebResearch(text)`
- Public-chat: `yqaaJevTriggers` (ambiguous, high_stakes, …)

**Target:**

- Journey-aware intent: orientation vs commerce vs status-check vs crisis.
- Optional Jev `emotion` score (Calm → Distressed) over redacted state — advisory only.
- Seeker vs provider: if human provider messaged, pause AI (existing takeover).

- **Scope signal** (`extractScopeSignal`): depth consult/review/partial/full, units (page/word/document/form/hour/session), narrowing, self-serve.
- **Negotiation signal** (`extractNegotiationSignal`): range-aware budget, explicit counter, counter count, abuse.

**Output:** `IntentPacket` `{ intents[], frustration, emotion?, triggers[], scope, negotiation }`.

---

## 4. Evidence **[exists + PR #391]**

**Parallel fetch (fail soft):**

| Source | Function |
|---|---|
| Site / provider gigs | `buildMessengerSiteKnowledge` |
| Legal KB index | `loadYqaaEvidence` via `loadMessengerLegalEvidence` |
| Live web (gov) | `researchYqaaPublicWeb` when freshness needed |
| Pricing | `buildMessengerPricingAuthority` |
| Docs on thread | attachment summary |

Render:

- `## GROUNDED LEGAL / PUBLIC EVIDENCE`
- `## LIVE WEB RESEARCH THIS TURN` (if any)
- Pricing authority block (internal; model must not leak floors)

**Output:** `EvidencePack` + `PricingAuthority` (market evidence; audit only).

---

## 4b. Adaptive pricing **[target — PRICING-ADAPTIVE.md]**

1. `resolveGigForScope` → provider-owned gig/tier/unit pricing matching the scope.
2. `quoteScope` → `scopedListCents` (unit → tier depth → pro-rata → market p25 basic with provider confirm).
3. `resolveFlexPolicy` → gig → provider → platform defaults (auto-accept 10%, meet ≤15%, approval ≤35%; pending confirmation).
4. `classifyCounter` → reasonable / reasonable_meet / stretch / lowball / abusive / none.
5. `eligibleActions` → subset of ACCEPT / MEET_MIDDLE / DOWNSCOPE / HOLD_VALUE / ESCALATE_PROVIDER.
6. Render `# NEGOTIATION STATE` with **only client-safe numbers** (approved quote, client's own figures, public tier list prices, `includes[]`). Floors/means stay out of the prompt.

**Output:** `AdaptivePricingDecision`.

---

## 5. Decision (Jev in the loop) **[public exists | DM target]**

### 5.1 Deterministic pre-gates (always first)

1. High-stakes personal legal action → `ESCALATE_PROVIDER` / support.  
2. Frustration / exit → `EMPATHIZE` + `ESCALATE_PROVIDER`.  
3. Near-duplicate prior AI / budget gap already explained with no new scope or counter → escalate.  
4. Scope narrowed or counter made → `NEGOTIATE` (re-quote), never restate the full-scope floor.  
5. Budget below scoped price, first time → empathize once + DOWNSCOPE/approval option.  
6. Repeated haggling (≥3 counters) or abusive → HOLD_VALUE + ESCALATE_PROVIDER.  
7. Cross-jurisdiction conflict without matching evidence → abstain/handoff.

### 5.2 Jev advisory **[target for DM]**

Call `requestCompanionJev(DecisionState)` → posture choice + sufficient/conflict/handoff/market (+ optional emotion) + `negotiation_posture` (pruned set, bucket inputs only, never cents).

Merge:

```
final_posture = deterministic_override(jev.posture)
if jev.needsHandoff || !jev.sufficient → bias ABSTAIN/ESCALATE
if pricing.status == ready && client wants buy → COMMERCE allowed
if scope narrowed || counter → NEGOTIATE; action = jev.negotiation_posture ∈ eligibleActions else deterministic default
numbers = finalizeNumbers(action)   // round $5, clamp ≥ scopedFloor & ≤ budget, monotonic, max 2 concessions
```

**Inject into system prompt:**

```
# DECISION AUTHORITY — SERVER
posture: EDUCATE
reasons: orientation_query; evidence_confidence=0.81; emotion=calm
commerce: blocked_until_orientation_complete
escalate: false
```

**Output:** `CompanionDecision`.

---

## 6. Draft **[exists]**

Grok (primary) with:

- Legal-buddy `SYSTEM_PROMPT` (PR #391 substance-before-sales)
- Site pack + legal evidence + negotiation state (approved numbers only) + memory + decision authority
- JSON only: `{ reply, escalate, offer|null }`

**Output:** `GrokDecision` (raw).

---

## 7. Grammar / Positioning polish **[target]**

Pass over `reply` (rules first; optional short model polish):

| Check | Action |
|---|---|
| Template / robotic openers | Rewrite for natural voice |
| Floor / band / mean / % / “revenue-safe” leak | Regenerate once, then safe template built from approved number |
| Stale number (any $ not in allowed set) | Regenerate once, then safe template built from approved number |
| Reduced-price reply missing “what’s included” | Append `includes[]` bullets |
| Posture mismatch (budget ask on EDUCATE) | Strip budget ask; keep substance |
| Duplicate of prior AI | Force escalate handoff reply |
| Harsh tone under high emotion | Soften; add acknowledgment of their story |
| Grammar / clarity (ESL-friendly) | Fix run-ons; keep dignity; no baby-talk |
| Length | Cap; prefer 1–2 questions max |

**Output:** `PolishedDecision`.

---

## 8. Safety / Authority **[exists + PR #391]**

1. `guardMessengerOffer` for any proposed offer. With a negotiation arg it validates vs the **scoped floor**, and an approval token is required below the band.  
2. Budget-loop policy (empathize once with downscope/approval option; then escalate; never duplicate).  
3. `leaksInternalFloorLanguage` scrub.  
4. YMYL: if escalate required, ensure reply explains human handoff without practicing law.  
5. Offer creation only when posture allows + scope clear + price = server-approved number (ACCEPT/MEET_MIDDLE/DOWNSCOPE) or provider-approved.

**Output:** `SendPlan` `{ kind: 'reply'|'escalate'|'support'|'offer+reply', text, offer? }`.

---

## 9. Send / Escalate **[exists]**

- Insert AI message (provider sender id, `ai_generated` metadata).  
- If escalate: set attention flags; **do not** silent-pause forever (see `messengerEscalationPolicy`).  
- If offer approved: create offer + memory update (`quotes_made`, `concessions_used`, `scope_current`).  
- If ESCALATE_PROVIDER for pricing: set `ai_pricing_approval_pending` + provider notification.  
- Notify provider attention path when needed.

Inactive / placeholder provider accounts: still escalate + keep client informed; product may later re-route to another provider in the same category.

---

## 10. Learn (async) **[target]**

Persist `DecisionRecord`:

- turn id, posture, Jev answers + confidence, triggers  
- evidence ids / urls  
- safety reasons  
- sent text hash (not raw PII beyond existing thread storage)  
- outcome hooks later (provider reply latency, order created, client exit)

Feed offline eval + regression pack (PRICING-ADAPTIVE §5 fixtures + companion fixtures). Promote configs via human review only.

---

## Positioning cheat-sheet (when to do what)

| Client signal | Posture |
|---|---|
| “What are my options / going rates / how do I start?” | **EDUCATE** first; commerce later |
| Rich story, low clarity on jurisdiction | **DISCOVER** (≤2 questions) |
| Fear, “no help”, “another AI”, money cynicism | **EMPATHIZE** + **ESCALATE_PROVIDER** |
| Clear buy intent + budget | **COMMERCE** under pricing authority |
| “Just the 8 pages” / “only review it” / “shorter version” / “I’ll do the legwork” | **NEGOTIATE** → scoped re-quote |
| “Would you do $X?” / “Can you go lower?” | **NEGOTIATE** → accept / meet / downscope / escalate per band |
| Court/removal/criminal strategy / odds | **ESCALATE_PROVIDER** (no DIY strategy) |
| Refund / ban / escrow dispute | **HANDOFF_SUPPORT** |
| Thin evidence | **ABSTAIN** + honesty + optional provider |

---

## Regression fixtures (expected pipeline behavior; system-wide)

Fixtures are generic. The 2026-10-05 low-budget DM incident is **one** fixture (F1) among several.

1. **F1 Immigration orientation, low budget:** rich relocation/PR story → **EDUCATE** with grounded evidence. "Going rates?" → human terms, no floor dump. "$50 to $100 for a consult, I'll do the legwork" → budget parsed as 50–100, scope = consult+self-serve → scoped re-quote or downscope/approval. Frustration → single compassionate escalate. Never a blended full-scope figure, never a repeat.
2. **F2 Proofreading per page:** 20→8 pages → unit re-quote.
3. **F3 Form review vs full prep:** "already filled it out" → review tier.
4. **F4 Essay word count:** 1,000→500 words → halved, floored.
5. **F5 Partial packet review:** only the cover letter → partial/pro-rata.
6. **N1–N7 negotiation:** 8% counter accepted; 13% → midpoint; 50% → downscope; 3 counters → escalate; abusive → hold; provider flex 0 / 25% respected.

---

## Latency budgets (companion DM, proposed)

| Stage | Budget |
|---|---|
| Evidence (KB) | ≤1.2s (align public YQAA) |
| Web research (optional) | ≤2.5s hard fail-soft |
| Adaptive pricing (pure fns; gig/pref loads parallel with pricing authority) | ≤0.3s |
| Jev | ≤1.4s (posture + negotiation_posture in one call) |
| Grok draft | ≤11s (existing) |
| Polish | ≤1.5s rules-only preferred |
| **Total p95 target** | ≤15s with typing bubble |

Prefer parallelizing evidence + memory; Jev after evidence; polish rules-only on critical path.
