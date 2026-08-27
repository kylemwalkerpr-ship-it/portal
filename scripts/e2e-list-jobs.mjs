/**
 * List all content studio jobs with status and content length.
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const eq = line.indexOf('=')
  if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
}

const PORTAL = 'https://portal.yousafeconsultancy.com'
const ADMIN_ID = 'user_3DDUel4TxmYmI0GaYxoKAsxzBTm'

async function getToken() {
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: ADMIN_ID, expires_in_seconds: 1200 }),
  })
  const d = await res.json()
  if (!d.token) throw new Error('Clerk token failed')
  return d.token
}

async function authenticate(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const token = await getToken()
  await page.goto(`${PORTAL}/sign-in/student?__clerk_ticket=${token}&return_to=/dashboard/admin/content`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(8000)
  return { ctx, page }
}

async function apiFetch(page, path, opts = {}) {
  return page.evaluate(async ({ path, opts }) => {
    const r = await fetch(path, { credentials: 'include', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } })
    return { status: r.status, body: await r.json().catch(() => ({ _text: 'parse failed' })) }
  }, { path, opts })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const { ctx, page } = await authenticate(browser)

  const jobsRes = await apiFetch(page, '/api/content-studio/jobs?limit=50')
  const jobs = jobsRes.body.jobs || jobsRes.body || []

  const byStatus = {}
  for (const j of jobs) {
    byStatus[j.status] = (byStatus[j.status] || 0) + 1
  }
  console.log('Status breakdown:', JSON.stringify(byStatus))

  // Check each non-merged/non-shipped job for content
  let withContent = 0
  for (const j of jobs) {
    if (j.status === 'merged' || j.status === 'shipped') continue
    const detail = await apiFetch(page, `/api/content-studio/jobs?id=${j.id}`)
    if (detail.status === 200) {
      const d = detail.body.job || detail.body
      const contentLen = (d.content || '').length
      if (contentLen > 500) {
        withContent++
        console.log(`  [${d.status}] ${d.title}: ${contentLen} chars`)
      }
    }
  }
  console.log(`\n${withContent} non-shipped jobs with content`)
  await browser.close()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
