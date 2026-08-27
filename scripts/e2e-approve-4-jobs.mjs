/**
 * End-to-end: authenticate as admin, load 4 jobs with content,
 * run POST audit → PATCH fix_all → POST re-audit → PATCH approve.
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
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: ADMIN_ID, expires_in_seconds: 1200 }),
  })
  const data = await res.json()
  if (!data.token) throw new Error('Clerk token failed: ' + JSON.stringify(data))
  return data.token
}

async function authenticate(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const token = await getToken()
  await page.goto(
    `${PORTAL}/sign-in/student?__clerk_ticket=${token}&return_to=/dashboard/admin/content`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  )
  await page.waitForTimeout(8000)
  console.log('Auth URL:', page.url())
  return { ctx, page }
}

async function apiFetch(page, path, opts = {}) {
  return page.evaluate(async ({ path, opts }) => {
    const r = await fetch(path, {
      credentials: 'include',
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    })
    return { status: r.status, body: await r.json().catch(() => ({ _text: 'parse failed' })) }
  }, { path, opts })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const { ctx, page } = await authenticate(browser)

  // 1. List all jobs
  const jobsRes = await apiFetch(page, '/api/content-studio/jobs?limit=50')
  console.log('Jobs status:', jobsRes.status)
  if (jobsRes.status !== 200) {
    console.error('Jobs failed:', JSON.stringify(jobsRes.body).slice(0, 500))
    await browser.close()
    process.exit(1)
  }
  const jobs = jobsRes.body.jobs || jobsRes.body || []
  console.log('Total jobs:', jobs.length)

  // 2. Find jobs with content (load individually)
  console.log('\nFinding jobs with content...')
  const candidates = []
  for (const j of jobs) {
    if (j.status === 'merged' || j.status === 'shipped') continue
    const detail = await apiFetch(page, `/api/content-studio/jobs?id=${j.id}`)
    if (detail.status === 200) {
      const d = detail.body.job || detail.body
      const contentLen = (d.content || '').length
      if (contentLen > 500) {
        candidates.push(d)
        console.log(`  ✓ ${d.title || d.id}: ${contentLen} chars, status=${d.status}`)
        if (candidates.length >= 4) break
      }
    }
  }

  console.log(`\nFound ${candidates.length} jobs with content`)
  if (candidates.length === 0) {
    console.log('No processable jobs. Exiting.')
    await browser.close()
    process.exit(0)
  }

  // 3. Process each job
  const results = []
  for (let i = 0; i < candidates.length; i++) {
    const job = candidates[i]
    const content = job.content
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Job ${i + 1}/${candidates.length}: ${job.title || job.id}`)
    console.log(`ID: ${job.id} | Content: ${content.length} chars | Status: ${job.status}`)
    console.log('='.repeat(60))

    // Step 1: POST audit
    console.log('\n[1/4] Audit (POST)...')
    const audit1 = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'POST',
      body: JSON.stringify({
        content,
        jobId: job.id,
        contentType: job.content_type || 'blog_post',
        primaryKeyword: job.primary_keyword || job.title,
        region: job.region || job.country,
      }),
    })
    if (audit1.status !== 200) {
      console.log('Audit failed:', audit1.status, JSON.stringify(audit1.body).slice(0, 300))
      results.push({ id: job.id, title: job.title, error: `audit_${audit1.status}` })
      continue
    }
    const score1 = audit1.body?.score
    const shipReady1 = audit1.body?.shipReady
    const blockers1 = audit1.body?.blockersData || []
    const warnings1 = audit1.body?.warningsData || []
    console.log(`Score: ${score1} | Ship-ready: ${shipReady1} | Blockers: ${blockers1.length} | Warnings: ${warnings1.length}`)
    if (blockers1.length > 0) {
      console.log('Blockers:', blockers1.map(b => b.code).join(', '))
    }

    let fixedContent = audit1.body?.fixedContent || content

    // Step 2: PATCH fix_all if not ship-ready
    if (!shipReady1) {
      console.log('\n[2/4] Fix All (PATCH)...')
      const fix = await apiFetch(page, '/api/content-studio/reaudit', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'fix_all',
          content: fixedContent,
          jobId: job.id,
          annotations: audit1.body?.annotations || [],
          contentType: job.content_type || 'blog_post',
          primaryKeyword: job.primary_keyword || job.title,
          region: job.region || job.country,
          targetUrl: job.canonical_url,
        }),
      })
      console.log('Fix status:', fix.status)
      if (fix.status === 200) {
        const fixScore = fix.body?.score
        const fixShipReady = fix.body?.shipReady
        fixedContent = fix.body?.fixedContent || fixedContent
        console.log(`Fix score: ${fixScore} | Ship-ready: ${fixShipReady}`)
      } else {
        console.log('Fix response:', JSON.stringify(fix.body).slice(0, 300))
      }
    } else {
      console.log('\n[2/4] Already ship-ready, skipping fix')
    }

    // Step 3: POST re-audit
    console.log('\n[3/4] Re-audit (POST)...')
    const audit2 = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'POST',
      body: JSON.stringify({
        content: fixedContent,
        jobId: job.id,
        contentType: job.content_type || 'blog_post',
        primaryKeyword: job.primary_keyword || job.title,
        region: job.region || job.country,
        liveLinks: true,
      }),
    })
    const score2 = audit2.body?.score
    const shipReady2 = audit2.body?.shipReady
    const blockers2 = audit2.body?.blockersData || []
    const warnings2 = audit2.body?.warningsData || []
    console.log(`Score: ${score2} | Ship-ready: ${shipReady2} | Blockers: ${blockers2.length} | Warnings: ${warnings2.length}`)
    if (blockers2.length > 0) {
      for (const b of blockers2) {
        console.log(`  ⛔ ${b.code}: ${(b.message || '').slice(0, 100)}`)
      }
    }

    // Step 4: Approve
    let approved = false
    if (shipReady2) {
      console.log('\n[4/4] Approving to main...')
      const approval = await apiFetch(page, '/api/content-studio/jobs', {
        method: 'PATCH',
        body: JSON.stringify({ id: job.id, action: 'approve' }),
      })
      console.log('Approve status:', approval.status)
      console.log('Approve body:', JSON.stringify(approval.body).slice(0, 500))
      approved = approval.status === 200
    } else {
      console.log('\n[4/4] NOT ship-ready — skipping approval')
    }

    results.push({
      id: job.id,
      title: job.title,
      score: score2,
      shipReady: shipReady2,
      approved,
      blockers: blockers2.map(b => b.code),
      warnings: warnings2.length,
    })
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`)
  console.log('FINAL SUMMARY')
  console.log('='.repeat(60))
  for (const r of results) {
    const icon = r.approved ? '✅' : r.shipReady ? '⚠️' : '❌'
    console.log(`${icon} ${r.title || r.id}`)
    console.log(`   Score: ${r.score} | Ship-ready: ${r.shipReady} | Approved: ${r.approved}`)
    if (r.blockers?.length) console.log(`   Blockers: ${r.blockers.join(', ')}`)
    if (r.warnings) console.log(`   Warnings: ${r.warnings}`)
    if (r.error) console.log(`   Error: ${r.error}`)
  }
  const approved = results.filter(r => r.approved).length
  console.log(`\n${approved}/${results.length} jobs approved to main`)

  await browser.close()
}

main().catch(e => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
