# TypeSearch research integration

The production workflow maps the existing `TYPESEARCH_API_KEY` repository secret into server-only Worker bindings. No client form or browser bundle receives it.

Public questions are sanitized before sending them to `https://api.typesearch.ai/v1/search`. The adapter requests normal mode, article highlights, at most three results, a 2,000-token provider cap and a 1.8-second application deadline. The existing six-second overall research deadline still applies.

Official browser retrieval remains first for regulated research. TypeSearch follows it and precedes the existing Grok search recovery. Official jurisdiction filters are sent to TypeSearch and checked again against returned citation hosts. Empty, failed, cached, incomplete, headline-only or excerpt-free responses fall back. Only confirmed article excerpts (at most 25 words each) become evidence; they are labeled as excerpts rather than complete pages.

TypeSearch's default index covers news and discovery; it is not the authoritative Typesense corpus. Official sources may not be indexed, so no-result fallback is expected. The integration cannot be called production-verified until the official main deployment and authenticated live acceptance run pass.

References: https://typesearch.ai/docs/api-reference/search and https://typesearch.ai/docs/quickstart.
