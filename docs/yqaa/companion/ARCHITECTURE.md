# YQAA Legal Companion Architecture

**Status:** Research/planning only (2026-10-06 ET, revised same day for system-wide scope + adaptive pricing). No implementation in this packet.  
**Audience:** CoS + Freebuff (YouSafe Bridge on Mac).  
**Scope:** **System-wide**: every provider, every gig/category, every YQAA surface (provider DMs, public chat, AI offers, support handoff). Nothing is provider- or practice-area-specific; past incidents are regression fixtures only.  
**Grounding:** portal `main` @ `471d6b2` (PR **#391** merged: empathy + DM evidence v0 + budget-loop harden); 2026-10-05 low-budget DM incident (fixture F1); public-chat Jev plane (`lib/jevAdvisory.ts`); TypeSafe SystemOne (`jev-latest`); pricing code `lib/messengerPricingAuthority.ts`. Companion pricing design: **`PRICING-ADAPTIVE.md`**.

---

## 1. Product intent

YQAA (**YouSafe Quick Assistance Agent**) is a **human legal companion** for immigrants and international students — US-focused YMYL, multi-market aware (US/UK/CA/AU). It:

- Helps seekers feel oriented across a vast immigration journey (options maps, docs to gather, realistic next steps).
- Speaks with **compassion and natural grammar**, not template sales.
- Positions correctly: **educate → discover → offer → escalate → hand to licensed provider**.
- Never practices law; never guarantees outcomes; never impersonates providers (every provider is a human professional; YQAA is disclosed AI on their thread).
- **Prices fairly and adaptively**: re-quotes when the client narrows scope, flexes within a provider-configured band on reasonable counters, offers smaller scopes or provider review below the band, and never leaks internal numbers (see `PRICING-ADAPTIVE.md`).

PR #391 (merged) is the **baseline fix**: stop budget-template loops, substance-first prompt, DM evidence. This architecture is the **full recursive companion** beyond that patch, and it applies the same way to every provider and surface.

---

## 2. Layered architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ L0  Surface / Channel                                             │
│     Provider DM (messengerAi) │ Public chat (/api/chat) │ Support │
├─────────────────────────────────────────────────────────────────┤
│ L1  Intake & Turn Envelope                                        │
│     message, actor role, ai_mode, attachments, locale, channel    │
├─────────────────────────────────────────────────────────────────┤
│ L2  Context Graph (memory + journey)                              │
│     grounded memory, journey stage, emotion, seeker↔provider      │
├─────────────────────────────────────────────────────────────────┤
│ L3  Evidence Plane                                                │
│     site KB │ YQAA knowledge index │ live web (gov) │ provider gigs│
├─────────────────────────────────────────────────────────────────┤
│ L4  Decision Plane — Jev (TypeSafe SystemOne) + deterministic     │
│     posture choice, YMYL gates, escalate/abstain, commerce gate,  │
│     ADAPTIVE PRICING: scope re-quote, flex band, negotiation      │
├─────────────────────────────────────────────────────────────────┤
│ L5  Draft Generation (Grok primary; optional DeepSeek fallback)   │
│     JSON decision {reply, escalate, offer?}                       │
├─────────────────────────────────────────────────────────────────┤
│ L6  Polish — Grammar / Positioning                                │
│     natural phrasing, anti-template, anti-duplicate, tone fit     │
├─────────────────────────────────────────────────────────────────┤
│ L7  Safety & Authority Guards                                     │
│     offer guard (scoped floor), leak + stale-number scrub, UPL    │
├─────────────────────────────────────────────────────────────────┤
│ L8  Actuation                                                     │
│     send reply │ escalate to provider │ support handoff │ offer   │
├─────────────────────────────────────────────────────────────────┤
│ L9  Learning Loop (recursive, versioned, offline-first)           │
│     outcomes → labels → rubrics/thresholds → shadow → promote     │
└─────────────────────────────────────────────────────────────────┘
```

**Invariant (from Content Studio / TypeSafe doctrine):**  
*Similarity discovers. Evidence substantiates. Ownership governs. **Jev recommends. Policy authorizes.** Humans review consequential legal judgment.*

Jev **never** writes client prose, never overrides deterministic safety, never clears a YMYL gate with high probability alone.

---

## 3. What exists today (ground truth)

| Capability | Public `/api/chat` | Provider DM `messengerAi` |
|---|---|---|
| SuperGrok draft | ✅ `generateYqaaAnswer` | ✅ `maybeAutoReply` |
| Curated messenger KB | partial (central assistant) | ✅ `content/messenger-kb/*` |
| YQAA knowledge index + web evidence | ✅ ladder + 2nd Jev pass | ✅ in PR #391 via `loadMessengerLegalEvidence` |
| **Jev advisory** (`requestJevAdvisory`) | ✅ wired | ❌ **not wired** (gap) |
| Pricing authority / offer guard | n/a | ✅ `messengerPricingAuthority` (**scope-blind**: blended all-tier category mean × 0.85; binary guard) |
| Budget-loop harden | n/a | ✅ PR #391 (empathize once, frustration/duplicate → escalate) |
| Scope re-quote / negotiation / flex band | n/a (no pricing in public chat) | ❌ **target** (`PRICING-ADAPTIVE.md`) |
| Range-aware budget + counter memory | n/a | ❌ ("$X to Y" drops upper bound; memory keeps latest budget + one offer) |
| Journey / emotion model | ❌ | ❌ (memory has markets/docs/budget only) |
| Grammar polish stage | ❌ (prompt-only) | ❌ (prompt-only) |
| Recursive learning store | ❌ | ❌ |

**Jev (found):** TypeSafe **SystemOne** model `jev-latest` (pinned responses like `jev-1.13.0`). Endpoint `POST https://api.typesafe.ai/v1/systemone` with typed questions (`noul` / `choice` / `score`). Portal adapter: `lib/jevAdvisory.ts`. Auth: server-only `TYPESAFE_API_KEY`. Instructions today: *bounded advisory on public evidence only; do not draft visitor answers or override safety policy.*

Triggers today: `ambiguous | conflicting_evidence | low_evidence | high_stakes | cross_jurisdiction`.  
Advisory fields: `sufficient`, `confidence`, `conflict`, `needsHandoff`, `market`.  
Safety: `applyYqaaSafetyPolicy` — deterministic first; Jev unavailable → handoff when triggers remain.

---

## 4. Target companion components

### 4.1 Context Graph (`YqaaContextGraph`)

Extends `YqaaConversationMemory` (grounded, client-authored facts only):

| Node / field | Purpose |
|---|---|
| `role_frame` | `seeker` \| `provider_human` \| `admin` \| `support` |
| `journey_stage` | `orienting` \| `pathway_map` \| `docs_gather` \| `consult_ready` \| `commerce` \| `post_offer` \| `crisis` \| `exit_risk` |
| `emotion` | bounded score via Jev `score` (calm→distressed); never invent clinical diagnoses |
| `matter` | jurisdiction, pathway hypotheses, deadlines, docs |
| `thread_commitments` | what YQAA already promised / already explained (anti-repeat) |
| `provider_attention` | existing escalation policy |
| `budget` | existing BudgetEvidence (server-side; **never** leak floors), now range-aware |
| `negotiation` | scope_current/history, client_counters, quotes_made, concessions_used, approval (see PRICING-ADAPTIVE §3.7). Prevents stale numbers |

**Write rules:** only deterministic extracts + optional Jev *classification* over redacted state. No free-form LLM “summary as fact.”

### 4.2 Positioning policy (`YqaaPosture`)

Deterministic policy + Jev `choice` over **already-eligible** postures:

| Posture | When |
|---|---|
| `EDUCATE` | Orientation / options / going-rates / how-do-I-start; substance before budget |
| `DISCOVER` | Need 1–2 clarifying facts (jurisdiction, deadline, docs) |
| `EMPATHIZE` | Frustration, fear, exit language |
| `COMMERCE` | Client wants paid help / offer; budget known or naturally asked |
| `NEGOTIATE` | Client narrowed scope or countered; sub-action ∈ ACCEPT / MEET_MIDDLE / DOWNSCOPE / HOLD_VALUE / ESCALATE_PROVIDER, pruned by flex policy |
| `ESCALATE_PROVIDER` | High-stakes, UPL risk, budget deadlock, frustration, licensed judgment |
| `HANDOFF_SUPPORT` | Platform/refund/account issues → support.yousafeconsultancy.com |
| `ABSTAIN` | Thin evidence; say so; invite provider or safe DIY public links |

Forbidden postures are **removed from the choice set**, not down-weighted (TypeSafe doctrine).

### 4.3 Decision Plane — Jev in the loop

Extend messenger + public chat to share one **Decision Adapter**:

```ts
// Conceptual interface (implement later on Mac)
type CompanionDecisionState = {
  channel: 'dm' | 'public' | 'support'
  redacted_query: string
  role_frame: 'seeker' | ...
  journey_stage: string
  emotion_hint?: number
  evidence_digest: { id; title; url; jurisdiction; excerpt }[]  // ≤12, ≤600 chars
  prior_posture?: string
  budget_status?: 'none' | 'need_budget' | 'budget_too_low' | 'ready'
  scope_depth?: 'consult' | 'review' | 'partial' | 'full' | 'unknown'
  counter_bucket?: 'none' | 'reasonable' | 'reasonable_meet' | 'stretch' | 'lowball' | 'abusive'  // bucket only, no numbers
  counter_count?: number
  frustration?: boolean
  duplicate_risk?: boolean
  triggers: JevTrigger[]
}

type CompanionJevQuestions = {
  posture: Choice<EDUCATE|DISCOVER|EMPATHIZE|COMMERCE|NEGOTIATE|ESCALATE_PROVIDER|HANDOFF_SUPPORT|ABSTAIN>
  negotiation_posture?: Choice<ACCEPT|MEET_MIDDLE|DOWNSCOPE|HOLD_VALUE|ESCALATE_PROVIDER>  // pruned to eligible set; Jev never sees/sets cents
  sufficient: Noul
  conflict: Noul
  needs_handoff: Noul
  market: Choice<usa|canada|uk|australia|global|unknown>
  emotion?: Score  // Calm → Distressed
  grammar_risk?: Noul  // "Would a canned/template reply harm trust here?"
}
```

**Timeout:** keep ≤1400ms for advisory (existing). On timeout: deterministic policy only (budget-loop + adaptive-pricing defaults still apply).

**Messenger wiring (phase 2+):** after evidence load, before Grok draft — call Jev; inject `# DECISION AUTHORITY` block (posture + reasons). Grok must follow posture; server re-checks escalate/commerce.

### 4.4 Evidence Plane

Reuse:

- `loadYqaaEvidence` / knowledge index  
- `researchYqaaPublicWeb` + `buildYqaaLiveResearchContext`  
- `buildMessengerSiteKnowledge` + provider gigs  
- PR #391 `loadMessengerLegalEvidence`

Prefer official gov hosts (USCIS, State, IRCC, GOV.UK, Home Affairs). Fail soft. Never invent statutes/URLs.

### 4.5 Draft + Grammar / Positioning polish

Two-stage (clean separation):

1. **Draft** — Grok produces `{reply, escalate, offer}` under posture + evidence.  
2. **Polish** (lightweight, same model or short second call / rules):
   - Natural phrasing (vary rhythm; ESL-friendly clarity without condescension)
   - Remove template smell / floor leaks (`leaksInternalFloorLanguage`)
   - Anti-duplicate (`isNearDuplicateReply`)
   - Positioning check: if posture=`EDUCATE` but reply opens with budget ask → rewrite or block
   - Compassion check: if emotion high and reply is transactional → rewrite

Optional later: dedicated grammar model only for polish; never for legal content invention.

### 4.6 Safety / YMYL guardrails

Hard rules (server, not prompt-trust):

1. No unauthorized practice of law — educational orientation only.  
2. No outcome odds / guarantees.  
3. No impersonation of provider.  
4. High-stakes (removal, criminal, asylum deadlines, court response strategy) → escalate.  
5. Frustration / duplicate / budget deadlock → escalate (PR #391).  
6. Never leak floors / bands / means / percentages / “revenue-safe”.  
7. **Pricing adapts** (reverses the earlier “pricing math unchanged” rule): scoped re-quote + provider flex band + negotiation; every number is server-authorized; below band → provider approval (`PRICING-ADAPTIVE.md`).  
7a. Stale-number guard: replies may only contain the current approved quote, the client’s own figures, or public tier list prices.  
8. Off-platform contact / payment solicits blocked.  
9. Jev abstention ≠ silence forever: keep warm, useful, honest about limits (existing provider-attention policy).

### 4.7 Learning / recursion (L9)

**Goal:** recursively improve without online self-modifying policy.

Streams (kept separate):

| Stream | Examples |
|---|---|
| Expert labels | Attorney/consultant marks reply safe/harmful/wrong jurisdiction |
| Acceptance | Client continued / booked / exited; provider takeover quality |
| Incident | Low-budget / loop / leak transcripts (any provider) tagged as regression corpus |
| Negotiation | Counter class, action taken, accepted/declined, provider approval outcome (tunes bands offline only) |
| Calibration | Jev posture vs human gold on held-out cases |

Loop:

1. Log `DecisionRecord` (posture, Jev distribution, evidence ids, safety reason, sent text hash).  
2. Nightly / weekly offline eval on the regression pack (F1–F5, N1–N7…) + stratified sample.  
3. Propose threshold/rubric/prompt version bumps.  
4. **Shadow mode** on production traffic.  
5. Human promote → new config version.  

**Forbidden:** online auto-rewrite of YMYL policy from outcomes; using Jev probability to clear deterministic failures.

### 4.8 Adaptive Pricing & Negotiation (system-wide; full spec `PRICING-ADAPTIVE.md`)

- **Scope re-quote:** detect depth (consult/review/partial/full), units (page/word/document/form/hour/session), and narrowing. Price from the matched provider gig's unit pricing or tier, not the blended category mean.
- **Flex band (gig → provider → platform):** default auto-accept ≤10%, meet-middle ≤15%, approval zone 15–35%, lowball >35% (**pending Sharon confirmation**).
- **Counter classes:** reasonable / reasonable_meet / stretch / lowball / abusive → eligible actions.
- **Jev** picks a negotiation posture from the pruned set; deterministic `finalizeNumbers()` sets every figure (rounded, clamped, monotonic).
- **Memory** tracks scope, range-aware budget, counters, and quotes so no reply repeats a stale number.
- **Tone:** acknowledge the constraint, say what the reduced price includes, give one next step; never mention floors/bands.
- **Surfaces:** DM = full layer; public chat = no offers or negotiation, only public "starting at" prices + DM pointer; provider-authored offers = hint UI (Phase 2).

---

## 5. Data flow (happy path DM)

```
Client message
  → intake (ai_mode=auto?)
  → context graph update (memory + journey + frustration detect)
  → evidence (site + legal KB + optional web)
  → Jev decision (posture, handoff, market, emotion)
  → adaptive pricing (scope signal → scoped quote → flex policy → counter class → eligible actions)
  → deterministic merge (budget-loop rules, pricing/negotiation action, high_stakes)
  → Grok draft (only server-approved numbers in prompt)
  → polish (grammar/positioning/leak scrub/stale-number scrub/anti-dup)
  → offer guard (scoped floor; approval token below band)
  → send OR escalate OR support handoff
  → DecisionRecord + memory persist
```

---

## 6. Tool interfaces (stable contracts)

| Tool | Owner | Contract |
|---|---|---|
| `requestJevAdvisory` / `requestCompanionJev` | `lib/jevAdvisory.ts` (+ companion extension) | TypeSafe SystemOne; redacted state; ≤1.4s |
| `loadYqaaEvidence` | `lib/yqaaKnowledgeDb.ts` | ranked chunks + confidence |
| `researchYqaaPublicWeb` | `lib/yqaaWebResearch.ts` | citation-linked live chunks |
| `buildMessengerPricingAuthority` | `lib/messengerPricingAuthority.ts` | market evidence (blended stats; audit) |
| `buildAdaptivePricingDecision` | `lib/yqaaAdaptivePricing.ts` (new) | scoped quote, flex policy, counter class, eligible actions, approved numbers |
| `guardMessengerOffer` | `messengerPricingAuthority.ts` | ok/block + client-safe reply; validates vs scoped floor when negotiation arg present |
| `buildGroundedConversationMemory` | `lib/messengerConversationMemory.ts` | grounded memory only |
| `generateYqaaAnswer` / Grok DM call | `yqaaGeneration` / messenger | prose draft |
| `escalateToSupport` | support bridge | public/high-stakes handoff |
| Provider attention | `messengerEscalationPolicy.ts` | keep helping while pending |

---

## 7. Failure modes

| Failure | Behavior |
|---|---|
| Jev timeout / not configured | Deterministic policy only; never invent posture from raw Grok |
| Evidence empty | `ABSTAIN` / escalate; no fabricated law |
| Web research fail | Continue with KB; disclose thin evidence |
| Grok timeout | Existing compact recovery / fallback pin; else soft apology + escalate |
| Budget below scoped price | Downscope option or provider approval request; never restate a full-scope floor; never duplicate |
| Client narrows scope after a budget gap | Re-quote the new scope (not escalate-by-default) |
| Repeated haggling / abusive counter | Hold value politely + escalate to provider; no further concessions |
| Inactive / placeholder provider account | Still escalate + support path; don’t silently loop |
| Conflicting gov sources | Preserve both; handoff; Jev cannot pick “correct law” by confidence |
| Learning mis-fire | Shadow only; demote slice on false-safe |

---

## 8. Channel unification strategy

Long-term: one **Companion Orchestrator** shared by public chat and DMs, with channel-specific actuators (offer creation only on DM; support queue on public).

Short-term: keep files, extract shared modules:

- `lib/yqaaCompanionContext.ts`  
- `lib/yqaaCompanionDecision.ts` (Jev + deterministic merge)  
- `lib/yqaaCompanionPolish.ts`  
- Keep `messengerAi.ts` / `app/api/chat/route.ts` as thin adapters.

---

## 9. Unknowns / flags

- Exact TypeSafe account quotas & production `jev-latest` SLA for DM latency budget — **verify** (docs note A0.7 probe).  
- Whether Sharon wants emotion `score` questions live in v1 or shadow-only.  
- Provider-inactive UX (placeholder/inactive provider accounts) — product decision: auto-route to another provider in the same category vs support.  
- Adaptive pricing defaults (bands, concessions, opt-out vs opt-in, platform consult minimum) — **pending Sharon/provider confirmation** (`PRICING-ADAPTIVE.md` §6).
- Mac Bridge was `isolated_candidate` / `mac_path_forbidden` for `/Users` during this research; code grounding used box portal trees + GitHub PR #391 + TypeSafe docs.

---

## 10. Non-goals (this architecture)

- Replacing licensed attorneys.  
- Letting the LLM set or negotiate numbers on its own (server authorizes every figure).  
- Provider-specific or practice-area-specific logic.  
- Browser-side Jev or client-held TypeSafe keys.  
- Auto online policy mutation.  
- Heavy coding in this CoS packet (Freebuff implements via Bridge).
