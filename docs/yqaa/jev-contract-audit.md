# Jev input contract audit

**Scope:** current TypeSafe/Jev adapter only. This audit records the request/response contract, fixes made in this branch, and candidate follow-up uses. It does not implement a new Jev chain.

## Official contract checked

Checked 2026-10-13 against TypeSafe's [API reference](https://docs.typesafe.ai/api), [question primitives](https://docs.typesafe.ai/primitives), [models](https://docs.typesafe.ai/models), and [confidence guide](https://docs.typesafe.ai/confidence).

- A request is `state`, `model`, and a map of typed `questions`; answer IDs match question keys. IDs are for the client and are not sent to the model. The complete judgment belongs in each question's `instructions`.
- `state` accepts structured objects and is the shared context for all questions. Questions are independent, including when batched. Instructions should name relevant state paths explicitly; one answer does not supply context to another.
- Noul returns `noul`, the probability of yes, with no separate confidence field. This adapter's existing deterministic threshold and evidence-confidence calculation remain unchanged.
- Choice returns `choice`, `probabilities` for the offered options, and `confidence`. Confidence is derived from that distribution and is per question. Choice supports at most 255 options; the request contract needs a real choice set (at least two options), so a zero- or one-option case must be omitted or resolved deterministically in code.
- Score returns a probability-weighted value, `legend`, `probabilities`, and `confidence`; its criteria count is 2–10. Score is not currently used by this adapter.
- The documented standard failures include 401 invalid/missing key, 422 invalid request, 429 rate limit, and 529 overload. Provider error bodies can contain request-specific detail, so this adapter records only finite categories and does not retain or return response bodies.
- Jev 1.13 is a language model with text input. It should be asked for bounded judgments rather than arithmetic, counting, date logic, or complex/adversarial interpretation. Keep exact policy, prices, thresholds, authorization, and final gates deterministic.

## Adapter findings and changes

| Finding | Change in this branch | Status |
| --- | --- | --- |
| Companion payload could send a Choice with a singleton posture option. | Omit the posture question unless there are at least two options; use a sole eligible posture deterministically. Empty lists remain omitted. | Implemented |
| A missing or mistyped answer could be accepted by reading fields without checking each answer's declared primitive type. | Require `type: noul` for Noul answers and validate Choice type, selected option, full offered-option probability distribution, sum, and confidence range. | Implemented |
| Choice confidence and selected probability were discarded. | Preserve both as optional `choiceDiagnostics` for posture, negotiation, and market, without changing the existing Noul-derived `confidence` or any policy threshold. | Implemented |
| The bounded 4 KiB reader could still wait indefinitely if a stream stalled after headers or ignored abort. | Race the complete request and bounded body read against the configured deadline and optional caller `AbortSignal`; cancel through the shared controller. | Implemented |
| The reader did not cancel a stalled stream on abort, and DM entry points did not pass caller cancellation to Jev. | Cancel the active reader on abort and remove abort listeners after completion; thread the optional signal through manual DM replies and scheduled runtime deadlines. | Implemented; rebased on merged PR409, forwarding `opts.runtime?.signal ?? opts.signal` through the decision path. |
| HTTP errors collapsed to `request_failed`, hiding actionable causes. | Return only `http_401`, `http_422`, `http_429`, `http_529`, generic `request_failed`, `network_error`, or `timeout`; no status body or private request data is included. Existing caller reason handling stores only these fixed strings. | Implemented |
| The initial no-counter report was attributed to a singleton negotiation Choice. | The caller filters `QUOTE` from eligible actions before it builds `negotiationOptions`; when that leaves zero actions, the adapter omits `negotiation_posture`. This does not explain the observed `request_failed`. The precise historical live cause is unknown because that attempt did not retain an HTTP category. | Diagnosed; historical cause unconfirmed |

The isolated worker could not access the TypeSafe key. The operator's Keychain-backed service subsequently completed a synthetic four-question live probe on Jev 1.13.0 and returned the documented independently typed answers. That verifies the local provider contract, not the deployed Worker credential path. The new finite diagnostics must identify the actual production failure category without retaining raw provider content.

## Future chain uses (proposals only)

These are prioritized candidates for a separate design and implementation pass. None are implemented by this audit.

1. **Bounded conversation routing:** classify intent, frustration, or whether a turn needs a human using atomic Choice/Noul/Score questions over a compact structured state. Keep allowed actions server-pruned and keep safety/escalation rules deterministic.
2. **Evidence triage:** ask whether evidence supports a general answer and whether sources materially conflict, with instructions pointing at named state fields. Retrieval, citations, jurisdiction matching, and answer authorization remain deterministic.
3. **Negotiation posture:** choose among two or more pre-authorized non-price actions only. Empty options mean no Choice question; one option means deterministic selection. Jev sees no prices, bounds, or currency figures.
4. **Calibration/diagnostics:** retain per-question Choice confidence and probability distributions where permitted, then compare them to outcomes before changing any thresholds. Noul confidence remains the adapter's existing deterministic transform until a separately reviewed design and regression evidence support a policy change.

Avoid using Jev for deterministic counts, arithmetic, date/deadline calculation, exact policy checks, or free-form adversarial text execution. Keep state compact and relevant, name the exact fields each instruction should use, and never treat question IDs as model-visible instructions.
