# YQAA gig scope and unit editor

## Design

Complete the Phase 2 roadmap item in the existing gig wizard. The Pricing step will add optional unit pricing (unit, unit price in cents, included units, minimum units, and base cents) and optional per-tier scope depth and units. Empty values remain `null` so existing gigs continue inheriting current pricing behavior. Use existing design primitives and pricing constants/shapes; no new visual direction.

The existing provider-authenticated gig create/update endpoints will validate and persist the fields. Gig edits require matching provider identity and role/type; admins retain their existing authorized path. Tier scope values use the same ownership guard. Internal hourly-rate values are not part of this editor or any client response. A new additive migration adds columns and database constraints and invalidates pending/approved YQAA approvals after unit/hourly price or tier price/scope context changes. No earlier migration is edited.

## Plan

1. Add focused failing Jest coverage for payload validation, nullable inheritance, owner/role enforcement, and editor/API support; add SQL contract and isolated-Postgres cases for constraints, idempotent migration behavior, and approval invalidation.
2. Implement shared gig/tier pricing-scope validators using the existing YQAA shapes/constants, then wire create/update API paths and role-aware tier ownership checks. Keep `hourly_rate_cents` server-internal.
3. Extend the existing wizard Pricing step and its persisted draft payload with unit pricing and tier scope fields; render currency in dollars while sending/storing integer cents, with clear inherit/optional semantics.
4. Add a new timestamped additive migration only. Constrain JSON unit values and tier scope values; invalidate outstanding approval rows for the affected gig on actual pricing/scope changes.
5. Run focused Jest and isolated PostgreSQL checks, then the full Jest suite, `tsc`, migration ordering/policy, and `git diff --check`. Review scope and evidence, run the requested Jev completion gate if available, then make a local commit only.

## Verification boundaries

- Isolated database: `postgresql://postgres@127.0.0.1:55432/yqaa_test`; never production.
- Do not push, merge, deploy, or mutate a production service.
- `21st` catalog sign-in is unavailable for this task, so use inspected project primitives and document that limitation.
- Internal hourly rate remains absent from the editor payload/response and public surfaces.
