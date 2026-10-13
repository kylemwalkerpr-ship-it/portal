# Full YQAA Phase 3–4 packet

## Implemented contract

- The public chat and provider DM retain their existing identity, evidence, pricing, and escalation authorities. A thin public safety adapter and the existing DM deterministic orchestrator produce the same versioned `yqaa_decision_records` shape; the public adapter cannot authorize DM pricing or clear public safety policy.
- Records contain channel, posture, negotiation action, bounded reason codes, pseudonymous SHA-256 evidence hashes, rubric/policy versions, and a SHA-256 interaction reference. These hashes are deterministic and dictionary-linkable; they are pseudonymous references, not anonymous identifiers. Provider/category identifiers are omitted because stable unkeyed hashes would be dictionary-linkable. Records contain no visitor text, contact data, prompt, response, evidence excerpt, or unhashed evidence identifier. Inserts are best effort and service-role only.
- The initial rubric is shadow-only. The offline evaluator reads an explicitly reviewed gold set, reports false-safe/false-unsafe counts by channel, risk/evidence/commerce slice, hashed provider, and hashed category, and holds calibration if any false-safe exists or a stratum is under-sampled. It can produce a proposal record only; it cannot write runtime policy.
- Public `/api/chat` has a 42-second end-to-end deadline, propagated to Supabase and model/web fetches where supported. Deadline expiry returns an honest 504 retry response. Greeting fast replies stay on their deterministic fast path.
- The DM AI-reply endpoint emits a `Server-Timing: dm` duration. No external acceptance signal is inferred from a reply, click, or offer.

## Phase 3 learning completion packet (2026-10-13)

- `supabase/migrations/20261013200000_yqaa_negotiation_outcomes.sql` adds an idempotent, service-only event table. Its triggers observe only rows in `offers` with a non-null `yqaa_idempotency_key` and changes to `yqaa_pricing_approvals.status`. Each source/state key is unique, so retries and repeated same-state writes do not duplicate events. The stream stores source IDs, state, and time only; it does not copy prices, conversation text, contact data, or transcript URLs. The migration has not been applied.
- `/dashboard/admin/yqaa-learning` reuses the existing admin shell and `requireAdminUser`. `/api/admin/yqaa-learning` returns aggregate offer/approval outcome metrics, the checked-in shadow evaluator HOLD state, and false-safe demotion recommendations. It never reads conversation messages or returns a transcript link. There is no policy update or promotion API.
- The dashboard exports a structured decision metadata review packet and accepts one review submission per authenticated admin and decision record. Qualification is stored as an unverified claim with an opaque provenance reference. Critical status is derived from the decision record; two distinct admin submissions must agree before a case is reported as dual-reviewed. Conflicts and missing second reviews remain held. Intake claims do not enter gold metrics or count as verified licensed-expert labels.
- The offline evaluator rejects high-stakes/critical gold cases unless the reviewed dataset records two distinct reviewer IDs and two non-empty qualification records. This is runtime shape validation; it does not verify a license. A qualified external review process and versioned repository update are still required before any gold labels are used.
- `scripts/test-yqaa-negotiation-outcomes.mjs` is an isolated loopback PostgreSQL integration script. It applies prerequisite migrations plus the new additive migration only to a database whose host is loopback and whose name includes `test`, `local`, or `yqaa`; the migration itself was not run by this implementation task.
- Jest regression coverage checks idempotent metric aggregation, critical dual-review behavior, service-only migration grants, source boundaries, and authenticated/privacy-bounded API contracts.

## Evaluation and promotion

Run `node scripts/evaluate-yqaa-goldset.mjs [path-to-reviewed-gold-set.json]`. The checked-in gold set is deliberately empty until qualified human labels are supplied. Synthetic unit cases test metric behavior but are not gold labels. Any false-safe result holds the proposal. A clean result still requires human review and a separately reviewed policy/config change; no code path promotes a rubric or rewrites online policy.

The evaluator counts only labels with `labelSource: "licensed_expert"`, a non-empty `expertQualification`, a non-empty `rubricVersion`, and non-empty `provenance`. High-stakes/critical cases also require two distinct reviewer IDs and two non-empty reviewer qualification records. These checks validate the data shape; they do not verify credentials. Malformed or unqualified labels do not count. Optional provider/category strata are supported only when supplied in the offline gold set; they are not persisted in decision telemetry.

## Acceptance still required outside this packet

- Qualified US YMYL counsel review of disclosure and escalation copy.
- Licensed-expert dual labels for critical legal cases and reviewer-approved labels for remaining strata.
- Apply the new migration through the approved repository database migration process; execute the isolated PostgreSQL integration script in an authorized local test environment.
- Qualified US YMYL expert labels and external credential verification. The admin intake stores claims only; no licensed-expert qualification or counsel approval is fabricated or accepted as verified.
- External DM/provider acceptance remains unclaimed. Outcomes are offer/approval status events only; replies, clicks, and offer creation do not imply client acceptance.
- Any human promotion must be a separately reviewed, versioned repository change after a fully qualified gold set and critical dual-review evidence are available.

## Boundaries

No odds, legal conclusions, fabricated expert labels/counsel approval, online policy rewrite, migration application, deployment, or production writes are part of this packet. Public runtime behavior and payment behavior remain unchanged.
