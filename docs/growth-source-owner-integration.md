# Sender and commerce integration — 17 October 2026

## Current state

Source implemented; not deployed or live-verified. No outreach, checkout, payments, migrations, worker restarts, or provider purchases were performed by this integration work.

Portal owns commerce. The runtime projects each request onto a policy-bound tenant/campaign/gig contract. The Portal route authenticates a dedicated Bearer token, validates its hash, deadline and idempotency binding, and reads only bounded explicit columns with service-role database access. It emits hashed order references and net amounts in original currency, without buyer/order identifiers or free-form metadata. Trusted paid events must reconcile with current order rows and valid granted-consent sessions. Cancellation removes receipts. Refunds reduce net revenue; incomplete/conflicting refund evidence returns UNKNOWN. A complete later snapshot replaces earlier net state so refunded orders cannot reappear through history union.

The versioned Portal contract contains all six offers and the three primary priorities. Run static drift/readiness checks from the runtime checkout:

```sh
python -m ygi.pilot owner-readiness --config config.acquisition.offers.json --selection-config config.acquisition.selection.json --contract-manifest ../portal-worktrees/growth-owner-adapters-20261017/contracts/yousafe-acquisition-offers.v1.json
```

Use the actual absolute manifest path if these worktrees are not siblings. Exit 2 is expected until endpoints are independently verified. The mapping contract passes; endpoint state is intentionally NOT_READY.

## Live activation remaining

1. Review and merge Portal through its normal PR process. GitHub Actions run 39015649186 was blocked before execution by an account billing lock. No Actions pass or deployment is claimed. Any temporary release exception must satisfy its current authorization, exact-main build, independent review, secret and rollback requirements.
2. Provision dedicated `YOUSAFE_GROWTH_SOURCE_OWNER_TOKEN` in the approved secret stores, then release through the authorized workflow. The deployment workflow now passes it to the existing atomic Worker secret synchronizer; missing values preserve existing secrets. The route stays unavailable when its own token is absent. Never reuse the payment, database or cron secret for this adapter.
3. Verify the actual Portal `/api/internal/source-owner/commerce` endpoint with unauthorized, wrong-scope, expired and valid read-only requests. Verify database access and complete empty versus failed/partial snapshots independently. Supply runtime `YOUSAFE_GROWTH_SOURCE_OWNER_URL` and token reference, recording real release and endpoint evidence before setting verified configuration flags. Never mark source code as a verified endpoint.
4. Recover the live sender host and its current owner API. The local `bo-desk` copy is historical evidence only; old `/workspace/backlink-desk` and Typesense directories are absent on this Mac. Do not execute its send scripts or create another sender. Require fresh fenced authority, global suppression, sender suppression, approval, source evidence, a maximum two sends/hour and a minimum 1800-second gap. Unknown SMTP results must not be retried blindly.
5. Sender admission and reconciliation require authenticated fresh receipts. Admission carries draft/evidence hashes only and remains `ADMITTED_DRAFT_ONLY`; runtime dispatch stays disabled. This change does not implement recipient sending.
6. `lead_created` is not a qualification outcome. Qualified conversations remain UNKNOWN until the actual source owner has a dedicated qualification schema and verified interface.

The active runtime policies and existing workers were not replaced or restarted. Local state and historical evidence remain owned by the existing execution ledger.

## Validation

Focused Portal regression tests cover authentication, tenant/campaign/gig binding, hashing, expiry, consent, duplicate events, refund/cancellation reconciliation, missing order truth, pagination, zero snapshots, and PII stripping. Runtime tests cover owner readiness, draft hashing, sender controls and stale/uncertain receipts, currency preservation and authoritative snapshot replacement. Final counts are recorded in the PR/checkpoint. No large dependency install or production build was attempted on the space-constrained Mac.
