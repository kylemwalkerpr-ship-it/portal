#!/usr/bin/env node
/**
 * smoke-prod.mjs
 *
 * One-command live health check for the deployed studio. Verifies the
 * production contract without any credentials:
 *
 *   1. PORTAL ROOT   — GET / returns 200 (text/html): the app is up.
 *   2. STUDIO GATE   — GET /dashboard/admin/content must AUTH-GATE: it
 *      redirects (307/302/308) to a sign-in URL, and that sign-in page must
 *      render 200 (not 404 / 500 / Cloudflare error). This proves the studio
 *      route is wired and protected, not misrouted.
 *   3. GSC API GUARD — GET /api/content-studio/gsc/connect must reject
 *      unauthenticated calls with 401. This is the endpoint the connect
 *      modal POSTs to, so a live 401 means the route exists and is protected.
 *
 * A single retry (1.5s apart) is made only for network-level failures so a
 * deploy that is still propagating doesn't flake the run; HTTP responses are
 * never retried.
 *
 * Usage:
 *   node scripts/smoke-prod.mjs                          # default prod URL
 *   PROD_BASE_URL=https://portal.example.com node scripts/smoke-prod.mjs
 *   pnpm smoke:prod
 *
 * Exit code: 0 when every check passes, 1 otherwise. Read-only GETs — safe
 * to run in CI or immediately after a deploy.
 */

const BASE = (process.env.PROD_BASE_URL || 'https://portal.yousafeconsultancy.com').replace(/\/+$/, '')
const STUDIO_PATH = '/dashboard/admin/content'
const GSC_CONNECT_PATH = '/api/content-studio/gsc/connect'

const results = [] // { name, ok, detail }
const UA = 'yousafe-smoke-prod/1.0'
const TIMEOUT_MS = 10_000 // fail fast if a hung deploy stalls a request (CI-safe)

async function fetchRetry(url, init) {
  let lastErr
  const withTimeout = { ...(init || {}), signal: AbortSignal.timeout(TIMEOUT_MS) }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fetch(url, withTimeout)
    } catch (err) {
      lastErr = err
      if (attempt === 1) await new Promise((r) => setTimeout(r, 1500))
    }
  }
  throw lastErr
}

/** Check 1 — portal root is up. */
async function checkRoot() {
  try {
    const res = await fetchRetry(`${BASE}/`, { redirect: 'follow', headers: { 'user-agent': UA } })
    const type = res.headers.get('content-type') || ''
    const body = await res.text()
    results.push({
      name: 'portal root',
      ok: res.status === 200 && type.includes('text/html') && body.length > 500,
      detail: `${res.status} · ${type.split(';')[0]} · ${body.length} bytes`,
    })
  } catch (err) {
    results.push({ name: 'portal root', ok: false, detail: `network error: ${err.message}` })
  }
}

/** Check 2 — studio route is auth-gated and the sign-in page renders. */
async function checkStudioGate() {
  try {
    const res = await fetchRetry(`${BASE}${STUDIO_PATH}`, {
      redirect: 'manual', // inspect the redirect instead of following it blindly
      headers: { 'user-agent': UA },
    })
    const status = res.status
    const location = res.headers.get('location') || ''
    const isRedirect = [301, 302, 303, 307, 308].includes(status)
    const gatesToSignIn = location.includes('sign-in')

    if (!isRedirect) {
      results.push({ name: 'studio auth-gate', ok: false, detail: `expected redirect, got ${status}` })
      return
    }
    if (!gatesToSignIn) {
      results.push({ name: 'studio auth-gate', ok: false, detail: `redirected to ${location}, not a sign-in URL` })
      return
    }

    // The gate itself is right — now confirm the sign-in page actually renders.
    const signIn = await fetchRetry(new URL(location, `${BASE}/`).toString(), {
      redirect: 'follow',
      headers: { 'user-agent': UA },
    })
    const type = signIn.headers.get('content-type') || ''
    const body = await signIn.text()
    const rendered = signIn.status === 200 && type.includes('text/html') && body.length > 500
    results.push({
      name: 'studio auth-gate',
      ok: rendered,
      detail: `${status} → ${location.split('?')[0]} (sign-in ${signIn.status} · ${body.length} bytes)`,
    })
  } catch (err) {
    results.push({ name: 'studio auth-gate', ok: false, detail: `network error: ${err.message}` })
  }
}

/** Check 3 — GSC connect endpoint rejects unauthenticated calls with 401. */
async function checkGscApiGuard() {
  try {
    const res = await fetchRetry(`${BASE}${GSC_CONNECT_PATH}`, {
      redirect: 'follow',
      headers: { 'user-agent': UA },
    })
    const detail = `${res.status} · ${(res.headers.get('content-type') || '').split(';')[0]}`
    if (res.status === 401) {
      results.push({ name: 'GSC connect API guard', ok: true, detail })
      return
    }
    const snippet = (await res.text()).slice(0, 120).replace(/\s+/g, ' ').trim()
    results.push({
      name: 'GSC connect API guard',
      ok: false,
      detail: `${detail} — expected 401 (unauthenticated contract)${snippet ? ` · body: ${snippet}` : ''}`,
    })
  } catch (err) {
    results.push({ name: 'GSC connect API guard', ok: false, detail: `network error: ${err.message}` })
  }
}

await checkRoot()
await checkStudioGate()
await checkGscApiGuard()

// ── Report ─────────────────────────────────────────────────────────────────
console.log(`\n=== PROD SMOKE TEST — ${BASE} ===`)
let failed = 0
for (const r of results) {
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.name.padEnd(22)} ${r.detail}`)
  if (!r.ok) failed++
}
if (failed === 0) {
  console.log(`=== ALL CHECKS PASSED (${results.length}/${results.length}) — deployment is healthy ===\n`)
  process.exit(0)
}
console.log(`=== ${failed} CHECK(S) FAILED — investigate before shipping ===\n`)
process.exit(1)
