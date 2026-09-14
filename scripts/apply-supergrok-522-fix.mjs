import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(path, 'utf8')
}

function write(path, content) {
  fs.writeFileSync(path, content)
}

function replaceOnce(path, before, after) {
  const source = read(path)
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`Missing expected text in ${path}: ${before.slice(0, 120)}`)
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one match in ${path}: ${before.slice(0, 120)}`)
  }
  write(path, source.slice(0, first) + after + source.slice(first + before.length))
}

// 1) Cloudflare-supported repair for Worker -> own Custom Domain fetches.
replaceOnce(
  'wrangler.toml',
  'compatibility_flags = ["nodejs_compat"]',
  '# SuperGrok OAuth inference intentionally enters the Portal-owned HTTP shim on\n# this same Custom Domain so the shim can translate subscription SSE into the\n# existing blocking JSON contract. Cloudflare otherwise returns 522 when a\n# Custom-Domain Worker fetches its own hostname.\ncompatibility_flags = ["nodejs_compat", "global_fetch_strictly_public"]',
)

// 2) 522 is a transient Cloudflare transport failure. Retry it even though the
// friendly diagnostic contains "timed out"; keep 524/upstream timeouts as the
// existing no-retry class.
const providerPath = 'lib/contentAiProvider.ts'
const noRetryBlock = `function isNoRetryProviderError(value: unknown): boolean {\n  const message = value instanceof Error ? value.message : String(value || '')\n  return /\\b524\\b|gateway timeout|upstream.*timeout|timed out/i.test(message) || isDailyQuotaError(message)\n}\n`
replaceOnce(
  providerPath,
  noRetryBlock,
  `${noRetryBlock}\n/** Cloudflare 522 from the SuperGrok self-host transport is transient.\n * Check it before the generic \"timed out\" no-retry rule because the\n * operator-facing 522 diagnostic intentionally contains that phrase. */\nexport function isRetryableProviderFailure(value: unknown): boolean {\n  const message = value instanceof Error ? value.message : String(value || '')\n  if (/\\b522\\b/.test(message)) return true\n  if (isNoRetryProviderError(message)) return false\n  return /\\b(429|502|503|504|524|529)\\b|UNAVAILABLE|overload|high.demand|rate.?limit|gateway.timeout|ResourceExhausted|empty content|empty response/i.test(message)\n}\n`,
)
replaceOnce(
  providerPath,
  "return /\\b(429|503|524|529)\\b|overload|high[ ._-]?demand|rate[ ._-]?limit|too many requests|capacity|aborted|timed out|gateway timeout|upstream.*timeout|fetch failed|econnreset|etimedout|socket hang up|network error|Function id .* not found|Specified function in account .* is not found/i.test(message)",
  "return /\\b(429|502|503|504|522|524|529)\\b|overload|high[ ._-]?demand|rate[ ._-]?limit|too many requests|capacity|aborted|timed out|gateway timeout|upstream.*timeout|fetch failed|econnreset|etimedout|socket hang up|network error|Function id .* not found|Specified function in account .* is not found/i.test(message)",
)
replaceOnce(
  providerPath,
  "const retryable = /\\b(502|503|504|524|529)\\b|UNAVAILABLE|overload|high.demand|rate.?limit|gateway.timeout|ResourceExhausted|empty content|empty response/i.test(msg)",
  'const retryable = isRetryableProviderFailure(msg)',
)
replaceOnce(
  providerPath,
  "if (!retryable || attempt >= maxAttempts || /Too many subrequest/i.test(msg) || isNoRetryProviderError(msg)) { console.warn(`[contentAi] ${name} non-retryable: ${msg.slice(0,120)}`); throw e }",
  "if (!retryable || attempt >= maxAttempts || /Too many subrequest/i.test(msg)) { console.warn(`[contentAi] ${name} non-retryable: ${msg.slice(0,120)}`); throw e }",
)

// 3) Model OAuth connection and operational inference as separate states.
const oauthPath = 'lib/xaiSuperGrokOAuth.ts'
replaceOnce(
  oauthPath,
  "  clientConfigured: boolean\n}",
  "  clientConfigured: boolean\n  operationalState?: SuperGrokOperationalState\n}\n\nexport type SuperGrokOperationalState =\n  | 'disconnected'\n  | 'connected-unverified'\n  | 'healthy'\n  | 'degraded'\n\nexport function superGrokOperationalState(input: {\n  connected: boolean\n  probeOk: boolean | null\n}): SuperGrokOperationalState {\n  if (!input.connected) return 'disconnected'\n  if (input.probeOk === true) return 'healthy'\n  if (input.probeOk === false) return 'degraded'\n  return 'connected-unverified'\n}",
)
replaceOnce(
  oauthPath,
  "    clientConfigured: Boolean(xaiOAuthClientId()),\n  }",
  "    clientConfigured: Boolean(xaiOAuthClientId()),\n    operationalState: superGrokOperationalState({ connected, probeOk: null }),\n  }",
)

// 4) Configurator: say OAuth is connected, not that inference is proven healthy.
const panelPath = 'components/design/ai-key-vault-panel.tsx'
replaceOnce(
  panelPath,
  "  error?: string\n}",
  "  error?: string\n  operationalState?: 'disconnected' | 'connected-unverified' | 'healthy' | 'degraded'\n}",
)
replaceOnce(
  panelPath,
  "        setNote({ ok: true, text: 'SuperGrok connected. Grok is now the studio fallback.' })",
  "        setNote({ ok: true, text: 'SuperGrok OAuth connected. Run Test to verify live inference before relying on Grok.' })",
)
replaceOnce(
  panelPath,
  `                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>`,
  `                  {grokOAuth?.connected && (\n                    <div style={{ fontSize: 9.5, fontWeight: 700, color: probing?.startsWith('ok') ? C.green : probing?.startsWith('failed') || probing === 'request failed' ? C.red : C.violet, marginBottom: 6 }}>\n                      OAuth connected · {probing?.startsWith('ok')\n                        ? 'inference healthy'\n                        : probing?.startsWith('failed') || probing === 'request failed'\n                          ? 'inference degraded — see test result below'\n                          : 'inference unverified — press Test'}\n                    </div>\n                  )}\n                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>`,
)

// 5) Align regression tests with the supported Cloudflare fix and truthful UI.
write('tests/supergrok-self-fetch-regression.test.ts', `import { readFileSync } from 'node:fs'\n\ndescribe('SuperGrok Cloudflare self-host transport', () => {\n  it('enables public same-host fetch compatibility for the Portal Worker', () => {\n    const wrangler = readFileSync('wrangler.toml', 'utf8')\n    expect(wrangler).toMatch(/compatibility_flags\\s*=\\s*\\[[^\\]]*global_fetch_strictly_public/)\n  })\n})\n`)
write('tests/supergrok-configurator-copy.test.ts', `import { readFileSync } from 'node:fs'\n\ndescribe('SuperGrok configurator status copy', () => {\n  it('separates OAuth connection from live inference health', () => {\n    const source = readFileSync('components/design/ai-key-vault-panel.tsx', 'utf8')\n    expect(source).toContain('OAuth connected ·')\n    expect(source).toContain('inference unverified — press Test')\n    expect(source).toContain('inference healthy')\n    expect(source).toContain('inference degraded — see test result below')\n  })\n})\n`)

// The earlier exploratory route test would require a live inference call every
// time the Configurator loads, wasting subscription capacity. The existing
// explicit Test button is the correct health probe surface.
for (const path of [
  'tests/supergrok-configurator-health-route.test.ts',
  'tests/.gitkeep-supergrok',
  'docs/debug/supergrok-522-root-cause.md',
  'docs/debug/.gitkeep',
  'docs/debug/README.md',
  'docs/debug/ci-note.md',
  'docs/debug/red-phase.md',
  'docs/debug/red-phase-2.md',
]) {
  if (fs.existsSync(path)) fs.rmSync(path)
}

// One-shot patch infrastructure removes itself in the implementation commit.
for (const path of [
  'scripts/apply-supergrok-522-fix.mjs',
  '.github/workflows/apply-supergrok-522-fix.yml',
]) {
  if (fs.existsSync(path)) fs.rmSync(path)
}

console.log('Applied SuperGrok 522 transport, retry, and configurator health fix')
