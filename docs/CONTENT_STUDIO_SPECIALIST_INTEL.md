# Content Studio — Specialist Intel (SSOT)

> CoS charter 2026-09-06. Fold YouSafe specialist **roles** into Content Studio as durable feeds. Grok Bots stay lean/supervisory; heavy code via OpenCode Deepseek (+ Codex/Grok supervise). PAIN is out of scope.

Live Studio: https://portal.yousafeconsultancy.com/dashboard/admin/content

## Role → stage map

| Role | Bot (idle unless directed) | Studio stage(s) | What it contributes |
|------|----------------------------|-----------------|---------------------|
| Policy Desk | Policy Desk | Discover, Research | Overnight policy moves → same-day cash-cow SERP work |
| Competitor Radar | Competitor Radar | Discover, Research, competitiveGap | Competitor deltas vs Boundless/CitizenPath/etc. |
| Overnight Ops | Overnight Ops | Track, Configure, site-health | Host/GSC/GA health + tomorrow’s 3 ranking priorities |
| Authority Multiplexer | Authority Multiplexer | Approve→Shop SEO | Repurpose pack from shipped pillars (no auto-post) |
| Support Triage | Support Triage | Discover, opportunities | Support patterns → content gap topics |
| Marketplace Scout | Marketplace Scout | Shop SEO | `supply_first` category gaps blocking market SEO |
| Lead Desk | Lead Desk | Shop SEO | Soft ICP demand tags on cash-cow intents |
| web master seo | web master seo | Conductor (outside code) | Ranking agenda / FreeBuff briefs |
| senior supervisor | senior supervisor on my SEO engine | Path-to-100 ops | E2E Studio health, Approve/ship verify |
| PAIN | Pain Project Supervisor | **Excluded** | Separate project — never mix |

## Signal contract (POST `/api/content-studio/specialist-signals`)

```json
{
  "role": "policy_desk|competitor_radar|overnight_ops|authority_multiplexer|support_triage|marketplace_scout|lead_desk",
  "region": "US|UK|CA|AU|null",
  "priority": 1,
  "payload": {},
  "relatedJobId": null
}
```

### Payload shapes

**policy_desk:** `{ "title", "sourceUrl", "summary", "cashCowIntents": [], "urgency": "low|med|high" }`

**competitor_radar:** `{ "competitor", "changeType", "url", "cashCowImplication", "whatItMeansForYouSafe" }`

**overnight_ops:** `{ "hostHealth": [], "gscGaAnomalies": [], "rankingPriorities": ["","",""], "worktreeWarnings": [] }`

**authority_multiplexer:** `{ "sourceUrl", "xPosts": [], "threadOutline": [], "videoHooks": [], "newsletterIntro": "", "leadHook": "" }`

**support_triage:** `{ "category", "pattern", "suggestedOwnerTopic", "evidence" }`

**marketplace_scout:** `{ "category", "supplyCountSignal", "priorityReason" }`

**lead_desk:** `{ "intent", "leadScoreHint": 1-5, "reason" }`

Statuses: `new` → `queued` → `consumed` | `dismissed`.

## Engine wiring

- Open high-priority signals matching region/intent fold into `masterEngineFeed` promptBlock.
- War-room / opportunity queue may surface queued Policy + Competitor + Support signals.
- Approve/ship enqueues Authority Multiplexer `repurpose_pack` (never external send).

## Bot operating rule

Specialists stay dull by default. When they produce a brief, they POST one lean JSON signal (or CoS/senior supervisor ingests). No FreeBuff worktree edits from specialist bots.

---

## DONE (2026-09-06) — Specialist Intel feeds landed

**DONE.** OpenCode Deepseek implemented the Specialist Intel feed stack in `yousafe-portal`.

**Files touched**
1. `supabase/migrations/studio_specialist_signals.sql` — table + (status, priority, created_at desc) + (role, status) indexes + open RLS.
2. `lib/seoFactory/specialistFeeds.ts` — role enum, per-role payload validators, `insertSignal` / `listSignals` / `setSignalStatus` / `enqueueAuthorityMultiplexerSignal` / `loadOpenSignalsForTopic`, `buildSpecialistPromptBlock`, `signalsToOpportunityHints` (all fail-open).
3. `app/api/content-studio/specialist-signals/route.ts` — GET list (status/role/region filters) · POST ingest (validated, admin) · PATCH `{ id, status: queued|consumed|dismissed }` — all `requireAdminUser`.
4. `lib/seoFactory/masterEngineFeed.ts` — open high-priority signals matching topic/region fold into `promptBlock` via `buildSpecialistPromptBlock` (fail-open; surfaced in lineage `specialistSignals`).
5. `components/design/admin-specialist-intel.tsx` + `components/design/admin-content-studio.tsx` — minimal "Specialist Intel" panel in the Configure stage (Row 6): list open signals, QUEUE / DISMISS via API, studio design tokens.
6. `app/api/content-studio/jobs/route.ts` — Authority Multiplexer hook: `enqueueRepurposeHook` enqueues `authority_multiplexer` `{ sourceUrl, relatedJobId }` on approve/ship success (PATCH approve direct-ship, PATCH approve merge-fallback, PATCH merge_pr, POST bulk_approve). Repurpose generator is a stub marker; no external sends.
7. `tests/specialist-feeds.test.ts` — 25 tests (validators, prompt block, hints, queue door via mocked Supabase, Authority hook). Passing.

**Blockers / notes**
- Run `studio_specialist_signals.sql` before live use; the stack is fail-open so the studio works pre-migration (empty feeds).
- Repurpose generation is intentionally a stub (`repurposeGenerator: 'stub'`) — no auto-post, no PAIN.
- No live policy/competitor facts invented; signals carry source URLs for human verification.
- Strategy unchanged: bots stay supervisory, ship stays behind approve/PR gates (invariant I4).
