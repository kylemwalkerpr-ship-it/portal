# YQAA PR395 candidate repair

Candidate: `a6da10f3`.

## Changes

- The parsed model response now inherits any `companion.escalate` requirement and drops its offer. Missing legal/public evidence and Jev's insufficient-evidence or handoff verdict produce a provider handoff with a deterministic, evidence-safe reply.
- Jev receives the retrieved legal/public evidence chunks used by the prompt. Legal-orientation turns with no retrieved source fail closed to the provider; non-legal commerce turns do not inherit an irrelevant evidence-insufficient verdict.
- Number finalization checks the current scope floor after the same-scope monotonic ceiling. A conflict returns no price and escalates. The guard ignores generated approval tokens, and the adaptive decision carries its internal approved-scope floor separately for downscope offers.
- YQAA offers use a key derived from the conversation and triggering client message. A partial unique index is the atomic cross-worker race boundary; a lookup is only a retry fast path.

## Required database migration

`supabase/migrations/20261013120000_yqaa_offer_idempotency.sql` adds the nullable `offers.yqaa_idempotency_key` column and a partial unique index. It is **not applied** by this repair. Apply through the repository's normal migration/release process before enabling the offer code in production. No production database was modified.

Provider approval is not currently represented by an approval record or endpoint in this phase. The generated pricing token was therefore removed as an authorization signal; below-floor offers remain blocked and require provider review.

## Verification evidence

Focused regressions cover companion escalation enforcement, absent/insufficient evidence handoff, floor-vs-monotonic conflicts, ignored generated approval tokens, and trigger-bound idempotency keys. Full Jest and TypeScript results are recorded in the repair report after execution.
