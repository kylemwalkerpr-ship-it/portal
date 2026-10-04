#!/usr/bin/env node
/**
 * Wait until production actually serves the build this workflow just deployed
 * before the post-deploy smoke test runs.
 *
 * Why: right after `wrangler deploy` the edge can still hand out cached HTML
 * that references the PREVIOUS buildId, whose /_next/static/<id>/ assets were
 * already replaced. The smoke test then fails "build freshness" on attempt 1
 * and only passes on a retry (e.g. Deploy YouSafe Portal run 37149902149,
 * Oct 3 2026: "build m-G5U… referenced by HTML but _buildManifest.js → 404").
 *
 * This polls until the plain AND cache-busted portal root both reference
 * EXPECTED_BUILD_ID and that build's _buildManifest.js returns 200, on two
 * consecutive checks. It never fails the job itself: on timeout it logs a
 * warning and exits 0, leaving the smoke test (and its retries) to decide.
 *
 * Env: PROD_BASE_URL (default https://portal.yousafeconsultancy.com),
 *      EXPECTED_BUILD_ID (required; no-op without it),
 *      WAIT_FOR_BUILD_TIMEOUT_S (default 300), WAIT_FOR_BUILD_INTERVAL_S (default 10).
 */
const BASE = (process.env.PROD_BASE_URL || 'https://portal.yousafeconsultancy.com').replace(/\/+$/, '')
const EXPECTED = (process.env.EXPECTED_BUILD_ID || '').trim()
const TIMEOUT_S = Number(process.env.WAIT_FOR_BUILD_TIMEOUT_S || 300)
const INTERVAL_S = Number(process.env.WAIT_FOR_BUILD_INTERVAL_S || 10)
const UA = 'yousafe-smoke-prod/1.0 (wait-for-build)'

// Same extraction order as scripts/smoke-prod.mjs so both agree on the id.
function extractBuildId(html) {
  if (!html) return null
  const patterns = [
    /\\?"b\\?":\\?"([A-Za-z0-9_-]{10,})\\?"/,
    /buildId["']?\s*[:=]\s*["']([A-Za-z0-9_-]{10,})["']/i,
    /\/_next\/static\/([A-Za-z0-9_-]{10,})\//,
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return m[1]
  }
  return null
}

async function get(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10_000) })
  return { status: res.status, body: await res.text() }
}

async function probe() {
  const buster = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const [plain, busted, manifest] = await Promise.all([
    get(`${BASE}/`),
    get(`${BASE}/?__smoke=${buster}`),
    get(`${BASE}/_next/static/${EXPECTED}/_buildManifest.js`),
  ])
  const plainId = extractBuildId(plain.body)
  const originId = extractBuildId(busted.body)
  const ok = plainId === EXPECTED && originId === EXPECTED && manifest.status === 200
  return { ok, detail: `plain=${plainId ?? 'none'} origin=${originId ?? 'none'} manifest=${manifest.status}` }
}

if (!EXPECTED) {
  console.log('EXPECTED_BUILD_ID not set — skipping wait-for-build.')
  process.exit(0)
}

console.log(`Waiting up to ${TIMEOUT_S}s for ${BASE} to serve build ${EXPECTED}…`)
const deadline = Date.now() + TIMEOUT_S * 1000
let streak = 0
let last = 'no probe yet'
while (Date.now() < deadline) {
  try {
    const r = await probe()
    last = r.detail
    streak = r.ok ? streak + 1 : 0
    console.log(`  ${r.ok ? '✅' : '…'} ${r.detail}${r.ok ? ` (${streak}/2)` : ''}`)
    if (streak >= 2) {
      console.log(`Production serves build ${EXPECTED}; running smoke test.`)
      process.exit(0)
    }
  } catch (err) {
    streak = 0
    last = `network error: ${err.message}`
    console.log(`  … ${last}`)
  }
  await new Promise((r) => setTimeout(r, INTERVAL_S * 1000))
}
console.log(`::warning::Build ${EXPECTED} not confirmed live after ${TIMEOUT_S}s (last: ${last}); smoke test will decide.`)
process.exit(0)
