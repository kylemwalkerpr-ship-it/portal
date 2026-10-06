# YQAA Legal Buddy Harden — notes (2026-10-06)

## Incident
Taylor Springer ↔ Morganne A. Foley (`c8d71ea4-…`). YQAA ignored Beaver Harbor / marriage-path context, budget-interrogated, then server-overwrote every turn with identical `lowBudgetReply` leaking ~$812 mean / ~$690 “revenue-safe” floor — including after frustration (“stops at the buck”).

## Fixes
1. **Legal-buddy SYSTEM_PROMPT** (`lib/messengerAi.ts`): substance before sales; empathy; YMYL educational orientation; no floor leaks; escalate on frustration/exit.
2. **Client-facing pricing copy** (`lib/messengerPricingAuthority.ts`): `lowBudgetReply` empathizes once without floors; `lowBudgetEscalationReply` for handoff; frustration/duplicate helpers; pricing-authority instructions forbid quoting floors/means.
3. **Overwrite policy**: first `budget_too_low` may use empathetic template; already-explained / frustrated / near-duplicate → escalate, never loop Foley-style.
4. **Vast grounded knowledge on DMs**: `loadMessengerLegalEvidence` pulls `loadYqaaEvidence` (+ optional `researchYqaaPublicWeb`) into `## GROUNDED LEGAL / PUBLIC EVIDENCE` for orientation inquiries (immigration and broader legal keywords). Fail soft.
5. **Tests**: `tests/messenger-pricing-authority.test.ts` + `tests/messenger-yqaa-legal-buddy.test.ts` (25 passing).

## Non-goals / still true
- Pricing math floors unchanged (server still guards offers).
- YQAA is not a licensed attorney; high-risk matters escalate to the provider.
- Deploy + live retest of the Foley thread still pending after merge.
