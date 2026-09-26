# SuperGrok In-Process Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Portal-to-Portal SuperGrok self-fetch by moving xAI forwarding, Grok CLI headers, SSE bridging, and one-time OAuth 401 recovery into a shared in-process server transport used by both Content Studio and the HTTP shim.

**Architecture:** Add `lib/xaiGrokServerTransport.ts` as the single network/protocol boundary for xAI developer-key and SuperGrok OAuth traffic. The existing HTTP route becomes a thin adapter over that module, while `lib/contentAiProvider.ts` calls the same transport directly for Grok requests so normal generation never fetches `portal.yousafeconsultancy.com`.

**Tech Stack:** Next.js 16.2.11 App Router, TypeScript 6 targeting ES2017, Web `Request`/`Response`/`ReadableStream`, Jest 30 + ts-jest, OpenNext for Cloudflare Workers, Wrangler 4.113.0.

**Spec:** `docs/superpowers/specs/2026-09-14-supergrok-inprocess-transport-design.md`

## Global Constraints

- Developer `xai-...` keys must continue to use `https://api.x.ai/v1`.
- SuperGrok OAuth must continue to use `https://cli-chat-proxy.grok.com/v1` with Grok CLI-compatible headers.
- OAuth 401 recovery is exactly one forced refresh plus one replay; 403 and developer-key 401 never enter OAuth refresh recovery.
- Blocking OAuth `responses` and `chat/completions` keep the existing SSE-to-blocking-JSON compatibility behavior.
- Explicit streaming callers remain streaming and are not double-bridged.
- `contentAiProvider` retains provider retries, fallback policy, timeout policy, response parsing, and friendly error wording.
- OAuth tokens remain server-only and must never be logged or echoed in error bodies.
- The HTTP shim retains the path allowlist and bearer requirement and must not become an arbitrary proxy.
- Keep `redirect: 'manual'` and `cache: 'no-store'` on xAI transport requests.
- Do not broaden this change into the separate Cloudflare deploy-token / Workers Routes permission problem.
- All new TypeScript/tests must remain compatible with the repository's ES2017 target.

---

### Task 1: Extract the shared server transport with destination/header parity

**Files:**
- Create: `lib/xaiGrokServerTransport.ts`
- Create: `tests/xai-grok-server-transport.test.ts`
- Read/Reuse: `lib/xaiGrokTransport.ts`
- Read/Reuse: `app/api/internal/xai-grok/[...path]/route.ts`

**Interfaces:**
- Produces:

```ts
export type XaiTransportPath = 'responses' | 'chat/completions' | 'models'

export interface XaiTransportRequest {
  method: 'GET' | 'POST'
  path: XaiTransportPath
  token: string
  query?: string
  headers?: HeadersInit
  body?: ArrayBuffer | Uint8Array | string | null
}

export interface XaiTransportDependencies {
  fetchImpl?: typeof fetch
  forceRefresh?: typeof forceRefreshSuperGrokAccessToken
}

export async function forwardXaiRequest(
  input: XaiTransportRequest,
  deps?: XaiTransportDependencies,
): Promise<Response>
```

- Consumes pure helpers already present in `lib/xaiGrokTransport.ts`: `isXaiDeveloperApiKey`, `xaiUpstreamBaseForToken`, `decodeJwtSubject`, `superGrokProxyHeaders`.

- [ ] **Step 1: Write failing routing/header tests**

Add tests that inject `fetchImpl` and assert exact upstream destinations and header policy:

```ts
it('routes SuperGrok OAuth directly to the CLI proxy and adds subscription headers', async () => {
  const fetchImpl = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
    }),
  ) as typeof fetch

  const token = jwtWithSubject('user-123')
  const response = await forwardXaiRequest({
    method: 'POST',
    path: 'responses',
    token,
    headers: { accept: 'application/json' },
    body: JSON.stringify({ model: 'grok-4.6', input: 'ok', stream: true }),
  }, { fetchImpl })

  expect(fetchImpl).toHaveBeenCalledTimes(1)
  const [url, init] = (fetchImpl as jest.Mock).mock.calls[0]
  expect(String(url)).toBe('https://cli-chat-proxy.grok.com/v1/responses')
  const headers = new Headers(init.headers)
  expect(headers.get('authorization')).toBe(`Bearer ${token}`)
  expect(headers.get('x-xai-token-auth')).toBe('xai-grok-cli')
  expect(headers.get('x-userid')).toBe('user-123')
  expect(headers.get('x-grok-user-id')).toBe('user-123')
  expect(response.headers.get('x-yousafe-xai-transport')).toBe('supergrok-oauth')
})

it('routes developer keys to api.x.ai without subscription-only headers', async () => {
  const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 })) as typeof fetch
  await forwardXaiRequest({ method: 'GET', path: 'models', token: 'xai-developer-key' }, { fetchImpl })

  const [url, init] = (fetchImpl as jest.Mock).mock.calls[0]
  expect(String(url)).toBe('https://api.x.ai/v1/models')
  const headers = new Headers(init.headers)
  expect(headers.get('x-xai-token-auth')).toBeNull()
  expect(headers.get('x-grok-client-version')).toBeNull()
})
```

Add a local `jwtWithSubject(sub)` helper in the test using `Buffer.from(JSON.stringify(...)).toString('base64url')`; do not depend on live OAuth.

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
npx jest tests/xai-grok-server-transport.test.ts --runInBand
```

Expected: FAIL because `@/lib/xaiGrokServerTransport` and `forwardXaiRequest` do not exist.

- [ ] **Step 3: Create the module and move only destination/header/body forwarding first**

Implement the exported types and `forwardXaiRequest()` with:
- the current path allowlist represented by the `XaiTransportPath` type;
- `Authorization` + `Accept` + `Content-Type` construction;
- passthrough of `x-grok-conv-id`, `x-grok-req-id`, `x-grok-session-id`, `x-grok-agent-id`;
- OAuth-only Grok CLI headers and JWT subject headers;
- OAuth-only generated conversation/request/session/agent IDs when absent;
- upstream URL from `xaiUpstreamBaseForToken(token)`;
- `redirect: 'manual'` and `cache: 'no-store'`;
- passthrough response headers currently preserved by the route;
- `x-yousafe-xai-transport` diagnostic response header.

Do not yet implement SSE bridging or 401 replay in this step.

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run:

```bash
npx jest tests/xai-grok-server-transport.test.ts --runInBand
```

Expected: routing/header tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/xaiGrokServerTransport.ts tests/xai-grok-server-transport.test.ts
git commit -m "refactor: add shared xAI server transport"
```

---

### Task 2: Preserve SSE bridging and exact one-time OAuth 401 recovery

**Files:**
- Modify: `lib/xaiGrokServerTransport.ts`
- Modify: `tests/xai-grok-server-transport.test.ts`
- Reference behavior: `app/api/internal/xai-grok/[...path]/route.ts`
- Preserve helper: `lib/xaiSuperGrokOAuth.ts::forceRefreshSuperGrokAccessToken`

**Interfaces:**
- Keeps `forwardXaiRequest(input, deps): Promise<Response>` unchanged.
- `deps.forceRefresh` defaults to `forceRefreshSuperGrokAccessToken` and is called only for OAuth status 401.

- [ ] **Step 1: Add failing blocking-bridge tests**

Add helper:

```ts
function sseResponse(events: unknown[]): Response {
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(payload, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}
```

Add tests proving:
- non-streaming OAuth `responses` is sent upstream with `stream: true`, then returned as blocking JSON containing `output_text`, `status`, and `model`;
- non-streaming OAuth `chat/completions` is sent upstream with `stream: true`, then returned as blocking JSON with `choices[0].message.content` and `finish_reason`;
- explicit `{ stream: true }` is passed through without `x-yousafe-xai-stream-bridge`.

Use representative existing event shapes:

```ts
sseResponse([
  { type: 'response.output_text.delta', delta: 'o' },
  { type: 'response.output_text.delta', delta: 'k' },
  { type: 'response.completed', response: { status: 'completed' } },
])
```

and:

```ts
sseResponse([
  { choices: [{ delta: { content: 'o' }, finish_reason: null }] },
  { choices: [{ delta: { content: 'k' }, finish_reason: 'stop' }] },
])
```

- [ ] **Step 2: Add failing auth-recovery tests**

Cover all recovery boundaries in the same test file:

```ts
it('refreshes once and replays once after an OAuth 401', async () => {
  const refreshedToken = jwtWithSubject('new-user')
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(new Response('{"error":"Unauthorized"}', { status: 401 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 })) as typeof fetch
  const forceRefresh = jest.fn(async () => ({
    accessToken: refreshedToken,
    expiresAt: Date.now() + 3_600_000,
    authMode: 'supergrok' as const,
  }))

  await forwardXaiRequest({
    method: 'POST',
    path: 'responses',
    token: jwtWithSubject('old-user'),
    body: JSON.stringify({ model: 'grok-4.6', input: 'ok', stream: true }),
  }, { fetchImpl, forceRefresh })

  expect(forceRefresh).toHaveBeenCalledTimes(1)
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  const replayHeaders = new Headers((fetchImpl as jest.Mock).mock.calls[1][1].headers)
  expect(replayHeaders.get('authorization')).toBe(`Bearer ${refreshedToken}`)
  expect(replayHeaders.get('x-userid')).toBe('new-user')
  expect(replayHeaders.get('x-grok-user-id')).toBe('new-user')
})
```

Also add assertions for:
- refresh returns `null` -> only one upstream call;
- replay returns 401 -> two upstream calls, one refresh only;
- OAuth 403 -> zero refresh calls;
- developer-key 401 -> zero refresh calls;
- refreshed token without a JWT subject deletes stale `x-userid` and `x-grok-user-id` before replay.

- [ ] **Step 3: Run targeted tests and verify RED**

```bash
npx jest tests/xai-grok-server-transport.test.ts --runInBand
```

Expected: new bridge/recovery tests FAIL because the extracted module does not yet contain those behaviors.

- [ ] **Step 4: Move the current SSE parsing/bridge code into the shared module with minimal semantic change**

Move/adapt these route helpers into `lib/xaiGrokServerTransport.ts`:
- `parseJsonBody`
- `modelFromBody`
- `shouldBridgeStreaming`
- `sseDataPayloads`
- `escapeJsonStringChunk`
- `bridgeResponsesStream`
- `bridgeChatCompletionsStream`

For non-streaming OAuth POSTs to `responses` or `chat/completions`, rewrite the upstream JSON body to `{ ...body, stream: true }` and set `Accept: text/event-stream`. After a successful upstream response, bridge back to the existing blocking JSON shape and set:

```ts
responseHeaders.set('content-type', 'application/json; charset=utf-8')
responseHeaders.set('x-yousafe-xai-stream-bridge', streamBridge)
```

- [ ] **Step 5: Implement exact one-time 401 refresh/replay in the shared module**

After the first upstream fetch:

```ts
if (!developerKey && upstream.status === 401) {
  const refreshed = await forceRefresh()
  if (refreshed?.accessToken) {
    try { await upstream.body?.cancel() } catch { /* best effort */ }
    headers.set('Authorization', `Bearer ${refreshed.accessToken}`)
    const refreshedUserId = decodeJwtSubject(refreshed.accessToken)
    if (refreshedUserId) {
      headers.set('x-userid', refreshedUserId)
      headers.set('x-grok-user-id', refreshedUserId)
    } else {
      headers.delete('x-userid')
      headers.delete('x-grok-user-id')
    }
    upstream = await fetchImpl(upstreamUrl, requestInit)
  }
}
```

Do not wrap this in a loop. Do not refresh on 403. Do not refresh developer keys.

- [ ] **Step 6: Run targeted tests and verify GREEN**

```bash
npx jest tests/xai-grok-server-transport.test.ts --runInBand
```

Expected: all shared-transport routing, header, SSE bridge, and auth-recovery tests PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add lib/xaiGrokServerTransport.ts tests/xai-grok-server-transport.test.ts
git commit -m "refactor: centralize SuperGrok stream and auth recovery"
```

---

### Task 3: Reduce `/api/internal/xai-grok` to a thin HTTP adapter

**Files:**
- Modify: `app/api/internal/xai-grok/[...path]/route.ts`
- Create: `tests/xai-grok-http-adapter.test.ts`
- Consume: `lib/xaiGrokServerTransport.ts`

**Interfaces:**
- Route delegates to `forwardXaiRequest()` and owns only route parsing, bearer extraction, raw-body reading, and framework adaptation.

- [ ] **Step 1: Add failing adapter tests**

Mock the shared module before importing the route:

```ts
jest.mock('@/lib/xaiGrokServerTransport', () => ({
  forwardXaiRequest: jest.fn(async () => new Response('{"ok":true}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })),
}))
```

Test:
- unsupported `path` -> 404 and `forwardXaiRequest` not called;
- missing bearer -> 401 and not delegated;
- valid POST delegates with `method`, normalized `path`, bearer `token`, `request.nextUrl.search`, request headers, and raw body;
- valid GET delegates with no body.

Use `NextRequest` directly:

```ts
const request = new NextRequest('https://portal.yousafeconsultancy.com/api/internal/xai-grok/responses?trace=1', {
  method: 'POST',
  headers: {
    authorization: 'Bearer oauth-token',
    'content-type': 'application/json',
  },
  body: JSON.stringify({ model: 'grok-4.6', input: 'ok' }),
})
```

- [ ] **Step 2: Run adapter tests and verify RED**

```bash
npx jest tests/xai-grok-http-adapter.test.ts --runInBand
```

Expected: delegation-shape test FAIL because the route still contains transport logic and does not call the shared module.

- [ ] **Step 3: Replace the route implementation with the thin adapter**

Keep:
- `dynamic = 'force-dynamic'`;
- the supported path set;
- `bearerToken()`;
- 404/401 JSON bodies;
- `GET` and `POST` exports.

Remove from the route:
- upstream selection;
- Grok CLI header injection;
- SSE parsing/bridging;
- 401 refresh/replay;
- response-header normalization.

Delegate:

```ts
return forwardXaiRequest({
  method: request.method as 'GET' | 'POST',
  path: path as XaiTransportPath,
  token,
  query: request.nextUrl.search,
  headers: request.headers,
  body: rawBody,
})
```

- [ ] **Step 4: Run adapter + transport tests and verify GREEN**

```bash
npx jest tests/xai-grok-http-adapter.test.ts tests/xai-grok-server-transport.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add app/api/internal/xai-grok/'[...path]'/route.ts tests/xai-grok-http-adapter.test.ts
git commit -m "refactor: make xAI route a thin adapter"
```

---

### Task 4: Wire `contentAiProvider` directly to the shared transport

**Files:**
- Modify: `lib/contentAiProvider.ts`
- Create: `tests/supergrok-inprocess-provider.test.ts`
- Consume: `lib/xaiGrokServerTransport.ts`
- Preserve: `tests/supergrok-522-retry.test.ts`

**Interfaces:**
- Grok blocking calls invoke `forwardXaiRequest({ method: 'POST', path: 'responses' | 'chat/completions', token, body, headers })`.
- Existing provider return shape remains `{ text, finishReason?, model }`.
- Existing provider-level retry/fallback ownership remains in `contentAiProvider`.

- [ ] **Step 1: Add a failing static regression proving no internal Portal router fetch**

In `tests/supergrok-inprocess-provider.test.ts`:

```ts
import { readFileSync } from 'node:fs'

it('does not construct the Portal xAI router URL in Content Studio generation', () => {
  const provider = readFileSync('lib/contentAiProvider.ts', 'utf8')
  expect(provider).not.toContain('portal.yousafeconsultancy.com/api/internal/xai-grok')
  expect(provider).toContain('forwardXaiRequest')
})
```

This should initially fail on the `forwardXaiRequest` assertion.

- [ ] **Step 2: Add behavioral provider tests with the shared transport mocked**

Mock OAuth hydration and the shared transport, then call the public Grok-capable generation surface used by existing provider tests. The test must prove that a SuperGrok credential is passed as `token` to `forwardXaiRequest()` and that returned blocking JSON is parsed into the existing text result.

Mock result for `/responses`:

```ts
new Response(JSON.stringify({
  output_text: 'ok',
  status: 'completed',
  model: 'grok-4.6',
}), { status: 200, headers: { 'content-type': 'application/json' } })
```

Add a developer-key case that asserts the same shared transport is used with `token: 'xai-developer-key'`; destination selection remains the transport's responsibility.

- [ ] **Step 3: Run provider regression test and verify RED**

```bash
npx jest tests/supergrok-inprocess-provider.test.ts --runInBand
```

Expected: FAIL because Grok still builds a URL from `baseURL` and uses generic `fetch`.

- [ ] **Step 4: Change blocking Grok requests to use `forwardXaiRequest()`**

In `grokResponsesFetch()`:
- keep `grokAuthHeader()`/auth resolution long enough to preserve current vault/OAuth precedence;
- stop constructing `${baseURL}/responses` for Grok;
- call `forwardXaiRequest()` with the resolved `apiKey` token and JSON body;
- preserve the current 402/522/general error handling and response parsing exactly above the transport.

For the existing chat-completions fallback on 404, route that request through the same shared transport with `path: 'chat/completions'`.

Revise any 522 wording that specifically implies Portal self-routing to generic gateway/transport language while keeping `isRetryableProviderFailure()` behavior intact.

- [ ] **Step 5: Route Grok streaming through the same shared transport without double-bridging**

In `grokResponsesStream()` or its Grok-specific streaming path, send a request body with `stream: true` through `forwardXaiRequest()`. Because the shared transport sees explicit streaming, it must return the upstream stream unchanged. Keep Content Studio's existing stream-event parser and cancellation behavior.

- [ ] **Step 6: Run targeted provider tests and the existing 522 retry regression**

```bash
npx jest tests/supergrok-inprocess-provider.test.ts tests/supergrok-522-retry.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add lib/contentAiProvider.ts tests/supergrok-inprocess-provider.test.ts tests/supergrok-522-retry.test.ts
git commit -m "refactor: use in-process SuperGrok transport"
```

---

### Task 5: Remove OAuth routing-location coupling and retire the tactical self-fetch regression

**Files:**
- Modify: `lib/xaiSuperGrokOAuth.ts`
- Modify: `lib/xaiGrokTransport.ts`
- Modify: `tests/xai-supergrok-oauth.test.ts`
- Modify: `tests/supergrok-self-fetch-regression.test.ts`
- Modify conditionally: `wrangler.toml`

**Interfaces:**
- `overlayGrokAuth()` continues to set:
  - `XAI_API_KEY = oauth.accessToken`
  - `XAI_AUTH_MODE = 'supergrok'`
  - `XAI_MODEL = XAI_DEFAULT_MODEL`
- It no longer needs to set `XAI_BASE_URL` to the Portal shim.

- [ ] **Step 1: Add a failing OAuth overlay test that forbids Portal routing injection**

Extend `tests/xai-supergrok-oauth.test.ts`:

```ts
it('does not couple SuperGrok OAuth to the Portal HTTP router', () => {
  const next = overlayGrokAuth(
    { XAI_API_KEY: 'xai-team-console-key', XAI_BASE_URL: 'https://api.x.ai/v1' },
    { accessToken: 'oauth-session-token', expiresAt: Date.now() + 60_000, authMode: 'supergrok' },
  )
  expect(next.XAI_API_KEY).toBe('oauth-session-token')
  expect(next.XAI_AUTH_MODE).toBe('supergrok')
  expect(next.XAI_BASE_URL).not.toContain('portal.yousafeconsultancy.com')
})
```

- [ ] **Step 2: Replace the tactical self-fetch regression with the architectural regression**

Rewrite `tests/supergrok-self-fetch-regression.test.ts` so it inspects the internal generation source rather than requiring a Cloudflare compatibility flag:

```ts
import { readFileSync } from 'node:fs'

describe('SuperGrok in-process transport regression', () => {
  it('does not route internal Grok generation through the Portal Custom Domain', () => {
    const provider = readFileSync('lib/contentAiProvider.ts', 'utf8')
    const oauth = readFileSync('lib/xaiSuperGrokOAuth.ts', 'utf8')
    expect(provider).not.toContain('portal.yousafeconsultancy.com/api/internal/xai-grok')
    expect(oauth).not.toContain('xaiGrokRouterBaseUrl()')
  })
})
```

- [ ] **Step 3: Run the two tests and verify RED**

```bash
npx jest tests/xai-supergrok-oauth.test.ts tests/supergrok-self-fetch-regression.test.ts --runInBand
```

Expected: FAIL because `overlayGrokAuth()` still writes the router base URL.

- [ ] **Step 4: Remove transport-location mutation from OAuth overlay**

In `lib/xaiSuperGrokOAuth.ts`:
- remove the `xaiGrokRouterBaseUrl` import;
- stop setting `next.XAI_BASE_URL` to the Portal shim;
- retain token/auth-mode/model overlay behavior.

- [ ] **Step 5: Audit router constant/helper references before deleting them**

Run:

```bash
git grep -n "XAI_GROK_ROUTER_BASE_URL\|xaiGrokRouterBaseUrl"
```

If the only remaining references are the definitions in `lib/xaiGrokTransport.ts` and obsolete tests/docs, delete `XAI_GROK_ROUTER_BASE_URL_DEFAULT` and `xaiGrokRouterBaseUrl()` from that module. If a legitimate external/diagnostic caller still uses them, retain them but ensure `contentAiProvider` and `overlayGrokAuth` do not.

- [ ] **Step 6: Audit whether `global_fetch_strictly_public` is still required**

Search for same-host runtime fetches:

```bash
git grep -nE "fetch\([^\n]*(portal\.yousafeconsultancy\.com|market\.yousafeconsultancy\.com)|XAI_GROK_ROUTER_BASE_URL"
```

Also inspect all `portal.yousafeconsultancy.com` occurrences that participate in server-side `fetch`/request construction.

If no required Worker self-fetch remains, change:

```toml
compatibility_flags = ["nodejs_compat", "global_fetch_strictly_public"]
```

to:

```toml
compatibility_flags = ["nodejs_compat"]
```

and remove the obsolete SuperGrok self-fetch comment. If another legitimate same-host Worker fetch still requires the flag, retain it but replace the comment with the real remaining reason.

- [ ] **Step 7: Run the OAuth/self-fetch tests and verify GREEN**

```bash
npx jest tests/xai-supergrok-oauth.test.ts tests/supergrok-self-fetch-regression.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add lib/xaiSuperGrokOAuth.ts lib/xaiGrokTransport.ts tests/xai-supergrok-oauth.test.ts tests/supergrok-self-fetch-regression.test.ts wrangler.toml
git commit -m "refactor: decouple SuperGrok auth from Portal routing"
```

---

### Task 6: Run the complete regression/build gate and review the architecture boundary

**Files:**
- Review all files changed in Tasks 1-5.
- No new production behavior unless a failing gate identifies a concrete regression.

**Interfaces:**
- Acceptance boundary is the approved spec; do not add unrelated cleanup.

- [ ] **Step 1: Run the complete targeted SuperGrok suite**

```bash
npx jest \
  tests/xai-grok-server-transport.test.ts \
  tests/xai-grok-http-adapter.test.ts \
  tests/supergrok-inprocess-provider.test.ts \
  tests/xai-supergrok-oauth.test.ts \
  tests/supergrok-unauthorized-recovery.test.ts \
  tests/supergrok-522-retry.test.ts \
  tests/supergrok-self-fetch-regression.test.ts \
  tests/supergrok-configurator-health.test.ts \
  tests/supergrok-configurator-copy.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: exit 0. Any test syntax must remain ES2017-compatible.

- [ ] **Step 3: Run the full Jest suite**

```bash
npx jest --ci --runInBand
```

Expected: all suites PASS.

- [ ] **Step 4: Run the production/OpenNext build**

```bash
npm run build
```

Expected: Next.js build and `opennextjs-cloudflare build --skipNextBuild` both complete successfully.

- [ ] **Step 5: Perform a boundary/security diff review**

Inspect:

```bash
git diff main...HEAD -- \
  lib/xaiGrokServerTransport.ts \
  lib/xaiGrokTransport.ts \
  lib/xaiSuperGrokOAuth.ts \
  lib/contentAiProvider.ts \
  app/api/internal/xai-grok/'[...path]'/route.ts \
  wrangler.toml \
  tests/xai-grok-server-transport.test.ts \
  tests/xai-grok-http-adapter.test.ts \
  tests/supergrok-inprocess-provider.test.ts \
  tests/supergrok-self-fetch-regression.test.ts
```

Verify manually:
- no raw token logging;
- no route path outside `responses`, `chat/completions`, `models`;
- no internal fetch to the Portal xAI shim;
- developer keys never receive subscription CLI headers;
- 401 recovery is not a loop;
- 403 remains outside refresh recovery;
- provider retry/fallback logic was not moved into the transport;
- streaming callers stay streaming.

- [ ] **Step 6: Commit any test-only or documentation corrections required by the gates**

If the gates require fixes, commit only the concrete corrections with a focused message. If no fixes are required, do not create an empty commit.

---

### Task 7: Open the implementation PR, validate CI, merge, and verify production inference

**Files:**
- No source-file changes unless CI exposes a real issue.
- GitHub PR/deployment workflow only.

**Interfaces:**
- PR base: `main`.
- PR head: implementation branch created from the approved design/plan branch so the spec and plan travel with the code.

- [ ] **Step 1: Refresh `main` before opening the PR**

```bash
git fetch origin main
git log -1 --oneline origin/main
```

If `main` advanced beyond `2bc6ba2750efeaf050b4ffeb1756d59a65edb12b`, rebase the implementation branch and rerun Task 6 gates before opening the PR.

- [ ] **Step 2: Open a PR with explicit architecture and verification notes**

PR body must state:
- removes normal SuperGrok Portal-host self-fetch;
- shared transport owns xAI destination, CLI headers, SSE bridge, and one-time 401 replay;
- HTTP route is a thin adapter;
- Content Studio calls the transport in-process;
- 403 and developer-key 401 do not refresh OAuth;
- whether `global_fetch_strictly_public` was removed or why it remains;
- exact targeted/full test/typecheck/build results.

- [ ] **Step 3: Wait for and inspect PR CI**

Required gates from `.github/workflows/deploy.yml` are typecheck, unit tests, and production/OpenNext build. Do not merge on a red gate. If CI fails, diagnose the failing command rather than bypassing it.

- [ ] **Step 4: Request code review and inspect the final diff**

Use the `superpowers:requesting-code-review` workflow. Resolve correctness findings before merge; do not perform unrelated refactors during review.

- [ ] **Step 5: Merge through GitHub only after all required checks pass**

Record the merge commit SHA.

- [ ] **Step 6: Verify the production deployment workflow for that exact merge SHA**

Confirm:
- deploy workflow concludes successfully for the merge SHA;
- startup health passes;
- production smoke passes against the expected build ID.

Do not treat HTTP health alone as proof of SuperGrok inference.

- [ ] **Step 7: Run the authenticated Configurator SuperGrok test in production**

In the Configurator, press **Test** for the connected SuperGrok account. Success criteria:

```text
OAuth connected · inference healthy
```

The test generation itself must succeed, not merely report a stored OAuth token.

- [ ] **Step 8: Classify any remaining failure correctly**

If production still returns 401 after the shared transport performs its one forced refresh/replay, treat it as an OAuth credential/session problem and reconnect/repair credentials; do not restore Portal self-routing.

If production returns 402, treat it as product/balance exhaustion, not OAuth disconnection.

If production returns 403, preserve the no-auto-refresh policy unless new upstream evidence proves a different contract.

- [ ] **Step 9: Final acceptance check**

The work is complete only when:
- normal internal SuperGrok generation does not hit `portal.yousafeconsultancy.com/api/internal/xai-grok`;
- OAuth traffic reaches `cli-chat-proxy.grok.com` with required headers;
- developer keys reach `api.x.ai`;
- blocking response compatibility is preserved;
- one-time 401 recovery is covered and passing;
- 403 does not refresh;
- route and in-process caller share one transport implementation;
- targeted tests, full Jest, typecheck, and OpenNext build pass;
- PR CI and production deployment pass;
- authenticated Configurator inference reports healthy.
