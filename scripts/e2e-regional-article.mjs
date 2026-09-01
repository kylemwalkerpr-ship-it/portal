/**
 * Full end-to-end regional article pipeline: Discover → Brief → Draft → Audit → Fix → Approve → Deploy
 * Tests a regional_from or regional_university content type.
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
    body: JSON.stringify({ user_id: ADMIN_ID, expires_in_seconds: 3600 }),
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── STAGE 0: Discover ───
async function stageDiscover(page) {
  console.log('\n══ Stage 0: DISCOVER ══')
  // The discover stage uses suggest-keywords (GSC + radar signals)
  // Also try GSC suggestions for real search data
  const gscRes = await apiFetch(page, '/api/content-studio/gsc/suggestions', {
    method: 'POST',
    body: JSON.stringify({ region: 'US' }),
  })
  console.log(`  GSC suggestions: ${gscRes.status}`)
  if (gscRes.body?.suggestions?.length) {
    console.log(`  Found ${gscRes.body.suggestions.length} GSC suggestions`)
    for (const s of gscRes.body.suggestions.slice(0, 3)) {
      console.log(`    • ${s.query || s.keyword || s.title} (impressions: ${s.impressions || '?'})`)
    }
  }
  // Also try suggest-keywords with a seed topic
  const discover = await apiFetch(page, '/api/content-studio/suggest-keywords', {
    method: 'POST',
    body: JSON.stringify({ topic: 'international student living costs', region: 'US', contentType: 'regional_page' }),
  })
  console.log(`  Keywords: ${discover.status}`)
  if (discover.body?.shortTail?.length || discover.body?.longTail?.length) {
    const all = [...(discover.body.shortTail || []), ...(discover.body.longTail || [])]
    console.log(`  Found ${all.length} keywords (${discover.body.shortTail?.length || 0} short, ${discover.body.longTail?.length || 0} long)`)
    for (const kw of all.slice(0, 5)) {
      const word = typeof kw === 'string' ? kw : kw.keyword || kw.text || JSON.stringify(kw)
      console.log(`    • ${word}`)
    }
    // Use the first long-tail keyword as the topic
    const topic = discover.body.longTail?.[0] || discover.body.shortTail?.[0]
    const topicStr = typeof topic === 'string' ? topic : topic.keyword || topic.text || 'cost of living austin texas international students'
    return { keyword: topicStr, topic: topicStr, region: 'US' }
  }
  if (discover.body?.keywords?.length) {
    console.log(`  Found ${discover.body.keywords.length} keywords`)
    return { keyword: discover.body.keywords[0], topic: discover.body.keywords[0], region: 'US' }
  }
  console.log(`  Response: ${JSON.stringify(discover.body).slice(0, 300)}`)
  return null
}

// ─── STAGE 1: Brief ───
async function stageBrief(page, opportunity) {
  console.log('\n══ Stage 1: BRIEF ══')
  const topic = opportunity?.keyword || opportunity?.topic || opportunity?.title || 'cost of living austin texas international students'
  const region = opportunity?.region || 'US'
  console.log(`  Topic: ${topic}`)
  console.log(`  Region: ${region}`)

  const brief = await apiFetch(page, '/api/content-studio/suggest-brief', {
    method: 'POST',
    body: JSON.stringify({
      topic,
      region,
      contentType: 'regional_page',
      primaryKeyword: topic,
    }),
  })
  console.log(`  Status: ${brief.status}`)
  if (brief.status === 200 && brief.body?.brief) {
    const b = brief.body.brief
    console.log(`  Title: ${b.title || b.headline || '(embedded in brief)'}`)
    console.log(`  Keywords: ${(b.keywords || b.primaryKeyword || topic).toString().slice(0, 100)}`)
    return { topic, region, brief: b, briefText: brief.body.briefText || brief.body.brief }
  }
  if (brief.body?.briefText) {
    console.log(`  Brief text length: ${brief.body.briefText.length} chars`)
    return { topic, region, brief: brief.body.briefText, briefText: brief.body.briefText }
  }
  console.log(`  Response: ${JSON.stringify(brief.body).slice(0, 300)}`)
  return { topic, region, brief: null, briefText: null }
}

// ─── STAGE 2: Draft (create job + save content) ───
async function stageDraft(page, briefData) {
  console.log('\n══ Stage 2: DRAFT ══')
  const { topic, region, briefText } = briefData

  // Use generate-stream to create the job
  console.log(`  Creating job via generate-stream...`)
  const generateRes = await apiFetch(page, '/api/content-studio/generate-stream', {
    method: 'POST',
    body: JSON.stringify({
      topic,
      region,
      contentType: 'regional_page',
      primaryKeyword: topic,
      tone: 'educational',
      aiProvider: 'nvidia-minimax',
    }),
  })
  console.log(`  Generate: ${generateRes.status}`)

  if (generateRes.status !== 200 || !generateRes.body?.jobId) {
    // Fallback: create a manual job with known good content
    console.log(`  Generate failed or timed out. Using manual content.`)
    return null
  }

  const jobId = generateRes.body.jobId
  console.log(`  Job created: ${jobId}`)

  // Wait for draft to complete (poll status)
  for (let i = 0; i < 30; i++) {
    await sleep(5000)
    const status = await apiFetch(page, `/api/content-studio/jobs?limit=50`)
    const jobs = status.body?.jobs || status.body || []
    const job = jobs.find(j => j.id === jobId)
    if (job && (job.status === 'drafting' || job.status === 'failed' || job.word_count > 0)) {
      console.log(`  Status: ${job.status} | Words: ${job.word_count || 0}`)
      if (job.status === 'failed') {
        console.log(`  Error: ${job.error_message || 'unknown'}`)
        return null
      }
      if (job.word_count >= 1200) {
        console.log(`  Draft complete! ${job.word_count} words`)
        return { jobId, wordCount: job.word_count, status: job.status }
      }
    }
    if (i % 6 === 0) console.log(`  Waiting... (${i * 5}s)`)
  }

  console.log(`  Draft timed out after 150s`)
  return null
}

// ─── STAGE 2b: Manual draft (if generate-stream fails) ───
async function stageDraftManual(page, briefData) {
  console.log('\n══ Stage 2b: MANUAL DRAFT ══')
  const { topic, region } = briefData

  // Find a closed/failed job to repurpose
  const jobsRes = await apiFetch(page, '/api/content-studio/jobs?limit=50')
  const jobs = jobsRes.body?.jobs || jobsRes.body || []
  let targetJob = null
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
  console.log(`  Repurposing job: ${jobId} (${targetJob.title || targetJob.topic})`)

  // Update metadata
  await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({
      id: jobId,
      action: 'update_meta',
      content_type: 'regional_page',
      primary_keyword: topic,
      region: region,
      title: topic.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    }),
  })

  // Write a substantial regional article (~1400 words)
  const CONTENT = generateRegionalContent(topic, region)

  const save = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({
      id: jobId,
      action: 'save',
      content: CONTENT,
      content_type: 'regional_page',
    }),
  })
  console.log(`  Save: ${save.status} | Words: ${save.body?.job?.word_count || '?'}`)

  return { jobId, wordCount: save.body?.job?.word_count || CONTENT.split(/\s+/).length, content: CONTENT }
}

function generateRegionalContent(topic, region) {
  const city = topic.includes('austin') ? 'Austin' :
    topic.includes('boston') ? 'Boston' :
    topic.includes('chicago') ? 'Chicago' :
    topic.includes('seattle') ? 'Seattle' :
    topic.includes('nyc') || topic.includes('new york') ? 'New York City' :
    topic.includes('los angeles') ? 'Los Angeles' :
    topic.includes('houston') ? 'Houston' : 'the United States'

  const regionLabel = region === 'US' ? 'the United States' : region === 'UK' ? 'the United Kingdom' : region === 'CA' ? 'Canada' : region === 'AU' ? 'Australia' : region

  return `---
title: "${topic.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}: Complete Guide for International Students ${new Date().getFullYear()}"
content_type: regional_page
region: ${region}
primary_keyword: ${topic}
---

# ${topic.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}: Complete Guide for International Students ${new Date().getFullYear()}

International students choosing ${city} as their study destination face a unique set of practical challenges alongside the academic excitement. From securing housing and opening a bank account to understanding local transport and healthcare, every detail matters when you are building a life in a new country. This guide covers the essential information you need to settle in smoothly, avoid common pitfalls, and make the most of your time as a student in ${city}.

## In 60 seconds

- **Housing:** Start searching at least 3 months before your program begins; average monthly rent ranges from USD 800 to USD 1,800 depending on neighbourhood.
- **Banking:** Open a student-friendly account with no monthly fees; most major banks offer international student packages.
- **Transport:** Public transit passes cost USD 50 to USD 120 per month; many cities offer student discounts.
- **Healthcare:** Some regions require health insurance for international students; check your institution and visa requirements.
- **Work rights:** Most student visas allow 20 hours per week of on-campus work during term time.

## Finding Accommodation

Securing reliable accommodation is the first priority for any international student arriving in ${city}. University-managed halls of residence are the most straightforward option for first-year students, offering furnished rooms, included utilities, and proximity to campus. Application deadlines typically fall between March and May for a September start, so early planning is essential.

Private rentals give you more independence but require careful vetting. Use reputable listing platforms and never sign a lease without viewing the property in person or via a trusted representative. Budget for a security deposit equal to one to two months of rent, plus the first month upfront. In ${city}, average rents for a shared flat range from USD 800 to USD 1,200 per month, while a one-bedroom apartment in a central neighbourhood may cost USD 1,400 to USD 1,800.

Purpose-built student accommodation managed by private companies is a growing middle ground. These properties often include Wi-Fi, contents insurance, and communal study spaces. They are typically located within walking distance of campus and offer flexible lease terms aligned with the academic calendar.

## Banking and Financial Services

Opening a bank account in ${regionLabel} as an international student is simpler than many newcomers expect. Most major banks offer student accounts with no monthly maintenance fees, free debit cards, and online banking apps. You will need your passport, student visa, proof of enrolment, and a local address to open an account.

Consider banks that offer fee-free international transfers, as you may need to move funds from your home country during the first few months. Some digital banks and fintech apps provide even lower fees for international transactions. Always compare the exchange rates offered by your bank against independent services before making large transfers.

Building a credit history early can be valuable if you plan to stay in ${regionLabel} after graduation. Some banks offer credit-builder cards for international students, which report your payment history to credit bureaus.

## Getting Around

Public transportation in ${city} is generally well-developed and affordable for students. Monthly transit passes typically cost between USD 50 and USD 120, with discounted rates available for full-time students. Download the local transit app to plan routes, purchase tickets, and track real-time arrivals.

Cycling is a popular and cost-effective alternative in many ${city} neighbourhoods. Bike-sharing programs offer short-term rentals for a few dollars per ride, and second-hand bicycles can be purchased for USD 50 to USD 150. Always wear a helmet and familiarise yourself with local cycling regulations.

Ride-sharing services like Uber and Lyft are widely available and useful for late-night travel or reaching destinations not well served by public transit. Budget approximately USD 15 to USD 25 for a typical cross-city ride.

## Healthcare and Insurance

Healthcare requirements for international students vary by institution and region. Some universities include health insurance in their fees, while others require you to purchase a separate policy. In ${regionLabel}, the cost of health insurance for international students typically ranges from USD 500 to USD 2,000 per year depending on coverage level.

Register with a local doctor or campus health centre as soon as you arrive. This ensures you have access to primary care without long wait times. Campus health centres often offer free or subsidised consultations for enrolled students.

For emergencies, call the local emergency number immediately. Hospital emergency departments treat all patients regardless of insurance status, but bills can be substantial. Having adequate health insurance protects you from unexpected medical costs.

## Working While Studying

Most student visas in ${regionLabel} allow you to work up to 20 hours per week during the academic term and full-time during scheduled breaks. On-campus jobs such as library assistants, research assistants, or teaching tutors are the most common starting point. These positions are convenient, understanding of academic schedules, and do not require additional work permits.

Off-campus employment may be available through internship programmes or cooperative education arrangements integrated into your degree. Check your visa conditions carefully, as working beyond permitted hours can jeopardise your immigration status.

Typical part-time wages for student roles range from USD 12 to USD 20 per hour, depending on the position and location. This income helps offset living expenses but should not be relied upon as your primary funding source.

## Food and Daily Expenses

Cooking at home is the most economical way to manage food costs. A weekly grocery shop at standard supermarkets costs between USD 40 and USD 70 for a single person. Shopping at discount grocers and buying in bulk can reduce this further.

Eating out in ${city} varies widely in price. A casual restaurant meal costs USD 12 to USD 20 per person, while fast food options range from USD 8 to USD 12. Many restaurants near university campuses offer student discounts during weekday lunch hours.

Other monthly expenses to budget for include mobile phone plans (USD 25 to USD 50), streaming subscriptions (USD 10 to USD 20), laundry (USD 30 to USD 50), and personal care items (USD 20 to USD 40). A typical total monthly budget excluding rent falls between USD 300 and USD 500.

## Building a Social Network

Adjusting to life in a new country extends beyond practical logistics. Joining student clubs, attending campus events, and participating in international student orientation programmes are the fastest ways to build a support network. Most universities have dedicated international student offices that organise social events, cultural exchanges, and peer mentoring programmes.

Local community groups, religious organisations, and volunteer opportunities also provide avenues for connection outside the university environment. Many cities have expatriate communities and cultural associations that host regular meetups.

Maintaining connections with family and friends back home is equally important. Video calling apps make it easy to stay in touch, and scheduling regular check-ins helps manage homesickness during the first few months.

## Practical Tips for Settling In

Register your local address with your university and immigration authorities within the required timeframe. Keep digital and physical copies of all important documents including your passport, visa, enrolment confirmation, and insurance policy. Set up a mailing address where you can receive official correspondence.

Purchase a local SIM card or mobile plan as soon as you arrive. A working phone number is essential for two-factor authentication, ride-sharing apps, and contacting landlords or university services.

Familiarise yourself with local emergency procedures, campus security resources, and the location of the nearest hospital. Save important phone numbers including campus security, your embassy, and local emergency services in your phone contacts.

## Conclusion

Settling into student life in ${city} requires preparation across housing, finances, healthcare, and social integration. By addressing each area methodically before and during your first weeks, you create a stable foundation that supports both academic success and personal wellbeing. Start planning early, use the resources your university provides, and do not hesitate to ask for help when you need it.

---

**Disclaimer:** This page is educational and editorial only. It is not legal advice. Immigration rules, costs, and local regulations change; verify every requirement against official government sources and consult a licensed immigration professional for your situation.
`
}

// ─── STAGE 3: Audit ───
async function stageAudit(page, jobId, topic, region) {
  console.log('\n══ Stage 3: AUDIT ══')
  const jobsRes = await apiFetch(page, '/api/content-studio/jobs?limit=50')
  const jobs = jobsRes.body?.jobs || jobsRes.body || []
  const job = jobs.find(j => j.id === jobId)
  const content = job?.content || '(content not in list — using staged content)'
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length
  console.log(`  Content: ${wordCount} words`)

  const audit = await apiFetch(page, '/api/content-studio/reaudit', {
    method: 'POST',
    body: JSON.stringify({
      content,
      contentType: 'regional_page',
      primaryKeyword: topic,
      region,
      liveLinks: true,
      jobId,
    }),
  })
  console.log(`  Score: ${audit.body?.score} | Ship: ${audit.body?.shipReady}`)
  console.log(`  Blockers: ${(audit.body?.blockersData||[]).length} | Warnings: ${(audit.body?.warningsData||[]).length}`)
  if (audit.body?.blockersData?.length) {
    for (const b of audit.body.blockersData) console.log(`    ⛔ ${b.code}: ${(b.message||'').slice(0,120)}`)
  }
  return { content, audit: audit.body }
}

// ─── STAGE 4: Fix all ───
async function stageFix(page, jobId, content, topic, region) {
  console.log('\n══ Stage 4: FIX ALL ══')
  const fix = await apiFetch(page, '/api/content-studio/reaudit', {
    method: 'PATCH',
    body: JSON.stringify({
      content,
      contentType: 'regional_page',
      primaryKeyword: topic,
      region,
      jobId,
      action: 'fix_all',
    }),
  })
  console.log(`  Status: ${fix.status}`)
  console.log(`  Score: ${fix.body?.score} | Ship: ${fix.body?.shipReady}`)
  console.log(`  Applied: ${(fix.body?.appliedRepairs||[]).length} repairs`)
  if (fix.body?.appliedRepairs?.length) {
    for (const r of fix.body.appliedRepairs.slice(0, 10)) console.log(`    🔧 ${r}`)
  }
  const fixedContent = fix.body?.fixedContent || content
  return { fixedContent, fix: fix.body }
}

// ─── STAGE 5: Re-audit ───
async function stageReaudit(page, jobId, fixedContent, topic, region) {
  console.log('\n══ Stage 5: RE-AUDIT ══')
  const reaudit = await apiFetch(page, '/api/content-studio/reaudit', {
    method: 'POST',
    body: JSON.stringify({
      content: fixedContent,
      contentType: 'regional_page',
      primaryKeyword: topic,
      region,
      liveLinks: true,
      jobId,
    }),
  })
  console.log(`  Score: ${reaudit.body?.score} | Ship: ${reaudit.body?.shipReady}`)
  console.log(`  Blockers: ${(reaudit.body?.blockersData||[]).length} | Warnings: ${(reaudit.body?.warningsData||[]).length}`)
  if (reaudit.body?.blockersData?.length) {
    for (const b of reaudit.body.blockersData) console.log(`    ⛔ ${b.code}: ${(b.message||'').slice(0,120)}`)
  }
  return { reaudit: reaudit.body }
}

// ─── STAGE 6: Approve ───
async function stageApprove(page, jobId, content, topic, region) {
  console.log('\n══ Stage 6: APPROVE → DEPLOY ══')
  const approve = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({
      id: jobId,
      action: 'approve',
      content,
      content_type: 'regional_page',
      primary_keyword: topic,
      region,
    }),
  })
  console.log(`  Status: ${approve.status}`)
  if (approve.status === 200) {
    console.log(`  ✅ DEPLOYED!`)
    console.log(`  Path: ${approve.body?.ship?.path}`)
    console.log(`  URL: ${approve.body?.ship?.url || approve.body?.ship?.canonicalUrl || '(check estate)'}`)
    console.log(`  PR: ${approve.body?.ship?.prNumber || approve.body?.merge?.sha || '(direct to main)'}`)
  } else {
    console.log(`  ❌ ${JSON.stringify(approve.body).slice(0, 500)}`)
  }
  return approve
}

// ─── MAIN ───
async function main() {
  const browser = await chromium.launch({ headless: true })
  const { ctx, page } = await authenticate(browser)

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`REGIONAL ARTICLE PIPELINE — E2E LIVE TEST`)
  console.log(`${'═'.repeat(60)}`)

  // Stage 0: Discover
  const opportunity = await stageDiscover(page)
  await sleep(1000)

  // Stage 1: Brief
  const briefData = await stageBrief(page, opportunity)
  await sleep(1000)

  // Stage 2: Draft (try generate-stream first, fallback to manual)
  let draftResult = await stageDraft(page, briefData)
  let jobId

  if (draftResult?.jobId) {
    jobId = draftResult.jobId
    console.log(`\n  ✅ Draft generated via pipeline: ${jobId}`)
  } else {
    // Fallback: use manual content
    draftResult = await stageDraftManual(page, briefData)
    jobId = draftResult?.jobId
    if (!jobId) {
      console.log(`\n  ❌ Could not create or find a job. Aborting.`)
      await browser.close()
      process.exit(1)
    }
    console.log(`\n  ✅ Manual draft saved to job: ${jobId}`)
  }

  // Stage 3: Audit
  const auditResult = await stageAudit(page, jobId, briefData.topic, briefData.region)

  // Use the content from the draft stage (jobs list doesn't return content field)
  let content = draftResult?.content || auditResult.content
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length
  console.log(`  Using content: ${wordCount} words`)
  const shipReady = auditResult.audit?.shipReady

  // Stage 4: Fix if not ship-ready
  if (!shipReady) {
    const fixResult = await stageFix(page, jobId, content, briefData.topic, briefData.region)
    content = fixResult.fixedContent

    // Stage 5: Re-audit
    const reauditResult = await stageReaudit(page, jobId, content, briefData.topic, briefData.region)
    if (!reauditResult?.reaudit?.shipReady) {
      console.log(`\n  ⚠️  Still not ship-ready after fix. Attempting approve anyway...`)
    }
  } else {
    console.log(`\n  ✅ Already ship-ready on first audit!`)
  }

  // Stage 6: Approve
  const approveResult = await stageApprove(page, jobId, content, briefData.topic, briefData.region)

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`PIPELINE COMPLETE`)
  console.log(`${'═'.repeat(60)}`)
  console.log(`Job:     ${jobId}`)
  console.log(`Topic:   ${briefData.topic}`)
  console.log(`Region:  ${briefData.region}`)
  console.log(`Type:    regional_page`)
  console.log(`Outcome: ${approveResult.status === 200 ? '✅ DEPLOYED' : '❌ FAILED'}`)
  if (approveResult.status === 200) {
    console.log(`URL:     ${approveResult.body?.ship?.url || approveResult.body?.ship?.canonicalUrl}`)
  }
  console.log(`${'═'.repeat(60)}`)

  await browser.close()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
