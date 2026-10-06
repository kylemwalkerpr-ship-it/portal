# YQAA Legal Companion — Planning Pack

Written 2026-10-06 ET by CoS research/planning executor. **Docs only** — implementation via Freebuff/Bridge on Mac.

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Layers, Jev, data flow, failure modes, YMYL, learning |
| `PIPELINE.md` | Turn pipeline intake → send/escalate |
| `ROADMAP.md` | Phases after PR #391; Freebuff priority; test plan |
| `BRIEF-FOR-BRIDGE.md` | Self-contained Freebuff Phase 1 task brief (now includes adaptive pricing) |
| `PRICING-ADAPTIVE.md` | System-wide adaptive pricing / negotiation design, DB additions, tests, defaults to confirm |

Scope: **system-wide** (all providers, gigs, categories, surfaces). Revised 2026-10-06 ET: adaptive pricing added; the "no pricing-math changes" rule is reversed.

Grounding: portal `main` @ `471d6b2` (`lib/messengerPricingAuthority.ts`, `lib/messengerAi.ts`, `lib/messengerConversationMemory.ts`, `supabase/fiverr_gig_system.sql`), 2026-10-05 low-budget incident notes (box `/workspace/yqaa-foley-investigation.md`, used as fixture F1 only), `lib/jevAdvisory.ts`, TypeSafe SystemOne docs.
