# YQAA Legal-Buddy Harden (Foley incident)

## Bug
In `lib/messengerPricingAuthority.ts`, `lowBudgetReply()` is a fixed template leaking “revenue-safe” floors.
In `lib/messengerAi.ts`, when `pricing.status === 'budget_too_low' && !decision.escalate`, the server **overwrites** the model reply with that template every turn → identical loop (Foley/Taylor Oct 5).

## Required behavior (legal buddy)
Warm, context-aware, near-human; grounded in facts; YMYL-safe (no outcome guarantees, no invented law, disclose AI once, escalate when human judgment needed). Engage the client’s story **before** money when they are asking for orientation. Never expose internal floors, means, “revenue-safe”, guard formulas, or fee math. When budget is too low: empathize once, offer narrower scope OR escalate to the live provider — do not loop. Never send a reply body identical to the previous YQAA message. Frustration/exit intent → escalate to provider (set escalate path / provider review), stop the budget lecture.

## Code changes (implement all)
1. `lib/messengerPricingAuthority.ts`
   - Rewrite `lowBudgetReply` to be empathetic, no dollar floor/mean dump, invite narrower scope or provider handoff. No “revenue-safe”.
   - Soften `budgetQuestion` so it is not the first move when the client is seeking orientation (wording only; orchestration stays in messengerAi).
   - Soften `below_guarded_floor` client-facing reply similarly (no “lowest guarded offer $X” if avoidable; keep internal checks).
   - Update pricing-authority prompt text that tells the model to cite floors/means to clients — tell model NEVER to quote internal floors/means; speak in human terms and escalate when stuck.

2. `lib/messengerAi.ts` SYSTEM_PROMPT
   - Add LEGAL BUDDY / CONVERSATION QUALITY rules: lead with acknowledgment of specific facts they shared; substance before budget when they ask “going rates”/insight/options; empathy under frustration; YMYL boundaries; never repeat prior YQAA reply; never invent law; escalate on exit/frustration/low-budget deadlock.

3. `lib/messengerAi.ts` overwrite logic (~budget_too_low block)
   - If previous YQAA body equals `lowBudgetReply` / prior ai reply already explained budget gap → do NOT overwrite again; force escalate (provider handoff) with a short empathetic handoff reply.
   - If latest client text shows frustration/exit (`another AI`, `no help`, `stops at the buck`, `never mind`, etc.) → escalate, do not paste lowBudgetReply.
   - Prefer model reply when it already escalates or already handles low budget empathetically without leaking floors; only use guard reply on first budget_too_low turn.
   - Detect near-duplicate of last AI message → escalate instead of sending duplicate.

4. Tests in `tests/messenger-pricing-authority.test.ts` (+ new `tests/messenger-yqaa-legal-buddy.test.ts` if cleaner)
   - lowBudgetReply must NOT contain “revenue-safe”, must NOT contain the mean/floor dollar amounts as the primary lecture (assert no “revenue-safe”; assert empathy/handoff language).
   - Guard still returns ok:false / budget_too_low for pricing math (server authority unchanged).
   - Unit-test helper for frustration/exit detection and duplicate-reply prevention if extracted.

5. Do NOT change pricing math floors, platform minimums, or offer creation rules — only client-facing copy + overwrite/escalation policy.
6. Do NOT commit secrets. Prefer focused commits. Run: `npx jest tests/messenger-pricing-authority.test.ts` (and new test file). Fix until green.
7. Leave a short `docs/yqaa/LEGAL-BUDDY-HARDEN-NOTES.md` summarizing what changed.

## Out of scope
Admin WhatsApp relay, unrelated messenger CSS, deploying.
