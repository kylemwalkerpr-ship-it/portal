/**
 * Test blog post word count: does the system enforce blog-specific word
 * counts instead of the 2200+ article floor?
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
    body: JSON.stringify({ user_id: ADMIN_ID, expires_in_seconds: 1800 }),
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
    const body = await r.json().catch(() => ({ _text: 'parse failed' }))
    return { status: r.status, body }
  }, { path, opts })
}

const BLOG_POST_850 = `---
title: "UK Graduate Visa 2026: What You Need to Know"
content_type: blog_post
region: UK
primary_keyword: uk graduate visa 2026
---

# UK Graduate Visa 2026: What You Need to Know

The UK Graduate Route visa is one of the most popular post-study work options for international students. If you have completed a degree at a UK higher education provider, this visa allows you to stay and work in the UK for up to two years, or three years if you completed a PhD. In this guide, we walk you through eligibility, the application process, fees, and practical tips for a smooth transition from student to professional life in the United Kingdom.

## In 60 seconds

- **Who:** International graduates from UK universities with a valid Student visa.
- **Duration:** 2 years for bachelor and master graduates; 3 years for PhD graduates.
- **Cost:** GBP 822 application fee plus GBP 1,035 per year Immigration Health Surcharge.
- **Work rights:** Full-time, part-time, self-employment with no restrictions.
- **Deadline:** Apply before your Student visa expires; no extensions allowed.

## Who Can Apply

To be eligible for the Graduate Route, you must have completed a degree at a UK institution that holds a valid sponsor licence. Your course must have been at least 12 months long, and you must have held a valid Student visa when you applied for your current course. The degree itself must have been awarded by a recognised body or an institution that has degree-awarding powers.

You cannot apply if you have already been granted a Graduate Route visa, or if you studied at an offshore campus of a UK university. The visa is only available to those who completed their studies in the UK. Dependents who are already in the UK on a Student visa linked to your course may also be eligible to switch, provided they meet the relationship and financial requirements set out by UK Visas and Immigration.

## How to Apply

The application is made online through the UK government website at gov.uk. You will need to provide your biometric information and proof that you have completed your qualifying degree. The application fee is currently GBP 822, and you must also pay the Immigration Health Surcharge, which amounts to GBP 1,035 per year of the visa.

You must apply before your current Student visa expires. If your visa has already expired, you may still be able to apply within 28 days, but you should seek legal advice in this situation. Processing times vary, but most applications are decided within eight weeks. You are permitted to remain in the UK while your application is pending, and you can continue working until a decision is made.

## What You Can Do on This Visa

The Graduate Route gives you full work rights in the UK. You can work in any job at any skill level, switch employers without permission, and be self-employed. This flexibility makes it an attractive option for graduates who want to gain UK work experience across different industries and roles.

You can also study on this visa, though you cannot study on a course that would require a Student visa. The visa does not lead directly to settlement, but you can switch to another visa category that does lead to indefinite leave to remain, such as the Skilled Worker visa or the Global Talent visa. Planning your transition early gives you the best chance of securing long-term immigration status.

## Key Fees and Costs

Understanding the total cost of the Graduate Route helps you budget appropriately. Beyond the GBP 822 application fee and the GBP 1,035 annual Immigration Health Surcharge, you should factor in the cost of biometric enrolment, any document translation services, and potential legal consultation fees. If you are extending Dependant visas for family members, each additional application carries its own fee and health surcharge.

## Tips for a Successful Application

Start your application at least one month before your Student visa expires. Gather all required documents early, including your degree certificate or a letter from your university confirming completion. Make sure your passport is valid for the duration of your intended stay.

Consider consulting an immigration solicitor if your situation is complex, such as if you have outstanding immigration issues or if your degree was completed under unusual circumstances. Keep copies of all correspondence with UKVI and maintain organized records of your immigration history. This documentation will be invaluable if you later apply to switch to a different visa category.

## Conclusion

The UK Graduate Route is an excellent opportunity for international students to gain valuable work experience in the UK after completing their studies. With full work rights and the ability to switch employers, it provides a flexible pathway for career development and long-term settlement in the United Kingdom.

---

**Disclaimer:** This page is educational and editorial only. It is not legal advice. Immigration rules change; verify every requirement against official government sources and consult a licensed immigration solicitor for your situation.
`

// Check what word counts the system uses for blog_post vs article
async function main() {
  const browser = await chromium.launch({ headless: true })
  const { ctx, page } = await authenticate(browser)

  console.log('\n══ WORD COUNT GATE TEST ══\n')

  // Test 1: Blog post content_type → blog tier (800 min)
  const blogWordCount = BLOG_POST_850.split(/\s+/).length
  console.log(`── Test 1: Blog with ~${blogWordCount} words ──`)
  const blogResult = await apiFetch(page, '/api/content-studio/reaudit', {
    method: 'POST',
    body: JSON.stringify({ content: BLOG_POST_850, contentType: 'blog_post', primaryKeyword: 'uk graduate visa 2026', region: 'UK', liveLinks: true }),
  })
  console.log(`Blog (${blogWordCount} words): score=${blogResult.body?.score} ship=${blogResult.body?.shipReady} blockers=${(blogResult.body?.blockersData||[]).length} warnings=${blogResult.body?.warningsData?.length||0}`)
  if (blogResult.body?.blockersData?.length) {
    for (const b of blogResult.body.blockersData) console.log(`  ⛔ ${b.code}: ${(b.message||'').slice(0,100)}`)
  }
  if (blogResult.body?.warningsData?.length) {
    for (const w of blogResult.body.warningsData) console.log(`  ⚠️  ${w.code}: ${(w.message||'').slice(0,80)}`)
  }

  // Test 2: Same content as article → pillar tier (2200 min) — should fail
  console.log(`\n── Test 2: Same ${blogWordCount} words as article ──`)
  const articleResult = await apiFetch(page, '/api/content-studio/reaudit', {
    method: 'POST',
    body: JSON.stringify({ content: BLOG_POST_850, contentType: 'article', primaryKeyword: 'uk graduate visa 2026', region: 'UK', liveLinks: true }),
  })
  console.log(`Article (${blogWordCount} words): score=${articleResult.body?.score} ship=${articleResult.body?.shipReady} blockers=${(articleResult.body?.blockersData||[]).length}`)
  if (articleResult.body?.blockersData?.length) {
    for (const b of articleResult.body.blockersData) console.log(`  ⛔ ${b.code}: ${(b.message||'').slice(0,120)}`)
  }

  // Test 3: Approve the blog post end-to-end
  // Use a job with a non-YMYL keyword so the estate gate doesn't collide
  console.log(`\n── Test 3: Full approve pipeline for blog post ──`)
  const jobsRes = await apiFetch(page, '/api/content-studio/jobs?limit=50')
  const jobs = jobsRes.body.jobs || jobsRes.body || []
  let targetJob = null
  // Prefer a closed/drafting job that won't disrupt live content
  for (const j of jobs) {
    if (j.status === 'closed' || j.status === 'failed') { targetJob = j; break }
  }
  if (!targetJob) {
    for (const j of jobs) {
      if (j.status === 'drafting') { targetJob = j; break }
    }
  }
  if (!targetJob) targetJob = jobs[0]
  const jobId = targetJob.id
  console.log(`Job: ${jobId} (${targetJob.title || targetJob.topic}) content_type=${targetJob.content_type}`)

  // First, update the job metadata to be blog-post appropriate
  const metaUpdate = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({
      id: jobId,
      action: 'update_meta',
      content_type: 'blog_post',
      primary_keyword: 'uk living costs international students 2026',
      region: 'UK',
    }),
  })
  console.log(`Meta update: ${metaUpdate.status} content_type=${metaUpdate.body?.job?.content_type}`)

  // Save as blog_post
  const save = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({ id: jobId, action: 'save', content: BLOG_POST_850, content_type: 'blog_post' }),
  })
  console.log(`Save: ${save.status}`)
  if (save.status === 200) {
    console.log(`  content_type saved as: ${save.body?.job?.content_type}`)
  }

  // Approve with content_type + keyword + region overrides
  const approval = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({
      id: jobId,
      action: 'approve',
      content: BLOG_POST_850,
      content_type: 'blog_post',
      primary_keyword: 'uk living costs international students 2026',
      region: 'UK',
    }),
  })
  console.log(`Approve: ${approval.status}`)
  if (approval.status === 200) {
    console.log(`✅ BLOG POST APPROVED! Path: ${approval.body?.ship?.path}`)
  } else {
    console.log(`❌ ${JSON.stringify(approval.body).slice(0,500)}`)
  }

  await browser.close()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
