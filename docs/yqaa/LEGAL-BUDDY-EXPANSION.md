# Expansion: Real Legal Buddy (Sharon 2026-10-06)

YQAA must become a **real legal buddy**: vast, grounded knowledge; able to answer inquiries like Taylor→Foley (Beaver Harbor PR, marriage path, cost-effective options) with substance, empathy, and YMYL discipline — not a budget bot.

## Add to current mission (do not drop Foley loop fix)

### A. Knowledge-backed answers on messenger DMs
Today `lib/messengerAi.ts` only injects `buildMessengerSiteKnowledge` + pricing. Wire **legal evidence** for orientation questions:
- Use `loadYqaaEvidence` / `searchYqaaKnowledgeIndex` from `lib/yqaaKnowledgeDb.ts`
- When `yqaaNeedsFreshWebResearch(latestClientText)` from `lib/yqaaWebResearch.ts`, call `researchYqaaPublicWeb` and fold via `buildYqaaLiveResearchContext` / `buildYqaaVerifiedWebDigest` (`lib/yqaaWebEvidence.ts`)
- Append a `## GROUNDED LEGAL / PUBLIC EVIDENCE` block to the system context (sources + short excerpts). Prefer official gov sources (IRCC, USCIS, GOV.UK, etc.) when relevant.
- Fail soft: if evidence fails, continue with site pack; never invent statutes/outcomes.

### B. SYSTEM_PROMPT = Legal Buddy (not sales-first)
Rewrite identity/quality sections so YQAA is:
1. Warm, context-aware legal buddy / marketplace concierge for immigration & adjacent legal orientation.
2. Answers the substance of the inquiry first (options map, what usually matters, what docs to gather, public pathways) using grounded evidence.
3. YMYL: educational orientation only — not a substitute for the licensed provider; no outcome guarantees; escalate high-risk (removal, criminal, asylum deadlines, UPL risk) to provider.
4. Commerce second: budget/offer only when client wants paid help or after useful orientation; never budget-interrogate before answering “what are my options / going rates / how do I start”.
5. Never leak internal floors/means/revenue-safe math.
6. Never duplicate prior YQAA reply; frustration/exit → escalate to live provider with empathy.

### C. Foley overwrite fix (still required)
Keep the budget_too_low overwrite + lowBudgetReply + duplicate/frustration escalation changes from LEGAL-BUDDY-HARDEN-BRIEF.md.

### D. Tests
- Pricing tests: no “revenue-safe offer” client copy; math still guards.
- New tests: evidence appendix builder / frustration detection / duplicate prevention; optional light test that messenger path requests evidence when query looks like legal orientation (mock loadYqaaEvidence).

### E. Docs
Update LEGAL-BUDDY-HARDEN-NOTES.md to cover legal-buddy + evidence wiring.
