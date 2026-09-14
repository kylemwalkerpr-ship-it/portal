# SuperGrok In-Process Transport Design

Date: 2026-09-14

## Status

Approved architecture, ready for implementation planning after written-spec review.

## Context

The Portal currently supports two xAI credential products:

1. Developer API keys (`xai-...`), which belong on `https://api.x.ai/v1`.
2. SuperGrok / Grok subscription OAuth tokens, which belong on `https://cli-chat-proxy.grok.com/v1` and require Grok CLI-compatible headers plus special handling for blocking calls over an upstream SSE stream.

The current implementation routes SuperGrok generation through the Portal's own public hostname:

`contentAiProvider -> https://portal.yousafeconsultancy.com/api/internal/xai-grok -> Portal Worker -> cli-chat-proxy.grok.com`

That self-fetch created the original Cloudflare 522 failure because a Worker Custom Domain was fetching the same Custom Domain. PR #189 mitigated that by enabling `global_fetch_strictly_public`, classifying 522 as retryable, and improving Configurator health semantics. PR #190 then added one-time forced OAuth refresh and replay when the subscription proxy returns 401.

Those fixes restored the current path, but the architecture still makes an in-process server caller leave the Worker and re-enter it through public HTTP just to reach logic already owned by the same application.

## Decision

Replace the internal HTTP self-fetch with one shared server-side xAI transport implementation.

Target flow:

```text
contentAiProvider
    -> shared xAI transport
        -> developer key: api.x.ai/v1
        -> SuperGrok OAuth: cli-chat-proxy.grok.com/v1

/api/internal/xai-grok/[...path]
    -> thin HTTP adapter
        -> same shared xAI transport
```

The HTTP route remains for genuine HTTP callers and diagnostics. It must not be required by normal server-side content generation.

## Goals

- Remove the Portal-to-Portal HTTP round trip for SuperGrok generation.
- Preserve all working behavior introduced by PR #189 and PR #190.
- Keep developer API keys and subscription OAuth credentials on their correct upstream products.
- Give the HTTP route and in-process callers one implementation of forwarding, Grok CLI headers, SSE bridging, and auth recovery.
- Preserve the current blocking JSON contract expected by `contentAiProvider`.
- Make the transport independently testable without `NextRequest` or a deployed Worker.
- Remove `global_fetch_strictly_public` if, after a repository-wide audit, no other required same-host fetch depends on it.

## Non-goals

- No redesign of the SuperGrok device-code login UI or token persistence model.
- No provider-policy changes in Content Studio.
- No automatic refresh on HTTP 403. A 403 remains a policy/quota/authorization failure unless future upstream evidence proves otherwise.
- No change to developer-key billing semantics.
- No public exposure of OAuth tokens or raw transport internals.
- No cleanup of the separate Cloudflare deployment-token / Workers Routes permission problem in this change. That is an independent deployment-infrastructure task.

## Architecture

### 1. Shared server transport

Create a focused server-only transport module, preferably `lib/xaiGrokServerTransport.ts`.

Keep `lib/xaiGrokTransport.ts` as the lightweight home for product constants and pure credential/header helpers unless implementation reveals a strong reason to merge them. This avoids turning a pure utility module into a large I/O module and makes the server boundary explicit.

The shared transport accepts plain platform-neutral inputs rather than a Next.js request object. Conceptually:

```ts
interface XaiTransportRequest {
  method: 'GET' | 'POST'
  path: 'responses' | 'chat/completions' | 'models'
  token: string
  query?: string
  headers?: HeadersInit
  body?: ArrayBuffer | Uint8Array | string | null
}

async function forwardXaiRequest(input: XaiTransportRequest): Promise<Response>
```

Exact names may change during implementation, but the boundary must remain framework-independent.

Responsibilities of the shared transport:

- validate/normalize the supported xAI path;
- detect developer key versus OAuth token;
- select `api.x.ai/v1` for developer keys;
- select `cli-chat-proxy.grok.com/v1` for SuperGrok OAuth;
- preserve the current allowed request metadata headers;
- inject Grok CLI subscription headers only for OAuth;
- derive `x-userid` and `x-grok-user-id` from the OAuth JWT subject when available;
- synthesize Grok conversation/request/session/agent IDs where absent;
- force upstream streaming for blocking OAuth `responses` and `chat/completions` calls;
- bridge those SSE streams back into the current blocking JSON shapes;
- perform exactly one forced token refresh and exactly one replay after an OAuth upstream 401;
- never perform that refresh path for developer API keys;
- never perform that refresh path for a 403;
- preserve selected response headers and transport diagnostics.

The transport returns a normal Web `Response`, allowing both Next.js and in-process consumers to use the same result contract.

### 2. Dependency boundaries for testing

The shared transport should not hard-wire difficult-to-test global behavior where avoidable. It should permit dependency injection, directly or through a small internal options object, for at least:

- upstream `fetch`;
- forced OAuth refresh.

Production defaults remain global `fetch` and `forceRefreshSuperGrokAccessToken()`.

This lets unit tests prove destination URLs, replay counts, header mutations, and non-retry behavior without reaching xAI.

Do not add a broad dependency-injection framework; keep this local to the transport.

### 3. HTTP adapter route

`app/api/internal/xai-grok/[...path]/route.ts` becomes a thin adapter.

It should only:

1. resolve and validate route segments;
2. extract the bearer credential;
3. read the request body when applicable;
4. pass method/path/query/headers/body/token to the shared transport;
5. return the shared transport's `Response`.

The route should retain the existing external behavior:

- unsupported paths -> 404;
- missing bearer credential -> 401;
- same response bodies/statuses/diagnostic headers for forwarded requests.

SSE parsing, upstream selection, CLI headers, and 401 recovery must no longer live in the route file.

### 4. In-process Content Studio caller

`lib/contentAiProvider.ts` must stop constructing a SuperGrok URL under `portal.yousafeconsultancy.com`.

For Grok generation, resolve the effective credential first, then call the shared transport directly for `/responses` (and the existing chat-completions fallback when applicable).

The caller continues to own provider-level concerns such as:

- timeout/retry policy;
- friendly provider error messages;
- response text extraction;
- model selection and Content Studio provider policy.

The shared transport owns network/protocol concerns.

This separation is intentional: a 401 refresh/replay is transport recovery, while a 522/524/provider retry policy remains a higher-level generation concern.

### 5. OAuth overlay cleanup

`overlayGrokAuth()` currently sets `XAI_BASE_URL` to the Portal router URL for SuperGrok. That behavior must no longer be required for internal generation.

Implementation should separate credential selection from transport location. Preferred result:

- OAuth overlay identifies the auth mode, access token, and model;
- shared transport decides the upstream destination from credential type;
- no internal generation path depends on `XAI_GROK_ROUTER_BASE_URL`.

Before deleting `xaiGrokRouterBaseUrl()` or `XAI_GROK_ROUTER_BASE_URL_DEFAULT`, search the repository for legitimate external/diagnostic consumers. Remove them only if they have no remaining purpose.

## Data flow

### SuperGrok OAuth, normal success

```text
contentAiProvider
  -> resolve fresh SuperGrok access token
  -> shared transport(path=responses, token=OAuth)
  -> add Grok CLI headers + user/session metadata
  -> POST cli-chat-proxy.grok.com/v1/responses with stream=true
  -> receive SSE
  -> bridge SSE to blocking JSON Response
  -> contentAiProvider parses existing JSON contract
```

No request should target `portal.yousafeconsultancy.com` in this flow.

### SuperGrok OAuth, upstream 401

```text
shared transport
  -> first request returns 401
  -> forceRefreshSuperGrokAccessToken() once
  -> if refresh succeeds:
       replace bearer token
       recompute user-id headers
       replay once
  -> return replay result
```

If refresh is unavailable or fails, return the original 401-class failure without looping.

A replay that also returns 401 is returned as-is. There is no second refresh.

### SuperGrok OAuth, upstream 403

Return the 403. Do not force-refresh automatically.

### Developer API key

```text
contentAiProvider or HTTP adapter
  -> shared transport(token=xai-...)
  -> api.x.ai/v1
```

No Grok CLI subscription headers, no forced streaming bridge solely for subscription compatibility, and no OAuth refresh path.

## Streaming bridge behavior

The existing blocking contract must remain stable.

For OAuth requests where the caller asked for non-streaming `responses` or `chat/completions`, the transport may force `stream: true` upstream because the subscription proxy behaves as a streaming service. It then converts SSE events into the same blocking JSON structures currently returned by the route.

For callers that explicitly request `stream: true`, the transport should pass through streaming semantics rather than double-bridge them.

The implementation should extract the existing SSE parsing and bridge functions with minimal semantic change first. Do not rewrite their event model during this refactor unless a failing regression test proves a current bug.

## Error handling and retry ownership

### Shared transport owns

- upstream destination selection;
- one-time OAuth 401 refresh/replay;
- response/header normalization;
- subscription stream bridging;
- protocol-specific failure propagation.

### `contentAiProvider` owns

- generation retries across transient provider failures;
- provider fallback/cascade behavior;
- user-facing error wording;
- timeout policy.

The existing 522 retry classification may remain because a 522 can still arise from an upstream/network gateway even after the self-fetch architecture is removed. However, any error text that specifically attributes every 522 to Portal self-routing should be revised to a generic transport/gateway description.

A 524 remains subject to the current provider timeout policy rather than being silently converted into an auth problem.

## Security and privacy

- OAuth access and refresh tokens remain server-only.
- The HTTP adapter continues to require a bearer credential.
- Never log raw bearer or refresh tokens.
- Do not echo credentials in error bodies.
- Preserve the path allowlist; the route must not become an arbitrary proxy.
- Keep upstream redirect handling explicit (`redirect: 'manual'`) as today.
- Preserve `cache: 'no-store'` for inference transport.

## Tests

Implementation is not complete until regression coverage proves all of the following.

### Shared transport unit tests

1. OAuth `responses` goes directly to `https://cli-chat-proxy.grok.com/v1/responses`.
2. No internal OAuth generation request targets `portal.yousafeconsultancy.com`.
3. Developer `xai-...` keys go to `https://api.x.ai/v1`.
4. OAuth receives required Grok CLI headers.
5. Developer API traffic does not receive subscription-only headers.
6. JWT subject populates both current user-id header spellings.
7. Missing user-id after refresh removes stale user-id headers.
8. Blocking OAuth `responses` forces upstream streaming and bridges SSE to the expected blocking JSON.
9. Blocking OAuth `chat/completions` does the same for the chat response shape.
10. Explicit streaming callers are not unnecessarily bridged.
11. OAuth 401 triggers exactly one forced refresh and one replay.
12. Replay uses the refreshed bearer token.
13. Replay recomputes user-id headers from the refreshed token.
14. No usable refresh result causes no replay loop.
15. A second 401 after replay does not trigger another refresh.
16. OAuth 403 triggers zero forced refresh attempts.
17. Developer-key 401 triggers zero OAuth refresh attempts.
18. Relevant response headers and transport diagnostics survive forwarding.

### HTTP adapter tests

1. unsupported path still returns 404;
2. missing bearer still returns 401;
3. route delegates to the shared transport;
4. HTTP and in-process paths produce equivalent transport behavior for the same logical OAuth request.

### Content provider regression tests

1. Grok OAuth generation calls the shared transport in-process;
2. no SuperGrok generation code constructs the Portal router hostname;
3. current provider-level parsing and retry semantics remain intact;
4. developer-key generation remains functional.

### Configuration regression

Replace the tactical regression that requires `global_fetch_strictly_public` with one that requires the internal generation path not to self-fetch the Portal hostname.

After the implementation is working, perform a repository-wide search for same-host Worker fetches. If none require the compatibility flag, remove `global_fetch_strictly_public` and update the `wrangler.toml` comment accordingly. If another legitimate same-host fetch still depends on it, retain the flag but remove the obsolete SuperGrok-specific justification.

## Migration sequence

1. Add failing shared-transport tests first.
2. Extract transport logic from the route into the server module without changing behavior.
3. Point the HTTP route at the shared module and make existing route tests pass.
4. Point `contentAiProvider` Grok calls at the shared module directly.
5. Remove the OAuth dependency on the Portal router base URL for internal generation.
6. Run targeted SuperGrok tests.
7. Run full typecheck, Jest suite, and production/OpenNext build.
8. Audit `global_fetch_strictly_public`; remove it only if no remaining same-host dependency exists.
9. Open a PR and run CI.
10. After deployment, run the authenticated Configurator test and confirm `OAuth connected · inference healthy`.

## Rollout and verification

The change should be shipped as one reviewable PR based on the current `main` containing PR #190.

Production verification must prove more than HTTP health:

- deployment workflow green;
- Portal startup/smoke checks green;
- authenticated Configurator SuperGrok test succeeds;
- Configurator reports inference healthy;
- logs/errors show no request from normal SuperGrok generation to `portal.yousafeconsultancy.com/api/internal/xai-grok`;
- a controlled 401 test or unit evidence confirms one-time refresh/replay behavior remains intact.

If the authenticated Configurator still returns 401 after the shared transport refactor and forced refresh, treat that as an OAuth credential/session problem rather than reverting to HTTP self-routing.

## Rollback

Because the HTTP adapter remains functional, rollback is straightforward: revert the implementation PR to the current #190 architecture. Do not introduce a runtime feature flag unless implementation uncovers a deployment-specific reason; the existing route already provides a known-good previous boundary and Git rollback is sufficient.

## Acceptance criteria

The refactor is accepted when:

- normal server-side SuperGrok generation contains no Portal-host self-fetch;
- developer keys still use `api.x.ai`;
- OAuth still uses `cli-chat-proxy.grok.com` with required CLI headers;
- blocking response compatibility is unchanged;
- OAuth 401 refreshes/replays once and only once;
- 403 does not force-refresh;
- HTTP route and in-process caller share one transport implementation;
- targeted and full test/build gates pass;
- production authenticated inference is verified healthy;
- `global_fetch_strictly_public` is removed if no other repo dependency requires it, otherwise retained with accurate documentation.

## Separate follow-up

The Cloudflare deploy workflow's API token can upload the Worker but has previously failed when Wrangler enumerates Workers Routes with Cloudflare error code 10000. That permission/configuration problem is deliberately excluded from this transport refactor so transport correctness and deployment-token scope are not conflated. It should be fixed in a separate infrastructure change after inspecting the current Wrangler route-management requirements and Cloudflare's current minimal token permissions.