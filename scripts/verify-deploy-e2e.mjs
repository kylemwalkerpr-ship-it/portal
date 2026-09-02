/**
 * Verify the shipped deploy end-to-end via an authenticated admin browser
 * session (headless Playwright):
 *   1. sign in (Clerk /sign-in/student, password factor)
 *   2. Discover surfaces load + engine KPI strip + console-error capture
 *   3. RUN_ENGINE=1 → run the DEPLOYED engine (planner, Qwen pin) through
 *      the admin API, then read the desk back.
 *
 * Credentials from env: ADMIN_EMAIL / ADMIN_PASSWORD (never committed).
 * Usage: node scripts/verify-deploy-e2e.mjs   (or RUN_ENGINE=1 node …)
 */
import { chromium } from '@playwright/test'

const BASE = process.env.PORTAL_URL || 'https://portal.yousafeconsultancy.com'
const EMAIL = process.env.ADMIN_EMAIL || 'admin@yousafeconsultancy.com'
const PASSWORD = process.env.ADMIN_PASSWORD || ''

const consoleErrors = []
const failedRequests = []

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240)) })
page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url().slice(0, 140)}`))

const out = { base: BASE, signedIn: false }

try {
  await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'networkidle', timeout: 90000 })
  out.landed = page.url()

  const idField = page.locator('input[name="identifier"]')
  if (await idField.count() === 0 || (await idField.isVisible({ timeout: 60000 }).catch(() => false))) {
    await idField.fill(EMAIL)
    await page.getByRole('button', { name: 'Continue', exact: true }).last().click()
    await page.waitForFunction(() => {
      const el = document.querySelector('#password-field')
      return el && !el.disabled
    }, { timeout: 45000 })
    await page.locator('#password-field').fill(PASSWORD)
    await page.locator('#password-field').press('Enter')
    await page.waitForURL('**/dashboard/**', { timeout: 60000 }).catch(() => {})
    out.signedIn = page.url().includes('dashboard')
  } else {
    out.signedIn = page.url().includes('dashboard')
  }

  await page.waitForTimeout(9000) // engine status + realtime settle

  const bodyText = await page.evaluate(() => document.body.innerText)
  out.workPlanSeen = /What the search landscape says to do next|Open opportunities/i.test(bodyText)
  const plans = bodyText.match(/(\d+(?:\.\d+)?k?)\s*plans?/i)
  out.plansKPI = plans ? plans[1] : null
  const voice = bodyText.match(/([\d.]+\s*%)(?=[^%\n]*?(?:LLM|voice|share of voice))/i)
  out.llmVoiceKPI = voice ? voice[1] : null

  if (process.env.RUN_ENGINE === '1') {
    const run = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/seo-engine/plan', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: 'visa', country: 'US', limit: 6, draftBriefs: false, aiProvider: 'entrim-qwen-27b' }),
        })
        const body = await res.json()
        return { http: res.status, ok: body.ok || false, plans: Array.isArray(body.plans) ? body.plans.length : (body.count ?? null), error: body.error || null }
      } catch (e) { return { error: String(e).slice(0, 200) } }
    })
    out.engineRun = run
    await page.waitForTimeout(4000)
    const desk = await page.evaluate(async () => {
      const res = await fetch('/api/seo-engine/plan?limit=6', { credentials: 'same-origin' })
      const body = await res.json()
      const rows = (body.plans || []).filter((r) => r.primary_term)
      return {
        http: res.status,
        total: body.total ?? rows.length,
        top: rows.slice(0, 6).map((r) => ({
          term: r.primary_term, stage: r.stage, country: r.country,
          compliance: r.compliance_score, action: r.action_type || null,
          rev: r.expected_revenue ? r.expected_revenue.usdPerMonth : null,
        })),
      }
    })
    out.engineDesk = desk
  }
} catch (err) {
  out.error = String(err instanceof Error ? err.message : err).slice(0, 500)
} finally {
  out.consoleErrors = consoleErrors.slice(0, 10)
  out.failedRequests = failedRequests.filter((r) => !r.includes('google')).slice(0, 6)
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}