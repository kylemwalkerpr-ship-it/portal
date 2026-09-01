import { chromium } from '@playwright/test'
const BASE = 'https://portal.yousafeconsultancy.com'
const email = process.env.PORTAL_EMAIL
const password = process.env.PORTAL_PASSWORD
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.goto(`${BASE}/sign-in/admin?return_to=${encodeURIComponent('/dashboard/admin/content')}`, { waitUntil: 'domcontentloaded' })
await page.locator('.cl-signIn-root input[name="identifier"]').fill(email)
await page.locator('.cl-signIn-root').getByRole('button', { name: /^continue$/i }).click()
await page.locator('.cl-signIn-root input[name="password"]:not([disabled])').waitFor()
await page.locator('.cl-signIn-root input[name="password"]:not([disabled])').fill(password)
await page.locator('.cl-signIn-root').getByRole('button', { name: /^continue$/i }).click()
await page.waitForURL((u) => !u.pathname.includes('/sign-in'), { timeout: 45_000 })
const res = await page.request.get(`${BASE}/api/content-studio/jobs`)
const json = await res.json()
const jobs = json.jobs || json.items || json.data || []
const arr = Array.isArray(jobs) ? jobs : []
const slim = arr.slice(0, 12).map((j) => ({
  id: j.id,
  status: j.status,
  type: j.content_type,
  topic: j.topic || j.title,
  provider: j.ai_provider || j.provider,
  words: j.word_count,
  score: j.audit_score || j.seo_score,
  err: (j.error_message || '').slice(0, 160),
  url: j.canonical_url || j.pr_url,
  updated: j.updated_at,
}))
console.log(JSON.stringify({ http: res.status(), keys: Object.keys(json), n: arr.length, slim }, null, 2))
await browser.close()
