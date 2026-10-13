# Full YQAA Phase 3–4 packet

## Implemented contract

- The public chat and provider DM retain their existing identity, evidence, pricing, and escalation authorities. A thin public safety adapter and the existing DM deterministic orchestrator produce the same versioned `yqaa_decision_records` shape; the public adapter cannot authorize DM pricing or clear public safety policy.
- Records contain channel, posture, negotiation action, bounded reason codes, pseudonymous SHA-256 evidence hashes, rubric/policy versions, and a SHA-256 interaction reference. These hashes are deterministic and dictionary-linkable; they are pseudonymous references, not anonymous identifiers. Provider/category identifiers are omitted because stable unkeyed hashes would be dictionary-linkable. Records contain no visitor text, contact data, prompt, response, evidence excerpt, or unhashed evidence identifier. Inserts are best effort and service-role only.
- The initial rubric is shadow-only. The offline evaluator reads an explicitly reviewed gold set, reports false-safe/false-unsafe counts by channel, risk/evidence/commerce slice, hashed provider, and hashed category, and holds calibration if any false-safe exists or a stratum is under-sampled. It can produce a proposal record only; it cannot write runtime policy.
- Public `/api/chat` has a 42-second end-to-end deadline, propagated to Supabase and model/web fetches where supported. Deadline expiry returns an honest 504 retry response. Greeting fast replies stay on their deterministic fast path.
- The DM AI-reply endpoint emits a `Server-Timing: dm` duration. No external acceptance signal is inferred from a reply, click, or offer.

## Evaluation and promotion

Run `node scripts/evaluate-yqaa-goldset.mjs [path-to-reviewed-gold-set.json]`. The checked-in gold set is deliberately empty until qualified human labels are supplied. Synthetic unit cases test metric behavior but are not gold labels. Any false-safe result holds the proposal. A clean result still requires human review and a separately reviewed policy/config change; no code path promotes a rubric or rewrites online policy.

The evaluator counts only labels with `labelSource: "licensed_expert"`, a non-empty `expertQualification`, a non-empty `rubricVersion`, and non-empty `provenance`. Malformed or unqualified labels do not count. Optional provider/category strata are supported only when supplied in the offline gold set; they are not persisted in decision telemetry. Expert dual-labeling on critical YMYL examples is still required.

## Acceptance still required outside this packet

- Qualified US YMYL counsel review of disclosure and escalation copy.
- Licensed-expert dual labels for critical legal cases and reviewer-approved labels for remaining strata.
- External DM/provider acceptance and outcome integration. No live DM acceptance, provider quality, or counsel review has been claimed or fabricated here.
- Any human promotion must be a reviewed, versioned repository change. There is no existing YQAA calibration UI or reviewer workflow to reuse; a new admin surface is deferred until a real label/approval process exists.

## Boundaries

No odds, legal conclusions, fabricated counsel review, online policy rewrite, migration application, deployment, or production writes are part of this packet.
