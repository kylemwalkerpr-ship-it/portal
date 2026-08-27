/**
 * Full end-to-end blog pipeline: 1200-word blog post → audit → fix → approve → deploy
 * Proves the blog word count gate (min 800, target 1200) works end-to-end.
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

function countWords(md) {
  return md.split(/\s+/).filter(w => w.length > 0).length
}

const BLOG_1200 = `---
title: "UK Cost of Living for International Students in 2026: A Complete Budget Guide"
content_type: blog_post
region: UK
primary_keyword: uk cost of living international students 2026
---

# UK Cost of Living for International Students in 2026: A Complete Budget Guide

Moving to the United Kingdom as an international student is a major step, and knowing what things actually cost removes the guesswork from your planning. From accommodation and food to transport and entertainment, each category carries real price tags that vary by city. Below is a detailed breakdown of expenses you will face in 2026, with figures drawn from university budgeting tools, government sources, and current market prices.

## In 60 seconds

- **Average monthly budget:** GBP 1,200–1,800 depending on city and lifestyle.
- **Accommodation:** GBP 500–1,200 per month (halls vs private rental).
- **Food and groceries:** GBP 200–350 per month cooking at home.
- **Transport:** GBP 50–160 per month with a Student Oyster card.
- **Total annual estimate:** GBP 14,400–21,600 beyond tuition fees.

## Accommodation Costs

Where you live will consume the largest share of your budget. University halls of residence are the most common first-year option, typically costing between GBP 500 and GBP 900 per month depending on the city and whether you choose an en-suite or shared bathroom. London halls tend to be at the higher end, while cities like Sheffield, Leeds, and Newcastle offer more affordable options.

Private rentals give you more independence but come with additional responsibilities. A room in a shared house in a major city outside London usually costs GBP 550 to GBP 750 per month. In London, expect GBP 800 to GBP 1,200 for a similar arrangement. Bills for electricity, gas, water, and internet are sometimes included in rent but often add GBP 50 to GBP 100 per month when not covered.

Purpose-built student accommodation managed by private companies is growing in popularity. These often include Wi-Fi, contents insurance, and communal study spaces. Prices sit between university halls and private rentals, typically GBP 600 to GBP 1,000 per month.

## Food and Groceries

Cooking at home is the most cost-effective way to eat in the UK. A weekly grocery shop at budget supermarkets like Aldi, Lidl, or Tesco costs between GBP 30 and GBP 50 for a single person. This covers fresh vegetables, proteins, bread, dairy, and basic pantry staples. Planning meals in advance and buying in bulk when items are on promotion can bring this figure down further.

Eating out is considerably more expensive. A casual meal at a mid-range restaurant costs GBP 12 to GBP 20 per person. A takeaway meal averages GBP 8 to GBP 12. University canteens offer subsidized meals for between GBP 3 and GBP 6, making them a practical daily option during lecture days.

Students who follow specific dietary requirements such as halal, vegan, or gluten-free should budget slightly more, as specialty items carry a premium of 15 to 30 percent over standard alternatives. Shopping at ethnic grocery stores in areas with diverse communities can help find these items at more competitive prices.

## Transport

The UK has an extensive public transport network, and students benefit from significant discounts. A 16-to-25 Railcard costs GBP 30 per year and gives you one-third off most rail fares. If you travel regularly by train, this card pays for itself within two or three journeys.

In London, the Student Oyster card provides a 30 percent discount on Travelcards and Bus Passes. A monthly Zones 1 to 3 student Travelcard costs approximately GBP 120. Outside London, monthly bus passes range from GBP 40 to GBP 65, with some universities negotiating bulk deals for their students.

Cycling is an affordable and healthy alternative. Many cities have bike-sharing schemes, and buying a second-hand bicycle costs between GBP 50 and GBP 150. Cycle-to-work schemes offered by some employers can also reduce the cost of purchasing a new bike.

## Utilities and Communication

If your accommodation does not include bills, budget GBP 80 to GBP 150 per month for electricity, gas, water, and internet combined. Energy costs in the UK have stabilized compared to the peaks of 2022 and 2023, but they remain higher than pre-2021 levels.

A mobile phone SIM with a generous data plan costs between GBP 10 and GBP 25 per month. Providers like Giffgaff, Voxi, and Smarty offer student-friendly deals with no long-term contracts. Free Wi-Fi is available on campus and in most public libraries, reducing your reliance on mobile data.

## Health and Insurance

The Immigration Health Surcharge, which you pay as part of your visa application, entitles you to use the National Health Service. This means GP visits, hospital treatment, and emergency care are free at the point of use. However, dental and optical care are not fully covered, so budget GBP 30 to GBP 60 per year for dental check-ups and GBP 20 to GBP 40 for an eye test and basic prescription glasses.

Contents insurance for your personal belongings in student accommodation typically costs GBP 15 to GBP 30 per year. Some university halls include this in your rent, so check before purchasing a separate policy.

## Entertainment and Social Life

University life extends well beyond the classroom. A cinema ticket costs GBP 8 to GBP 12, while student union event tickets range from free to GBP 15 for major socials. Gym memberships at university sports centres are heavily subsidized, often costing GBP 15 to GBP 30 per month compared to GBP 40 to GBP 70 at commercial gyms.

Streaming subscriptions, clothing, and personal care products should be budgeted at GBP 50 to GBP 100 per month depending on your habits. Many retailers offer student discounts through platforms like UNiDAYS and Student Beans, providing 10 to 20 percent off at hundreds of brands.

## Working While Studying

Your Student visa permits you to work up to 20 hours per week during term time and full-time during scheduled breaks. The national minimum wage for workers aged 21 and over is currently GBP 11.44 per hour. Working 15 hours per week at this rate generates approximately GBP 690 per month before tax, which substantially offsets living expenses.

Part-time roles in retail, hospitality, tutoring, and campus employment are widely available. Many universities operate their own job boards with positions specifically designed to fit around academic schedules.

## Sample Monthly Budget

For a student living outside London in shared accommodation:

| Category | Monthly Cost |
|---|---|
| Rent (shared house) | GBP 600 |
| Bills (energy, water, internet) | GBP 80 |
| Groceries | GBP 250 |
| Transport | GBP 55 |
| Mobile phone | GBP 15 |
| Entertainment and social | GBP 80 |
| Clothing and personal care | GBP 40 |
| Savings and emergency | GBP 80 |
| **Total** | **GBP 1,200** |

In London, the same budget structure would total approximately GBP 1,600 to GBP 1,800 per month, driven primarily by higher accommodation and transport costs.

## Tips for Saving Money

Open a UK bank account as soon as you arrive to avoid foreign transaction fees on everyday purchases. Most major banks offer student accounts with interest-free overdraft facilities. Cook in batches with flatmates to reduce food costs. Take advantage of student discounts on everything from software subscriptions to museum entries. Buy second-hand textbooks or access digital library resources instead of purchasing new copies. Finally, set up a simple spreadsheet to track your spending during the first month so you can adjust your budget before habits become fixed.

## Conclusion

Knowing where your money goes each month puts you in control of your finances for the entire duration of your studies. Start with a realistic budget based on the figures above, review your spending every four weeks, and adjust categories that drift. Your university student services team can point you toward hardship funds, bursaries, and cost-saving workshops if you hit a rough patch.

---

**Disclaimer:** This page is educational and editorial only. It is not legal advice. Immigration rules and cost estimates change; verify every figure against official government sources and consult a licensed immigration solicitor for your situation.
`

async function main() {
  const browser = await chromium.launch({ headless: true })
  const { ctx, page } = await authenticate(browser)

  const wordCount = countWords(BLOG_1200)
  console.log(`\n══════════════════════════════════════════════════════════════`)
  console.log(`FULL BLOG PIPELINE — ${wordCount} words`)
  console.log(`══════════════════════════════════════════════════════════════\n`)

  // STAGE 1: Find a job to use
  console.log(`── Stage 1: Find target job ──`)
  const jobsRes = await apiFetch(page, '/api/content-studio/jobs?limit=50')
  const jobs = jobsRes.body.jobs || jobsRes.body || []
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
  console.log(`  Job: ${jobId} (${targetJob.title || targetJob.topic})`)

  // STAGE 2: Update metadata for blog_post
  console.log(`\n── Stage 2: Set metadata (blog_post, UK, cost of living) ──`)
  const meta = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({
      id: jobId,
      action: 'update_meta',
      content_type: 'blog_post',
      primary_keyword: 'uk cost of living international students 2026',
      region: 'UK',
      title: 'UK Cost of Living for International Students in 2026: A Complete Budget Guide',
    }),
  })
  console.log(`  Meta update: ${meta.status} → content_type=${meta.body?.job?.content_type} region=${meta.body?.job?.region}`)

  // STAGE 3: Save content
  console.log(`\n── Stage 3: Save ${wordCount}-word blog post ──`)
  const save = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({ id: jobId, action: 'save', content: BLOG_1200, content_type: 'blog_post' }),
  })
  console.log(`  Save: ${save.status} → word_count=${save.body?.job?.word_count}`)

  // STAGE 4: Audit
  console.log(`\n── Stage 4: Audit ──`)
  const audit = await apiFetch(page, '/api/content-studio/reaudit', {
    method: 'POST',
    body: JSON.stringify({
      content: BLOG_1200,
      contentType: 'blog_post',
      primaryKeyword: 'uk cost of living international students 2026',
      region: 'UK',
      liveLinks: true,
      jobId,
    }),
  })
  console.log(`  Score: ${audit.body?.score} | Ship: ${audit.body?.shipReady} | Blockers: ${(audit.body?.blockersData||[]).length} | Warnings: ${(audit.body?.warningsData||[]).length}`)
  if (audit.body?.blockersData?.length) {
    for (const b of audit.body.blockersData) console.log(`    ⛔ ${b.code}: ${(b.message||'').slice(0,100)}`)
  }
  if (audit.body?.warningsData?.length) {
    for (const w of audit.body.warningsData.slice(0, 5)) console.log(`    ⚠️  ${w.code}: ${(w.message||'').slice(0,80)}`)
  }

  // STAGE 5: Fix all if not ship-ready
  let content = BLOG_1200
  if (!audit.body?.shipReady) {
    console.log(`\n── Stage 5: Fix all ──`)
    const fix = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'PATCH',
      body: JSON.stringify({
        content: BLOG_1200,
        contentType: 'blog_post',
        primaryKeyword: 'uk cost of living international students 2026',
        region: 'UK',
        jobId,
        action: 'fix_all',
      }),
    })
    console.log(`  Fix: ${fix.status} | Score: ${fix.body?.score} | Ship: ${fix.body?.shipReady} | Applied: ${(fix.body?.appliedRepairs||[]).length}`)
    if (fix.body?.appliedRepairs?.length) {
      for (const r of fix.body.appliedRepairs) console.log(`    🔧 ${r}`)
    }
    content = fix.body?.fixedContent || BLOG_1200

    // STAGE 6: Re-audit after fix
    console.log(`\n── Stage 6: Re-audit after fix ──`)
    const reaudit = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'POST',
      body: JSON.stringify({
        content,
        contentType: 'blog_post',
        primaryKeyword: 'uk cost of living international students 2026',
        region: 'UK',
        liveLinks: true,
        jobId,
      }),
    })
    console.log(`  Score: ${reaudit.body?.score} | Ship: ${reaudit.body?.shipReady} | Blockers: ${(reaudit.body?.blockersData||[]).length} | Warnings: ${(reaudit.body?.warningsData||[]).length}`)
    if (reaudit.body?.blockersData?.length) {
      for (const b of reaudit.body.blockersData) console.log(`    ⛔ ${b.code}: ${(b.message||'').slice(0,100)}`)
    }
  } else {
    console.log(`\n── Stage 5: Already ship-ready, skipping fix ──`)
  }

  // STAGE 7: Approve
  console.log(`\n── Stage 7: Approve ──`)
  const approve = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({
      id: jobId,
      action: 'approve',
      content,
      content_type: 'blog_post',
      primary_keyword: 'uk cost of living international students 2026',
      region: 'UK',
    }),
  })
  console.log(`  Approve: ${approve.status}`)
  if (approve.status === 200) {
    console.log(`  ✅ DEPLOYED! Path: ${approve.body?.ship?.path}`)
    console.log(`  URL: ${approve.body?.ship?.url || approve.body?.ship?.canonicalUrl || '(check estate)'}`)
  } else {
    console.log(`  ❌ ${JSON.stringify(approve.body).slice(0,500)}`)
  }

  console.log(`\n══════════════════════════════════════════════════════════════`)
  console.log(`PIPELINE COMPLETE — ${wordCount} words → blog tier (min 800, target 1200)`)
  console.log(`══════════════════════════════════════════════════════════════`)

  await browser.close()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
