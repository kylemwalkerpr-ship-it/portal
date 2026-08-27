/**
 * Run real jobs: fix → re-audit → approve. 3 fix loops max per job.
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
  console.log('Auth:', page.url())
  return { ctx, page }
}

async function apiFetch(page, path, opts = {}) {
  return page.evaluate(async ({ path, opts }) => {
    const r = await fetch(path, { credentials: 'include', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } })
    return { status: r.status, body: await r.json().catch(() => ({ _text: 'parse failed' })) }
  }, { path, opts })
}

async function processJob(page, job, maxFixLoops = 3) {
  let content = job.content
  const meta = { contentType: job.content_type || 'blog_post', primaryKeyword: job.primary_keyword || job.title, region: job.region || job.country, targetUrl: job.canonical_url, jobId: job.id }

  for (let loop = 1; loop <= maxFixLoops; loop++) {
    console.log(`  Loop ${loop}: Audit...`)
    const audit = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'POST',
      body: JSON.stringify({ ...meta, content, liveLinks: true }),
    })
    if (audit.status !== 200) { console.log(`  Audit fail: ${audit.status}`); return { approved: false, error: `audit_${audit.status}` } }

    const { score, shipReady, blockersData = [], warningsData = [] } = audit.body || {}
    content = audit.body?.fixedContent || content
    console.log(`  Score: ${score} | Ship: ${shipReady} | Blockers: ${blockersData.length} | Warnings: ${warningsData.length}`)

    if (shipReady) {
      const approval = await apiFetch(page, '/api/content-studio/jobs', {
        method: 'PATCH',
        body: JSON.stringify({ id: job.id, action: 'approve', content }),
      })
      console.log(`  Approve: ${approval.status}`)
      if (approval.status === 200) { console.log(`  ✅ Approved! PR: ${approval.body?.ship?.path || 'deployed'}`); return { approved: true, score } }
      const errMsg = approval.body?.error || ''
      console.log(`  Approve rejected: ${errMsg.slice(0, 200)}`)
      if (loop === maxFixLoops) return { approved: false, score, error: 'approve_rejected' }
      continue
    }

    console.log(`  Fix All...`)
    const fix = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'PATCH',
      body: JSON.stringify({ ...meta, action: 'fix_all', content, annotations: audit.body?.annotations || [], warnings: warningsData, blockers: blockersData }),
    })
    if (fix.status !== 200) { console.log(`  Fix fail: ${fix.status}`); return { approved: false, error: `fix_${fix.status}` } }
    content = fix.body?.fixedContent || content
    console.log(`  Fix result: score=${fix.body?.score} ship=${fix.body?.shipReady}`)

    if (fix.body?.shipReady) {
      const approval = await apiFetch(page, '/api/content-studio/jobs', {
        method: 'PATCH',
        body: JSON.stringify({ id: job.id, action: 'approve', content }),
      })
      console.log(`  Approve after fix: ${approval.status}`)
      if (approval.status === 200) { console.log(`  ✅ Approved! PR: ${approval.body?.ship?.path || 'deployed'}`); return { approved: true, score: fix.body?.score } }
      const errMsg = approval.body?.error || ''
      console.log(`  Approve rejected: ${errMsg.slice(0, 200)}`)
      if (loop === maxFixLoops) return { approved: false, score: fix.body?.score, error: 'approve_rejected' }
    }
  }
  return { approved: false, error: 'max_loops' }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const { ctx, page } = await authenticate(browser)

  const jobsRes = await apiFetch(page, '/api/content-studio/jobs?limit=50')
  const jobs = jobsRes.body.jobs || jobsRes.body || []
  console.log(`Jobs: ${jobs.length}`)

  // Find jobs with content (prefer failed/drafting over merged/closed)
  const candidates = []
  for (const j of jobs) {
    if (j.status === 'merged' || j.status === 'shipped') continue
    const detail = await apiFetch(page, `/api/content-studio/jobs?id=${j.id}`)
    if (detail.status === 200) {
      const d = detail.body.job || detail.body
      if ((d.content || '').length > 500) {
        candidates.push(d)
        console.log(`  ✓ ${d.title}: ${(d.content||'').length} chars [${d.status}]`)
        if (candidates.length >= 4) break
      }
    }
  }

  console.log(`\nProcessing ${candidates.length} jobs\n`)
  const results = []
  for (let i = 0; i < candidates.length; i++) {
    console.log(`${'━'.repeat(50)}`)
    console.log(`Job ${i+1}: ${candidates[i].title || candidates[i].id}`)
    const r = await processJob(page, candidates[i])
    results.push({ title: candidates[i].title, ...r })
    console.log()
  }

  console.log(`${'═'.repeat(50)}`)
  console.log('SUMMARY')
  for (const r of results) {
    console.log(`${r.approved ? '✅' : '❌'} ${r.title} — score: ${r.score || '-'}`)
    if (!r.approved) console.log(`   ${r.error}`)
  }
  console.log(`\n${results.filter(r=>r.approved).length}/${results.length} approved`)
  await browser.close()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
