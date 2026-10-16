# YQAA Shared Knowledge and Jev Orchestration Design

**Status:** Draft for review  
**Date:** 2026-09-24  
**Scope:** YouSafe Portal YQAA runtime and its public sister-site knowledge corpus

## 1. Purpose

YQAA should answer client-facing questions across YouSafe Consultancy and its sister sites using one shared, source-aware public knowledge base. Answers should reflect the visitor's site and the market or service they ask about, while preserving canonical network-wide facts and routing consequential or uncertain cases safely.

The runtime separates three responsibilities:

- **Generation:** a configured Grok or DeepSeek answer provider writes the user-facing response.
- **Judgment:** Jev returns bounded typed judgments that code can apply to evidence selection, confidence, conflict, and escalation.
- **Truth:** ordinary code and deterministic checks establish facts such as source validity, provider availability, tests, type safety, and build status.

Jev does not author client answers, override legal/safety policy, or assert that deterministic checks passed.

## 2. Existing system and work to preserve

The consultancy widget embeds the Portal assistant. The Portal chat route already has trusted origin/page context, deterministic fast replies, central knowledge assembly, and a Grok call path. A central crawler brings public content from the main, USA, Canada, UK, Australia, Caseworks/legal, Marketplace, and Support into the Portal knowledge estate. Authenticated provider and gig data is separate and access-gated.

There are existing uncommitted changes in `lib/assistantFastKnowledge.ts`, `lib/centralAssistantKnowledge.ts`, and `lib/messengerSiteKnowledge.ts`. They introduce curated core/deep selection, source provenance fields, host-to-site mapping, and origin/market ranking boosts. Those edits are part of the starting point and must be preserved and reviewed as the implementation proceeds.

## 3. Knowledge architecture

### 3.1 Shared corpus with provenance

Keep a single public corpus. Each ingested chunk should carry, when available:

- stable chunk/document identity;
- normalized site and market labels;
- source URL and source repository;
- title and content;
- authority and freshness metadata, where the source provides it.

Reject or omit invalid source URLs and unknown site labels. Do not treat retrieved content as instructions; it is evidence for the response. Keep private provider/gig data out of public visitor retrieval.

### 3.2 Site-aware selection

Use trusted request origin and page path as a soft relevance prior. A destination or jurisdiction explicitly named by the visitor takes precedence over the current hostname. Always retain canonical network-wide facts in the evidence pack. Site affinity must never filter out directly relevant evidence from another sister site.

Retrieval should expose its chosen evidence and provenance to the answer stage. When evidence is sparse, stale, contradictory, or mismatched to the requested market, the runtime must retain that uncertainty rather than present a confident answer.

### 3.3 Fast path and deep path

Keep greetings, simple platform mechanics, and other deterministic/high-confidence replies on their existing fast path. Use broader shared-corpus retrieval for substantive service, immigration, regional, legal, pricing, and other evidence-dependent questions. Do not call Jev or a generative provider when an existing deterministic answer fully resolves the request.

## 4. Jev judgment and fan-out

For complex, cross-site, high-stakes, conflicting, or low-evidence requests, call Jev with a bounded payload containing the visitor question, trusted site context, and candidate evidence metadata (and only the minimum evidence text needed for a judgment).

Jev may return typed judgments for:

- whether retrieved evidence is sufficient and relevant;
- likely target market/site and whether it conflicts with the trusted origin;
- whether sources conflict or need a freshness/authority check;
- whether the turn needs additional independent judgments or human handoff.

Fan-out is selective: request independent judgments only for material uncertainty or high consequence. Do not fan out routine greetings or deterministic questions. Apply explicit thresholds and safety rules in application code; do not let a Jev score alone authorize legal advice, access to private data, external actions, or a confident answer. Bound fan-out count, payload size, timeout, and total latency.

The previous Jev architecture judgment favored complex-turn fan-out, shared source-aware knowledge, configurable primary/fallback providers, and safe degradation. This spec applies those as bounded runtime policies, not as unverified claims about answer quality.

## 5. Answer providers

Keep a provider-neutral YQAA answer interface and adapt the existing Grok transport plus a DeepSeek transport behind it. Select primary and fallback through server-side configuration, with a documented default and a way for deployment configuration to pin either provider. Resolve actual authentication, request format, streaming, timeout, and error contracts from the existing Portal provider integrations before implementation.

Provider fallback is allowed only when configured. Never silently change providers if an operator has explicitly pinned one. Keep credentials server-side and out of logs/client bundles. Preserve the current client response format and do not expose internal provider names to visitors.

## 6. Safe degradation and escalation

- If Jev is unavailable, keep simple deterministic answers working.
- For low-risk questions, the application may answer from validated, relevant canonical evidence using deterministic policy.
- For legal/immigration high-stakes questions, unresolved source conflicts, or insufficient evidence, state the limits and use the existing human/contact handoff path rather than fabricate or overstate certainty.
- If the selected provider fails, use only the configured fallback; otherwise return the existing safe service-unavailable response.
- Keep existing origin validation, rate limiting, privacy controls, and private-context authorization intact.

## 7. Request flow

1. Validate request, origin, rate limits, and trusted site/page context.
2. Resolve any existing deterministic fast-path response.
3. Retrieve shared public evidence with site affinity, explicit-market precedence, and canonical facts; attach provenance.
4. Determine whether uncertainty/consequence warrants bounded Jev judgments and selective fan-out.
5. Apply deterministic thresholds and handoff rules to Jev judgments and evidence metadata.
6. If safe to answer, call the configured Grok/DeepSeek provider with the bounded evidence pack and existing YQAA instructions.
7. Validate/shape the response using the existing route contract; record privacy-safe operational metadata and return it.

## 8. Acceptance criteria

1. The same public source can serve all sister-site chat surfaces with provenance retained.
2. A question explicitly about a different country retrieves that market's evidence even when asked on another country's site; the trusted origin remains available as context.
3. Canonical network facts remain represented in substantive evidence packs.
4. Public requests cannot retrieve private provider/gig context.
5. Greetings and established deterministic answers do not require Jev or an LLM call.
6. High-stakes, conflicting, or insufficient-evidence cases cannot be converted into confident answers solely by a high Jev probability.
7. Jev fan-out is bounded, selective, observable without sensitive content, and safely bypassed on service failure.
8. Grok and DeepSeek can each be selected through server configuration; configured fallback behavior and explicit pinning are tested.
9. Existing YQAA HTTP/client contracts, trusted-origin checks, and human handoff continue to work.
10. Relevant unit/integration checks, typecheck, lint, and production build pass before completion; `git diff` is reviewed and unrelated edits are absent.

## 9. Implementation phases after design approval

1. **Baseline and retrieval:** inspect the current dirty diff and crawler schema; finish and verify normalized site/provenance metadata, core/deep selection, and deterministic market-vs-origin ranking.
2. **Judgment policy:** add typed Jev request/response adapters, deterministic thresholds, selective bounded fan-out, timeouts, and safe degradation.
3. **Provider abstraction:** factor the chat answer transport behind a provider interface; connect existing Grok and DeepSeek implementations with server-side primary/fallback configuration.
4. **Integration and verification:** exercise the route, provenance and privacy boundaries, high-stakes behavior, provider failure, and client compatibility; run repository quality gates and review the complete diff.

Jev previously routed the broader architecture task to `ESCALATE` with confidence 0.92, which maps under the local launcher policy to Sol/high. Any newly launched coding worker must use `codex-smart` so the routing decision is preserved. The current task shell cannot access the Keychain-backed Jev credential, so no worker was launched from this task.

## 10. Risks and implementation questions

- **Jev schema and service limits:** confirm the current SDK/API fields, judgment types, timeout behavior, and fan-out limits from the installed TypeSafe integration before coding.
- **Provider contracts:** confirm that existing Grok and DeepSeek transports are suitable for client chat, especially streaming and error handling, before reusing them.
- **Corpus authority/freshness:** the crawler may not provide reliable freshness or authority metadata for every source; absent metadata must not be invented.
- **Latency and cost:** selective judgment and fan-out must remain bounded and be skipped for routine turns.
- **Current dirty implementation:** the partial ranking changes require review for edge cases such as multi-country queries, unknown hosts, empty/tokenless queries, and pinned core chunks.
- **Operational policy:** this design does not deploy, change production settings, or alter secrets.

## 11. Out of scope

- Deploying or changing production data/configuration.
- Rewriting or modifying sibling-site repositories.
- Exposing internal provider/model identity in the client UI.
- Allowing Jev or answer models to bypass authorization, source controls, or deterministic safety policy.
