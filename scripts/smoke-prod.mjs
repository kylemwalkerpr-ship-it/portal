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
 *      render 200 (not 404 / 500 / Cloudflare error).
 *   3. GSC API GUARD — GET /api/content-studio/gsc/connect must reject
 *      unauthenticated calls with 401.
 *   4. BUILD FRESH   — extracts the live _next buildId from two sampled
 *      pages (the portal root and the studio's sign-in page), each fetched
 *      plain and cache-busted (mismatch = the CDN is serving stale/mixed
 *      HTML), verifies the referenced build's manifest still resolves (a
 *      purged build 404s), and records the buildId so later runs can report
 *      deploy drift. Set EXPECTED_BUILD_ID to hard-assert against a known
 *      deploy (e.g. CI).
 *
 * A single retry (1.5s apart) is made only for network-level failures so a
 * deploy that is still propagating doesn't flake the run; HTTP responses are
 * never retried.
 *
 * Usage:
 *   node scripts/smoke-prod.mjs                          # default prod URL
 *   PROD_BASE_URL=https://portal.example.com node scripts/smoke-prod.mjs
 *   EXPECTED_BUILD_ID=<id> node scripts/smoke-prod.mjs   # CI hard-assert
 *   pnpm smoke:prod
 *
 * Exit code: 0 when every check passes, 1 otherwise. Read-only GETs — safe
 * to run in CI or immediately after a deploy.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = (process.env.PROD_BASE_URL || 'https://portal.yousafeconsultancy.com').replace(/\/+$/, '')
const STUDIO_PATH = '/dashboard/admin/content'
const GSC_CONNECT_PATH = '/api/content-studio/gsc/connect'
// Local baseline for deploy-drift detection (gitignored — see .gitignore).
const STATE_FILE = fileURLToPath(new URL('./.smoke-prod-state.json', import.meta.url))

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

/**
 * Extract the Next.js buildId from page HTML. App Router embeds it in the
 * RSC flight payload ("b":"<id>"), Pages Router in __NEXT_DATA__; static
 * asset paths (/_next/static/<id>/…) are the last resort. Patterns are
 * tried in order and the first plausible hit wins.
 */
function extractBuildId(html) {
  if (!html) return null
  const patterns = [
    // App Router flight payload — the RSC stream escapes quotes, so the
    // marker appears as \"b\":\"<id>\" in the raw HTML. The optional
    // backslashes cover both escaped and unescaped forms.
    /\\?"b\\?":\\?"([A-Za-z0-9_-]{10,})\\?"/,
    /buildId["']?\s*[:=]\s*["']([A-Za-z0-9_-]{10,})["']/i, // Pages Router __NEXT_DATA__
    /\/_next\/static\/([A-Za-z0-9_-]{10,})\//, // static asset path (buildIds are ≥10 chars)
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return m[1]
  }
  return null
}

/** Check 1 — portal root is up. Returns the HTML for the freshness check. */
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
    return body
  } catch (err) {
    results.push({ name: 'portal root', ok: false, detail: `network error: ${err.message}` })
    return null
  }
}

/**
 * Check 2 — studio route is auth-gated and the sign-in page renders.
 * Returns { url, html } of the rendered sign-in page (used by the
 * freshness check to sample a second page), or null on failure.
 */
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
      return null
    }
    if (!gatesToSignIn) {
      results.push({ name: 'studio auth-gate', ok: false, detail: `redirected to ${location}, not a sign-in URL` })
      return null
    }

    // The gate itself is right — now confirm the sign-in page actually renders.
    const signInUrl = new URL(location, `${BASE}/`).toString()
    const signIn = await fetchRetry(signInUrl, { redirect: 'follow', headers: { 'user-agent': UA } })
    const type = signIn.headers.get('content-type') || ''
    const body = await signIn.text()
    const rendered = signIn.status === 200 && type.includes('text/html') && body.length > 500
    results.push({
      name: 'studio auth-gate',
      ok: rendered,
      detail: `${status} → ${location.split('?')[0]} (sign-in ${signIn.status} · ${body.length} bytes)`,
    })
    return rendered ? { url: signInUrl, html: body } : null
  } catch (err) {
    results.push({ name: 'studio auth-gate', ok: false, detail: `network error: ${err.message}` })
    return null
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

/**
 * Check 4 — the deployed build is fresh, not a stale CDN cache.
 *
 * Samples TWO pages (the portal root and the studio's sign-in page), each
 * fetched twice: plain (what users receive — may be a CDN cache hit) and
 * cache-busted (forced to origin). If any sampled buildId disagrees with the
 * root-origin build, the CDN is serving stale or mixed HTML and the check
 * hard-fails. The referenced build's manifest must also resolve (a purged
 * build 404s), and the buildId is recorded so later runs report deploy drift.
 *
 * Boundary: the ?__smoke= buster detects a stale serve only when the CDN
 * includes query strings in its cache key. If a cache rule strips them, the
 * two fetches return the same entry and a stale serve goes undetected — the
 * check can miss, but can never false-fail a healthy deploy.
 *
 * Note: during a rolling deploy the edge genuinely serves mixed builds for a
 * short window — a STALE/MIXED fail right after a deploy is the check doing
 * its job; re-run once propagation completes.
 *
 * @param {string|null} plainRootHtml root page HTML from checkRoot
 * @param {{url: string, html: string}|null} signIn sign-in page from checkStudioGate
 */
async function checkBuildFreshness(plainRootHtml, signIn) {
  try {
    const buster = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const fetchHtml = async (url) => {
      const res = await fetchRetry(url, { redirect: 'follow', headers: { 'user-agent': UA } })
      return res.text()
    }

    const bustedRootHtml = await fetchHtml(`${BASE}/?__smoke=${buster}`)
    const bustedSignInHtml = signIn
      ? await fetchHtml(`${signIn.url}${signIn.url.includes('?') ? '&' : '?'}__smoke=${buster}`)
      : null

    const rootPlainId = extractBuildId(plainRootHtml)
    const rootOriginId = extractBuildId(bustedRootHtml)

    if (!rootPlainId || !rootOriginId) {
      results.push({
        name: 'build freshness',
        ok: false,
        detail: `could not extract buildId from / (plain: ${rootPlainId ?? 'none'} · origin: ${rootOriginId ?? 'none'})`,
      })
      return
    }

    // Stale/mixed serve: any sampled page × fetch disagreeing with the root
    // origin build is a hard failure.
    const mismatches = []
    if (rootPlainId !== rootOriginId) mismatches.push(`/ serves ${rootPlainId} (plain) vs ${rootOriginId} (origin)`)
    if (signIn) {
      const signInPlainId = extractBuildId(signIn.html)
      const signInOriginId = extractBuildId(bustedSignInHtml)
      if (signInPlainId && signInPlainId !== rootOriginId) mismatches.push(`sign-in (plain) ${signInPlainId}`)
      if (signInOriginId && signInOriginId !== rootOriginId) mismatches.push(`sign-in (origin) ${signInOriginId}`)
    }
    if (mismatches.length) {
      results.push({
        name: 'build freshness',
        ok: false,
        detail: `STALE/MIXED BUILD — ${mismatches.join(' · ')} (may be transient during a deploy rollout — re-run after propagation)`,
      })
      return
    }

    // The referenced build must still exist (a purged old build 404s).
    const manifest = await fetchRetry(`${BASE}/_next/static/${rootOriginId}/_buildManifest.js`, {
      redirect: 'follow',
      headers: { 'user-agent': UA },
    })
    if (manifest.status !== 200) {
      results.push({
        name: 'build freshness',
        ok: false,
        detail: `build ${rootOriginId} referenced by HTML but _buildManifest.js → ${manifest.status} (purged build — or the buildId extraction picked the wrong token?)`,
      })
      return
    }

    // Deploy-drift vs the last run — plus an optional CI hard-assert.
    let prev = null
    if (existsSync(STATE_FILE)) {
      try {
        prev = JSON.parse(readFileSync(STATE_FILE, 'utf8')).buildId
      } catch {
        prev = null // corrupt state — treat as first run
      }
    }
    const drift = prev
      ? prev === rootOriginId
        ? 'same build as last check'
        : `NEW DEPLOY LIVE (${prev} → ${rootOriginId})`
      : 'first run — recorded baseline'

    const expected = process.env.EXPECTED_BUILD_ID
    let ok = true
    let detail = `buildId ${rootOriginId} · CDN consistent (/, sign-in) · ${drift}`
    if (expected && expected !== rootOriginId) {
      ok = false
      detail = `expected buildId ${expected} (from deploy) but live serves ${rootOriginId} (may be transient during rollout)`
    }
    results.push({ name: 'build freshness', ok, detail })

    // Persist the baseline for the next run (atomic, best-effort, gitignored)
    // — only when the check actually passed, so a failed deploy-assert never
    // becomes the new baseline.
    if (ok) {
      try {
        const tmp = `${STATE_FILE}.${process.pid}.tmp`
        writeFileSync(tmp, JSON.stringify({ buildId: rootOriginId, checkedAt: new Date().toISOString() }, null, 2))
        renameSync(tmp, STATE_FILE)
      } catch {
        /* baseline persistence is best-effort */
      }
    }
  } catch (err) {
    results.push({ name: 'build freshness', ok: false, detail: `network error: ${err.message}` })
  }
}

const rootHtml = await checkRoot()
const signIn = await checkStudioGate()
await checkGscApiGuard()
await checkBuildFreshness(rootHtml, signIn)

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
