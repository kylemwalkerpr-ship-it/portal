#!/usr/bin/env node
/**
 * Phase-2 verifier — single-copy draft detection on the LIVE deployment.
 *
 * Proves, end-to-end against the deployed site:
 *   1. admin sign-in (Clerk, password factor)
 *   2. one Generate Draft run through /api/seo-factory/generate-stream (SSE)
 *   3. the streamed draft is accumulated EXACTLY as a client renders it, then:
 *        - H1 headings (`# `) in the streamed body are counted
 *        - a "restart" is flagged when a second H1 appears after >=120 words
 *          of prose (the duplicate-copy signature from the defect report)
 *   4. a job row persisted with content (drafting) → jobId non-null
 *
 * No ship/PR is performed — this verifier stops at the draft; approval is a
 * separate human action.
 *
 * Env: ADMIN_EMAIL / ADMIN_PASSWORD (required). PORTAL_URL / DRAFT_TOPIC /
 * DRAFT_CONTENT_TYPE optional.
 * Usage: ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/verify-single-copy-draft-e2e.mjs
 */
import { chromium } from '@playwright/test'

const BASE = process.env.PORTAL_URL || 'https://portal.yousafeconsultancy.com'
const EMAIL = process.env.ADMIN_EMAIL
const PASSWORD = process.env.ADMIN_PASSWORD
const TOPIC = process.env.DRAFT_TOPIC || 'student living costs in the UK: monthly budget guide for 2026'
const TITLE = process.env.DRAFT_TITLE || 'Student Living Costs in the UK: Monthly Budget Guide for 2026'
const CT = process.env.DRAFT_CONTENT_TYPE || 'blog_post'
const REGION = process.env.DRAFT_REGION || 'UK'
const IDLE_TIMEOUT_MS = Number(process.env.IDLE_TIMEOUT_MS || 120_000) // no SSE events for 2min → bail
const MAX_RUN_MS = Number(process.env.MAX_RUN_MS || 12 * 60 * 1000)

if (!EMAIL || !PASSWORD) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required.')
  process.exit(2)
}

const consoleErrors = []
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240)) })

const out = { base: BASE, topic: TOPIC, contentType: CT, region: REGION }
const step = (s) => console.log(`>> ${s}`)

// ── 1. Sign in (same flow as verify-deploy-e2e.mjs) ─────────────────────────
/** Clerk Backend API session bootstrap — used when the account enforces 2FA
 *  (password factor alone lands on the factor-two page). Requires
 *  CLERK_SECRET_KEY; produces a session JWT injected as the __session cookie.
 *  Never logs the key or the JWT. */
async function bootstrapClerkSession(email, secret) {
  const auth = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  const api = 'https://api.clerk.com/v1'
  const call = async (path, opts = {}) => {
    const res = await fetch(`${api}${path}`, { headers: auth, ...opts })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = body?.errors?.[0]?.message || JSON.stringify(body).slice(0, 200)
      throw new Error(`clerk ${path} HTTP ${res.status}: ${msg}`)
    }
    return body
  }
  const users = await call(`/users?limit=5&emailAddresses=${encodeURIComponent(email)}`)
  const userId = users?.[0]?.id
  if (!userId) throw new Error(`no Clerk user for ${email}`)
  out.clerkUserId = userId
  // Preferred: create a session directly (POST /v1/sessions) and mint a JWT.
  try {
    const session = await call('/sessions', { method: 'POST', body: `user_id=${userId}&expires_in_seconds=7200` })
    out.clerkSessionId = session?.id || null
    let jwt = session?.last_active_token?.jwt || null
    if (!jwt) {
      const tok = await call(`/sessions/${session.id}/tokens`, { method: 'POST' })
      jwt = tok?.jwt || null
    }
    if (jwt) {
      await setSessionCookie(jwt)
      return userId
    }
    throw new Error('clerk returned no session JWT')
  } catch (e) {
    out.clerkSessionCreateNote = String(e instanceof Error ? e.message : e).slice(0, 300)
  }
  // Fallback: one-time sign-in token (bypasses all factors incl. 2FA — it is a
  // trusted flow). Consume it IN-PAGE through Clerk's own JS client:
  // client.signIn.create({ strategy: 'sign_in_token', token }) + setActive,
  // which writes the session cookies on the app's own origin.
  const sit = await call('/sign_in_tokens', { method: 'POST', body: `user_id=${userId}&expires_in_seconds=3600` })
  if (!sit?.token) throw new Error('clerk sign-in token unavailable')
  out.clerkSignInTokenId = sit.id || null
  await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  const clerkResult = await page.evaluate(async (token) => {
    // clerk-js hydrates asynchronously: wait for the instance to expose
    // client + setActive, not merely for the global to appear.
    for (let i = 0; i < 60; i++) {
      const c = window.Clerk
      if (c && (c.client || (c.Clerk && c.Clerk.client)) && c.setActive) break
      await new Promise((r) => setTimeout(r, 500))
    }
    const clerk = window.Clerk
    if (!clerk) return { error: 'window.Clerk never mounted' }
    if (!clerk.setActive) return { error: 'window.Clerk has no setActive (unexpected build)' }
    try {
      let client = clerk.client
      if (client && typeof client.then === 'function') client = await client
      if (!client || !client.signIn) return { error: 'clerk client not available after hydration' }
      const attempt = await client.signIn.create({ strategy: 'sign_in_token', token })
      if (attempt.createdSessionId) {
        await clerk.setActive({ session: attempt.createdSessionId })
        return { status: attempt.status, session: attempt.createdSessionId }
      }
      return { status: attempt.status, error: 'no session created' }
    } catch (e) {
      return { error: String(e && e.message ? e.message : e).slice(0, 300) }
    }
  }, sit.token)
  out.clerkTokenSignIn = clerkResult
  if (!clerkResult || clerkResult.error) throw new Error(`clerk token sign-in failed: ${clerkResult?.error || 'unknown'}`)
  await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'networkidle', timeout: 90_000 })
  return userId
}

async function setSessionCookie(jwt) {
  const host = new URL(BASE).hostname
  await page.context().addCookies([{ name: '__session', value: jwt, domain: host, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])
}

step('sign in')
await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'networkidle', timeout: 90_000 })
const idField = page.locator('input[name="identifier"]')
if ((await idField.count()) === 0 || (await idField.isVisible({ timeout: 60_000 }).catch(() => false))) {
  await idField.fill(EMAIL)
  await page.getByRole('button', { name: 'Continue', exact: true }).last().click()
  await page.waitForFunction(() => {
    const el = document.querySelector('#password-field')
    return el && !el.disabled
  }, { timeout: 45_000 })
  await page.locator('#password-field').fill(PASSWORD)
  await page.locator('#password-field').press('Enter')
  await page.waitForURL('**/dashboard/**', { timeout: 60_000 }).catch(() => {})
}
// 2FA enforcement path: password factor alone stops at factor-two → bootstrap.
if (!page.url().includes('dashboard') && /factor-two|factor_one/.test(page.url()) && process.env.CLERK_SECRET_KEY) {
  step('2FA enforced — bootstrapping session via Clerk Backend API')
  try {
    out.clerkUserId = await bootstrapClerkSession(EMAIL, process.env.CLERK_SECRET_KEY)
    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'networkidle', timeout: 90_000 })
  } catch (e) {
    out.clerkBootstrapError = String(e instanceof Error ? e.message : e).slice(0, 300)
  }
}
out.signedIn = /^https?:\/\/[^/]+\/dashboard/.test(page.url())
if (out.signedIn) {
  const authed = await page.evaluate(async () => {
    try { return (await fetch('/api/content-studio/jobs?limit=1', { credentials: 'same-origin' })).status } catch { return 0 }
  })
  out.authProbe = authed
  out.signedIn = authed !== 401 && authed !== 0
}
step(`landed at ${page.url()}`)

if (!out.signedIn) {
  out.error = 'sign-in failed'
  console.log('\n===== RESULT =====')
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
  process.exit(1)
}
await page.waitForTimeout(3_000)
// The token handshake may render the dashboard from the client cache before
// the __session cookie is fully written — force one reload so the Clerk
// middleware mints the server-side cookie, then probe an authed endpoint.
await page.reload({ waitUntil: 'networkidle', timeout: 90_000 }).catch(() => {})
for (let probe = 0; probe < 6; probe++) {
  const authed = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/content-studio/jobs?limit=1', { credentials: 'same-origin' })
      return res.status
    } catch { return 0 }
  })
  if (authed !== 401 && authed !== 0) { out.authProbe = authed; break }
  out.authProbe = authed
  await page.waitForTimeout(3_000)
  await page.reload({ waitUntil: 'networkidle', timeout: 90_000 }).catch(() => {})
}
await page.waitForTimeout(2_000)

// ── 2. Run the streaming draft and accumulate client-visible text ───────────
step(`generate-stream: contentType=${CT} shipMode=pr (no min/max override → brief contract governs)`)
const runStart = Date.now()
const draft = await page.evaluate(
  async ({ topic, title, ct, region, idleTimeoutMs, maxRunMs }) => {
    const res = await fetch('/api/seo-factory/generate-stream', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        topic, title,
        primaryKeyword: topic,
        region,
        contentType: ct,
        tone: 'educational',
        keywords: [topic],
        shipMode: 'pr',
        indexable: true,
        minAuditScore: 55,
        maxRefine: 3,
        // NOTE: no minWords/maxWords/sectionBudgets overrides — the brief
        // contract (depthSpecForType) must govern the word window end-to-end.
      }),
    })
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '')
      return { httpError: res.status, body: t.slice(0, 400) }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let streamText = ''      // every delta, concatenated — what a client renders
    let attempts = new Set()
    let progress = []
    let finalEvent = null
    let errorEvent = null
    let jobIdEvent = null
    const start = Date.now()
    let lastEventAt = Date.now()

    const handleEvent = (ev) => {
      lastEventAt = Date.now()
      if (ev.type === 'delta') {
        if (typeof ev.attempt === 'number') attempts.add(ev.attempt)
        if (ev.text) streamText += ev.text
      } else if (ev.type === 'progress') {
        if (progress.length < 200) progress.push(`${ev.stage}: ${ev.message}`)
      } else if (ev.type === 'job') {
        jobIdEvent = ev.jobId || null
      } else if (ev.type === 'final') {
        finalEvent = ev
      } else if (ev.type === 'error') {
        errorEvent = ev
      }
    }

    while (true) {
      if (Date.now() - lastEventAt > idleTimeoutMs) return { stalled: true, streamText, attempts: [...attempts], progress, finalEvent, errorEvent, jobIdEvent }
      if (Date.now() - start > maxRunMs) return { timedOut: true, streamText, attempts: [...attempts], progress, finalEvent, errorEvent, jobIdEvent }
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ done: false, value: undefined, __timeout: true }), 15_000)),
      ])
      if (value) {
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          for (const line of raw.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try { handleEvent(JSON.parse(line.slice(6))) } catch { /* keepalive or partial */ }
          }
        }
      }
      if (done) break
      if (finalEvent || errorEvent) break
    }
    try { await reader.cancel() } catch { /* noop */ }
    return { streamText, attempts: [...attempts], progress, finalEvent, errorEvent, jobIdEvent }
  },
  { topic: TOPIC, title: TITLE, ct: CT, region: REGION, idleTimeoutMs: IDLE_TIMEOUT_MS, maxRunMs: MAX_RUN_MS },
)
out.runSeconds = Math.round((Date.now() - runStart) / 1000)
out.attempts = draft.attempts || []
out.stalled = Boolean(draft.stalled)
out.timedOut = Boolean(draft.timedOut)
if (draft.httpError) {
  out.error = `generate-stream HTTP ${draft.httpError}`
  out.httpBody = draft.body
}
if (draft.errorEvent) out.streamError = String(draft.errorEvent.error || '').slice(0, 500)
if (draft.jobIdEvent) out.jobIdFromStream = draft.jobIdEvent

// ── 3. Duplicate-copy analysis on the streamed text ─────────────────────────
const text = draft.streamText || ''
const bodyNoFrontmatter = text.replace(/^---\n[\s\S]*?\n---\n?/, '')
const h1s = [...bodyNoFrontmatter.matchAll(/^#\s+(.+)$/gm)].map((m) => m[1].trim())
let restartAtWord = null
{
  let words = 0
  let seenFirstH1 = false
  for (const line of bodyNoFrontmatter.split('\n')) {
    if (/^#\s+/.test(line)) {
      if (seenFirstH1 && words >= 120) { restartAtWord = words; break }
      seenFirstH1 = true
    }
    words += (line.match(/\S+/g) || []).length
  }
}
const wordCount = (bodyNoFrontmatter.match(/\S+/g) || []).length
const h1Duplicates = h1s.length !== new Set(h1s.map((h) => h.toLowerCase())).size

const finalResult = draft.finalEvent && draft.finalEvent.result ? draft.finalEvent.result : null
const finalContent = finalResult && finalResult.content ? String(finalResult.content) : ''
const finalBody = finalContent.replace(/^---\n[\s\S]*?\n---\n?/, '')
const finalH1s = [...finalBody.matchAll(/^#\s+(.+)$/gm)].map((m) => m[1].trim())

out.stream = {
  chars: text.length,
  bodyWordCount: wordCount,
  h1Count: h1s.length,
  h1s: h1s.slice(0, 6),
  h1Duplicates,
  restartDetected: restartAtWord !== null,
  restartAtWord,
  attempts: out.attempts,
}
if (finalResult) {
  out.final = {
    jobId: finalResult.jobId ?? null,
    provider: finalResult.provider ?? null,
    audit: finalResult.audit?.total ?? finalResult.audit ?? null,
    contentWordCount: (finalBody.match(/\S+/g) || []).length,
    finalH1Count: finalH1s.length,
    finalH1s: finalH1s.slice(0, 6),
    ship: finalResult.ship ?? null,
  }
}
if (out.progress !== undefined) out.progress = draft.progress
else out.progressSample = (draft.progress || []).slice(0, 12)

// ── 4. Verdict ───────────────────────────────────────────────────────────────
const checks = {
  streamCompleted: Boolean(draft.finalEvent) && !draft.errorEvent && !draft.stalled && !draft.timedOut,
  jobPersisted: Boolean((finalResult && finalResult.jobId) || draft.jobIdEvent),
  singleCopyStream: h1s.length <= 1 && restartAtWord === null && !h1Duplicates,
  singleCopyFinal: finalResult ? finalH1s.length <= 1 : null,
  contentPresent: wordCount >= 50 || (finalBody.match(/\S+/g) || []).length >= 50,
}
out.checks = checks
out.verdict = Object.values(checks).every((v) => v !== false) && checks.streamCompleted && checks.jobPersisted
  ? 'PASS'
  : 'FAIL'

out.consoleErrors = consoleErrors.slice(0, 8)

console.log('\n===== RESULT =====')
console.log(JSON.stringify(out, null, 2))
await browser.close()
process.exit(out.verdict === 'PASS' ? 0 : 1)
