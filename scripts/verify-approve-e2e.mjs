/**
 * Full Discover→Approve verification on the shipped deployment:
 * admin login → composer (blog_post short article) → Generate Draft (SSE
 * stream) → wait for completion → Audit & Fix → Approve → read PR URL.
 *
 * Env: ADMIN_EMAIL / ADMIN_PASSWORD. DRAFT_TOPIC optional override.
 * Usage: node scripts/verify-approve-e2e.mjs
 */
import { chromium } from '@playwright/test'

const BASE = process.env.PORTAL_URL || 'https://portal.yousafeconsultancy.com'
const EMAIL = process.env.ADMIN_EMAIL || 'admin@yousafeconsultancy.com'
const PASSWORD = process.env.ADMIN_PASSWORD || ''
const TOPIC = process.env.DRAFT_TOPIC || 'student living costs in the UK: monthly budget guide for 2026'
const TITLE = 'Student Living Costs in the UK: Monthly Budget Guide for 2026'

const consoleErrors = []
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })

const out = { base: BASE, topic: TOPIC }
const step = (s) => { console.log(`\n>> ${s}`) }

async function login() {
  step('sign in')
  await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'networkidle', timeout: 90000 })
  const idField = page.locator('input[name="identifier"]')
  if (await idField.isVisible({ timeout: 60000 }).catch(() => false)) {
    await idField.fill(EMAIL)
    await page.getByRole('button', { name: 'Continue', exact: true }).last().click()
    await page.waitForFunction(() => { const el = document.querySelector('#password-field'); return el && !el.disabled }, { timeout: 45000 })
    await page.locator('#password-field').fill(PASSWORD)
    await page.locator('#password-field').press('Enter')
    await page.waitForURL('**/dashboard/**', { timeout: 60000 })
  }
  await page.waitForTimeout(6000)
  out.signedIn = page.url().includes('dashboard')
  step(`landed at ${page.url()}`)
}

async function reachComposer() {
  step('navigate to Research & Plan (composer)')
  await page.getByText('Research').first().click({ timeout: 15000 }).catch(async () => {
    await page.evaluate(() => { const el = [...document.querySelectorAll('button, [role="tab"]')].find((b) => b.innerText.includes('Research')); if (el) el.click() })
  })
  await page.waitForTimeout(2500)
}

async function fillComposer() {
  step('fill composer: topic/title/keywords/region')
  const byPh = (ph) => page.locator(`input[placeholder="${ph}"], textarea[placeholder="${ph}"]`).first()
  await byPh('What users search for').fill(TOPIC)
  await page.locator('input[placeholder^="e.g. Complete Guide"]').first().fill('UK Student Living Costs Guide')
  const kwTa = page.locator('textarea[placeholder^="e.g. uk spouse visa"]').first()
  await kwTa.fill('student living costs uk, student budget uk 2026, cost of living student uk, student accommodation costs uk')
  // region → UK
  const regionSel = page.locator('select').filter({ has: page.locator('option', { hasText: /^UK$/ }) }).first()
  await regionSel.selectOption({ label: 'UK' }).catch(() => {})
  await page.waitForTimeout(1200)
  out.fill = { topic: await byPh('What users search for').inputValue(), region: (await regionSel.inputValue().catch(() => '?')) }
  step(`fill => ${JSON.stringify(out.fill)}`)

  // Generate is gated by briefReadiness < 100 — run the REAL brief first
  step('Rebuild complete brief (engine brief, Qwen)')
  await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((x) => /rebuild complete brief/i.test(x.innerText)); if (el) el.click() })
  const readyDeadline = Date.now() + 7 * 60 * 1000
  let attempts = 0
  while (Date.now() < readyDeadline && attempts < 2) {
    await page.waitForTimeout(6000)
    const ready = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div,span')].find((x) => /Ready for Stage III|% contract complete/i.test(x.innerText))
      return el ? el.innerText.trim().slice(0, 240) : null
    })
    if (ready && /Ready for Stage III/.test(ready)) { out.briefReadiness = '100'; break }
    if (ready && !/brief generation failed|failed/i.test(ready)) out.briefReadiness = ready
    const failed = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div,span')].find((x) => /brief generation failed/i.test(x.innerText))
      return el ? el.innerText.trim().slice(0, 500) : null
    })
    if (failed && attempts < 1) {
      out.briefFailures = out.briefFailures || []
      out.briefFailures.push(failed)
      attempts++
      await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((x) => /rebuild complete brief/i.test(x.innerText)); if (el) el.click() })
    }
  }
  const gdBtn = page.getByRole('button', { name: /generate draft/i }).first()
  out.generateDisabled = await gdBtn.isDisabled().catch(() => true)
}async function generateAndWait() {
  step('Generate Draft (SSE stream)')
  const before = Date.now()
  const streamResp = page.waitForResponse((r) => r.url().includes('/api/seo-factory/generate-stream') && r.request().method() === 'POST', { timeout: 60000 }).catch(() => null)
  await page.getByRole('button', { name: /generate draft/i }).first().click({ timeout: 15000 }).catch(async () => {
    await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((b) => /generate draft/i.test(b.innerText)); if (el) el.click() })
  })
  const resp = await streamResp
  out.stream = resp ? { http: resp.status() } : null
  step(`stream start: ${out.stream ? `HTTP ${out.stream.http}` : 'NO STREAM (button likely disabled)'}`)
  // Poll the jobs API until the new drafting job (created during this run)
  // carries content; then read the SSE payload tail for the job id + errors.
  const deadline = Date.now() + (out.stream ? 10 : 3) * 60 * 1000
  let last = null
  while (Date.now() < deadline) {
    await page.waitForTimeout(8000)
    last = await page.evaluate(async (since) => {
      const res = await fetch('/api/content-studio/jobs?limit=20', { credentials: 'same-origin' })
      const body = await res.json()
      return (body.jobs || body.rows || []).map((j) => ({
        id: j.id, title: j.title, status: j.status, wc: j.word_count || (j.content ? j.content.split(/\s+/).length : 0),
        created: j.created_at, pr: j.pr_url || null, slug: j.content_path || (j.canonical_url || ''),
      })).filter((j) => new Date(j.created).getTime() >= since)
    }, before - 60 * 1000)
    const target = (last || []).find((j) => j.wc > 50 || /living cost/i.test(j.title) || /living cost/i.test(j.slug))
    if (target) { out.job = target; break }
    out.observed = last
  }
  if (!out.job && resp) {
    const tail = await resp.text().catch(() => '')
    out.sseTail = tail.slice(-600)
    const idm = tail.match(/"jobId":"([0-9a-f-]{36})"/)
    if (idm) out.jobFromStream = idm[1]
  }
  if (!out.job) out.error = 'generation did not produce a detectable job'
  step(`job: ${out.job ? `${out.job.id} · wc ${out.job.wc} · ${out.job.status}` : 'NONE (see sseTail)'}`)
}

async function auditAndApprove() {
  if (!out.job) return
  step('open job and run Audit & Fix')
  await page.evaluate(async (id) => { await fetch(`/api/content-studio/jobs?action=reaudit&id=${id}`, { method: 'PATCH', credentials: 'same-origin' }).catch(() => {}) }, out.job.id)
  // Prefer the UI button; fallback to the reaudit API for the fix
  const fixBtn = page.getByRole('button', { name: /audit.*fix|fix.*audit/i }).first()
  if (await fixBtn.isVisible({ timeout: 8000 }).catch(() => false)) { await fixBtn.click(); await page.waitForTimeout(5000) }
  const fixed = await page.evaluate(async (id) => {
    const res = await fetch('/api/content-studio/reaudit', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fix_until_gates', content: '', jobId: id }),
    }).catch(() => null)
    return res ? { http: res.status } : null
  }, out.job.id)
  out.fix = fixed

  step('Approve → track')
  await page.getByRole('button', { name: /approve/i }).first().click({ timeout: 20000 }).catch(async () => {
    await page.evaluate(async (id) => {
      const res = await fetch('/api/content-studio/jobs', {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', id }),
      })
      window.__approveResponse = await res.json()
    }, out.job.id)
  })
  // confirm PR via jobs API
  await page.waitForTimeout(6000)
  const pr = await page.evaluate(async (id) => {
    const res = await fetch('/api/content-studio/jobs?limit=1&id=' + id, { credentials: 'same-origin' })
    const body = await res.json()
    const j = (body.jobs || body.rows || []).find((x) => x.id === id) || (body.jobs || [])[0]
    return { status: j && j.status, pr: j && j.pr_url, approved: Boolean(j && (j.pr_url || j.status === 'pr_created' || j.status === 'publishing')) }
  }, out.job.id)
  out.approval = pr
  out.__approveResponse = await page.evaluate(() => window.__approveResponse || null)
}

try {
  await login()
  if (out.signedIn) {
    await reachComposer()
    await fillComposer()
    await generateAndWait()
    await auditAndApprove()
  } else {
    out.error = 'sign-in failed'
  }
} catch (err) {
  out.error = String(err instanceof Error ? err.message : err).slice(0, 400)
} finally {
  out.consoleErrors = consoleErrors.slice(0, 8)
  console.log('\n===== RESULT =====')
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}