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
