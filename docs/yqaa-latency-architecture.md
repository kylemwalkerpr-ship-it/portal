# YQAA latency architecture

YQAA uses query-aware retrieval so response speed does not come at the expense of grounded YouSafe knowledge.

## Request classes

- **Fast deterministic turns:** trivial greetings and stable company-overview questions are answered from verified, version-controlled facts without invoking the model or the crawled network corpus.
- **Core grounded turns:** generic platform, order, escrow, billing, support, and brand questions use the small curated core knowledge files.
- **Deep grounded turns:** immigration, legal, regional, pricing, package, and service questions can use the full crawled YouSafe network knowledge corpus.

## Latency budgets

- Live central-knowledge supplement: 1.2 s maximum, with cache/in-flight dedupe and stale-on-error fallback.
- Viewer/profile context: 1.5 s maximum and runs concurrently with knowledge retrieval.
- Assistant auth resolution: 4 s maximum, with a short warm cache.
- Primary model protocol: 11 s maximum.
- Independent protocol fallback: 8 s maximum.

The public chat endpoint emits `Server-Timing` values for knowledge, model, and total duration to make future regressions diagnosable.

## Knowledge integrity

Deep knowledge is not removed to gain speed. Retrieval is lazy and intent-aware. The central crawler keeps the public sister-site coverage while storing a more compact per-page snapshot, and the model still follows the grounding contract: use verified YouSafe evidence, disclose uncertainty, and never fabricate prices, policies, credentials, availability, outcomes, or URLs.


## 14 October recovery and acceptance continuation

A deterministic slow-path regression reproduced fallback starvation: a 24-second primary attempt followed by a nine-second compact retry consumed the entire 33-second generation allowance. The configured fallback is now attempted inside the recovery reserve before compact recovery, after a bounded credential lookup. A quick fallback rejection leaves compact primary recovery available. Grok remains primary, and public 42-second and Messenger commit deadlines are unchanged.

Production and direct inference are separate evidence. The baseline production probe returned HTTP 504 with knowledge 4 seconds, optional web research 6 seconds, and model timeout near 32 seconds. Synthetic direct subscription-authenticated Grok Responses and Chat Completions requests succeeded in approximately 13 and 12 seconds. A saved first-party DeepSeek credential returned HTTP 402; credential presence is not operational availability. No paid provisioning is part of this change.

Transport diagnostics record only protocol, attempt, sanitized model, authentication mode, input character count, elapsed/remaining time, finite status/category, cancellation and output presence. Provider bodies, customer text, prompts and credentials are excluded. Public errors no longer include raw provider rejection bodies.

Acceptance now verifies the actual counter amount, same-scope server quote, retained counter memory and authorized disposition. A failed negotiation stops its dependent turns but independent category and provider-attention fixtures continue. Failed and unreached turns remain explicit failures/unreached evidence; cleanup and release identity gates remain required. A public HTTP 200 also needs substantive reply content.


## Live follow-up on PR429

PR429 shipped at main 1499eba0 with build zefcr41EnBnpgrx8A8KhR and Worker c3241c18-f8e9-4304-867a-af3bfe4bd79b. Smoke and 41-secret manifest parity passed. Full acceptance collected nine passes, six failures and six unreached dependent turns; cleanup passed. Public Responses and Chat attempts exhausted their caps. A synthetic request using the actual public route payload returned output in 14,212 ms, just beyond the old 14-second Responses cap. The primary Responses allowance is now 20 seconds, still bounded by the existing 24-second attempt, 33-second generation and 42-second route budgets; cancellation and recovery remain bounded.

A newer explicit budget now supersedes an older counter for the current decision while preserving counter history. Server-approved offers replace model-supplied gig attachments with the authoritative scope attachment. Every committed human handoff records pending provider attention in metadata and memory; only a real later provider reply can settle that request.

For a first informational impossible-budget question in known education, application-essay organization or student-mentorship scope, the server can hold value and explain that no paid scope is approved at that amount. It issues no offer, discount or claimed handoff. Actual provider-review requests, regulated advice, high-stakes flags, mandatory companion handoff, support handoff, unknown scope, repeat budget gaps and frustration keep their existing escalation gates. This is the existing first-budget-gap explanation policy applied without allowing an old counter or a generated handoff to change its authority.
