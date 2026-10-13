# YQAA Legal Companion Architecture

**Status:** Architecture reference for modules shipped on `main` as of 2026-10-13; remaining work is called out explicitly below.
**Audience:** Portal maintainers.
**Scope:** **System-wide**: every provider, every gig/category, every YQAA surface (provider DMs, public chat, AI offers, support handoff). Nothing is provider- or practice-area-specific; past incidents are regression fixtures only.  
**Grounding:** portal `main` @ `79f8008b` plus the companion modules listed below. The 2026-10-05 low-budget DM incident is fixture F1 only. Companion pricing design: **`PRICING-ADAPTIVE.md`**.

---

## 1. Product intent

YQAA (**YouSafe Quick Assistance Agent**) is a **human legal companion** for immigrants and international students — US-focused YMYL, multi-market aware (US/UK/CA/AU). It:

- Helps seekers feel oriented across a vast immigration journey (options maps, docs to gather, realistic next steps).
- Speaks with **compassion and natural grammar**, not template sales.
- Positions correctly: **educate → discover → offer → escalate → hand to licensed provider**.
- Never practices law; never guarantees outcomes; never impersonates providers (every provider is a human professional; YQAA is disclosed AI on their thread).
- **Prices fairly and adaptively**: re-quotes when the client narrows scope, flexes within a provider-configured band on reasonable counters, offers smaller scopes or provider review below the band, and never leaks internal numbers (see `PRICING-ADAPTIVE.md`).

PR #391 established the budget-loop, substance-first, and DM-evidence baseline. The architecture below describes the shipped decision and pricing modules as well as optional and external follow-up work; it is not a claim that counsel review or expert-labelled gold acceptance has happened.

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

The channel boundary is `lib/yqaaDecisionOrchestrator.ts`. `runCompanionOrchestrator` accepts a typed channel and its exact capability set, then delegates to the existing authorities: public safety to `applyYqaaSafetyPolicy`, DM posture/negotiation to `buildCompanionDecision`, and support records to the already-authorized handoff caller. Public and support cannot authorize commerce or negotiation. DM prices and offers remain finalized by the existing server pricing/offer callers. The orchestrator does not add persistence; `lib/yqaaDecisionRecord.ts` remains the record adapter.

| Capability | Public `/api/chat` | Provider DM `messengerAi` |
|---|---|---|
| SuperGrok draft | ✅ `generateYqaaAnswer` | ✅ `maybeAutoReply` |
| Curated messenger KB | partial (central assistant) | ✅ `content/messenger-kb/*` |
| YQAA knowledge index + web evidence | ✅ ladder + 2nd Jev pass | ✅ in PR #391 via `loadMessengerLegalEvidence` |
| **Channel decision entrypoint** | ✅ `runCompanionOrchestrator` | ✅ `runCompanionOrchestrator` |
| Deterministic YMYL/evidence policy | ✅ `applyYqaaSafetyPolicy` | ✅ `buildCompanionDecision` deterministic gates |
| **Jev advisory** | ✅ public evidence ladder | ✅ optional advisory over redacted companion context |
| Pricing / negotiation | n/a; no public offers | ✅ `yqaaAdaptivePricing.ts`, with server-finalized numbers and offer guard |
| Budget-loop and frustration gates | n/a | ✅ `yqaaCompanionDecision.ts` plus messenger authority caller |
| Journey / negotiation memory | n/a | ✅ `messengerConversationMemory.ts` |
| Rules-based grammar / leak / stale-number polish | public guards | ✅ `yqaaCompanionPolish.ts`; a separate polish model is optional |
| Decision records / offline review | ✅ shared versioned records | ✅ shared versioned records; no online policy rewrite |

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

The shared entrypoint is shipped in `lib/yqaaDecisionOrchestrator.ts`. Its inputs are channel-specific, and the supplied capability object must exactly match the channel contract:

```ts
type PublicInput = { channel: 'public'; capabilities: PublicCapabilities; context: JevContext; jev: JevResult }
type DmInput = { channel: 'dm'; capabilities: DmCapabilities; decision: Omit<CompanionDecisionArgs, 'channel'> }
type SupportInput = { channel: 'support'; capabilities: SupportCapabilities; reason: string }

runCompanionOrchestrator(PublicInput | DmInput | SupportInput)
```

For public turns, the entrypoint delegates to `applyYqaaSafetyPolicy` and emits an EDUCATE, ABSTAIN, or handoff record. For DM turns, it delegates to `buildCompanionDecision`; all price and offer amounts remain in the existing server pricing/offer callers. For support turns, it records only the caller's authorized handoff. Public/support capabilities set commerce, DM offers, negotiation, and money authority to false/none; public retains licensed-human handoff capability. Jev timeout uses the existing deterministic fallbacks. The public `/api/chat` total deadline remains 42 seconds.

**Messenger wiring:** after evidence load, before Grok draft, the DM authority calls the shared entrypoint; `# DECISION AUTHORITY` carries posture and reasons. The existing server re-checks escalation, pricing, and offer eligibility.

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

## 5. Data flow (happy path DM; current modules)

```
Client message
  → intake (ai_mode=auto?)
  → context graph update (memory + journey + frustration detect)
  → evidence (site + legal KB + optional web)
  → `runCompanionOrchestrator` → `buildCompanionDecision` (deterministic gates + bounded Jev advisory)
  → `yqaaAdaptivePricing` (scope signal → scoped quote → flex policy → counter class → eligible actions)
  → deterministic merge (budget-loop rules, pricing/negotiation action, high_stakes)
  → Grok draft (only server-approved numbers in prompt)
  → polish (grammar/positioning/leak scrub/stale-number scrub/anti-dup)
  → offer guard (scoped floor; approval token below band)
  → send OR escalate OR support handoff
  → `persistYqaaDecisionRecord` + conversation memory persist
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

## 8. Channel unification status

The shared typed boundary is implemented in `lib/yqaaDecisionOrchestrator.ts`; `app/api/chat/route.ts` and `lib/messengerAi.ts` call it, and public support handoffs record through it after the caller receives a successful handoff. Channel capabilities are checked at runtime as well as constrained by the TypeScript input union. Surface-specific evidence loading, deadlines, offer actuation, and support queue behavior remain in their existing callers.

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
