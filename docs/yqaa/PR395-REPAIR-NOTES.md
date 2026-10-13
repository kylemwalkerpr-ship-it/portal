# YQAA PR395 candidate repair

Candidate: `a6da10f3`.

## Changes

- The parsed model response now inherits any `companion.escalate` requirement and drops its offer. Missing legal/public evidence and Jev's insufficient-evidence or handoff verdict produce a provider handoff with a deterministic, evidence-safe reply.
- Jev receives the retrieved legal/public evidence chunks used by the prompt. Legal-orientation turns with no retrieved source fail closed to the provider; non-legal commerce turns do not inherit an irrelevant evidence-insufficient verdict.
- Number finalization checks the current scope floor after the same-scope monotonic ceiling. A conflict returns no price and escalates. The guard ignores generated approval tokens, and the adaptive decision carries its internal approved-scope floor separately for downscope offers.
- YQAA offers use a key derived from the conversation and triggering client message. A partial unique index is the atomic cross-worker race boundary; a lookup is only a retry fast path.

## Required database migration

`supabase/migrations/20261013120000_yqaa_offer_idempotency.sql` adds the nullable `offers.yqaa_idempotency_key` column and partial unique index, a service-only durable trigger ledger, and `commit_yqaa_reply`. The RPC verifies the service role, conversation participants, client trigger ownership/currentness, offer sender/recipient, inquiry ownership, and gig ownership. A conversation row lock serializes workers. The reply, offer, offer card, attorney inquiry message, audit record, memory, provider-attention/escalation metadata, and trigger ledger commit in one transaction. A retry returns the ledger's original reply and offer IDs. Public and authenticated roles cannot execute the RPC or read the ledger.

The application checks the durable ledger before generation and fails closed if the table is missing. It creates no reply when offer preparation fails; when the RPC fails, PostgreSQL rolls back both reply and offer effects. This makes deployment safe before the migration, while the migration remains a prerequisite for YQAA replies to resume.

The migration is **not applied** by this repair. Apply it only through the repository's normal migration/release process. No production database was modified.

## Concurrent database test

`node scripts/test-yqaa-atomic-idempotency.mjs` runs two independent `psql` processes concurrently against the RPC, checks that only one reply/offer/card/commit exists and that memory/provider-attention state is durable, verifies rollback when offer validation fails, and confirms `authenticated` cannot execute the RPC. It applies the migration only to the configured isolated local database. Set `YQAA_TEST_DATABASE_URL` to a loopback PostgreSQL URL whose database name contains `test`, `local`, or `yqaa`; the script rejects other hosts and database names and cleans up its fixtures.

Provider approval is not currently represented by an approval record or endpoint in this phase. The generated pricing token was therefore removed as an authorization signal; below-floor offers remain blocked and require provider review.

## Verification evidence

Completed in this repair:

- Full Jest: **571 suites passed, 2 skipped; 6,388 tests passed, 4 skipped**.
- TypeScript: `npx tsc --noEmit` passed.
- Migration policy: `node scripts/migration-ledger-policy.mjs --check` passed (69 files; manifest, naming, transaction safety).
- Script syntax and whitespace: `node --check scripts/test-yqaa-atomic-idempotency.mjs` and `git diff --check` passed.
- Concurrent PostgreSQL integration: **passed** on isolated PostgreSQL 16 with a minimal schema fixture. Two real concurrent processes share one durable reply/offer, invalid offer rollback and authenticated-role denial passed. This verifies RPC transactional behavior, not full production-schema parity.
- Jev route/gate could not run because `jevctl` reported that the TypeSafe API key was unavailable; no credential value was accessed or printed.
