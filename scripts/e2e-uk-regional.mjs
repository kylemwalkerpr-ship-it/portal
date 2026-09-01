/**
 * Full E2E UK regional article pipeline: Discover → Brief → Draft → Audit → Fix → Approve → Deploy
 * Tests a UK regional_from content type (student-tenant-rights-london).
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

const UK_CONTENT = `---
title: "Student Tenant Rights in London: Complete Guide for International Students ${new Date().getFullYear()}"
content_type: regional_from
region: UK
primary_keyword: student tenant rights london international students
---

# Student Tenant Rights in London: Complete Guide for International Students ${new Date().getFullYear()}

International students renting in London face a housing market that is both competitive and heavily regulated. Understanding your legal rights as a tenant is not optional — it is the difference between a smooth tenancy and a costly dispute. The UK government overhauled tenancy law with the Renters Reform Act, and London boroughs enforce additional standards on landlords who let to students. This guide covers the protections available to you, how to enforce them, and what to do when things go wrong.

## In 60 seconds

- **Tenancy type:** Most student lets are assured shorthold tenancies (ASTs) with fixed terms of 6 or 12 months.
- **Deposit protection:** Your deposit must be protected in a government-approved scheme within 30 days. Failure means you can claim 1 to 3 times the deposit back.
- **Rent increases:** Landlords can only raise rent once per year using a Section 13 notice, and you can challenge it at a tribunal.
- **Eviction:** A Section 21 notice requires 2 months minimum notice and cannot be served in the first 6 months of a tenancy.
- **Repairs:** Landlords must maintain the structure, heating, hot water, and sanitation. You can report persistent disrepair to the local council.

## Your Tenancy Agreement

The tenancy agreement is the legal contract between you and your landlord. Read every clause before signing. Standard assured shorthold tenancies include provisions for the rent amount, payment schedule, deposit, notice period, and any restrictions such as no pets or no subletting.

If you are renting a room in a shared house, you may have a lodger agreement or a joint tenancy. A joint tenancy means all tenants are jointly liable for the full rent — if one flatmate leaves, the others must cover their share. A lodger agreement gives you fewer protections because you share living space with the landlord.

Check whether the tenancy is a fixed-term or periodic. Fixed-term tenancies lock you in for the agreed period, typically September to June for student lets. Periodic tenancies run month to month and give either party the ability to end with proper notice.

## Deposit Protection

UK law requires landlords to protect your deposit in a government-authorised scheme within 30 days of receiving it. The three approved schemes are the Deposit Protection Service (DPS), MyDeposits, and the Tenancy Deposit Scheme (TDS). Your landlord must provide you with the prescribed information about which scheme they used.

If your landlord fails to protect your deposit within 30 days, you can apply to the county court for compensation of 1 to 3 times the deposit amount. This is one of the most powerful tenant protections available, and landlords who ignore it face significant financial penalties.

At the end of your tenancy, your deposit should be returned within 10 days of both parties agreeing on any deductions. Disputes about cleaning, damage, or unpaid rent are adjudicated by the deposit protection scheme at no cost to either party.

## Rent Increases and Affordability

Landlords can increase rent once per year under a periodic tenancy by serving a Section 13 notice. This notice must give you at least one month's notice and cannot take effect during a fixed term unless the agreement specifically allows it.

If you believe the proposed increase is above market rate, you can challenge it at the First-tier Tribunal (Property Chamber). The tribunal will assess the current market rent for comparable properties in your area and set the rent accordingly. Many landlords withdraw unreasonable increases when tenants exercise this right.

London rents vary significantly by borough. Average monthly rents for a room in a shared flat range from GBP 700 in outer boroughs like Barking and Dagenham to GBP 1,200 or more in zones 1 and 2. Budget for annual rent increases of 3 to 5 percent, which have been typical in the London market.

## Repairs and Property Standards

Your landlord has a legal obligation under Section 11 of the Landlord and Tenant Act 1985 to keep the structure and exterior of the property in good repair, maintain installations for water and sanitation, keep heating and hot water systems functional, and ensure electrical installations are safe.

If your landlord fails to carry out repairs after you have reported them in writing, you can contact the environmental health department at your local council. Councils can issue improvement notices and enforcement notices requiring landlords to carry out specific repairs within a set timeframe.

For serious hazards such as exposed wiring, gas leaks, or severe damp, you can request an inspection under the Housing Health and Safety Rating System (HHSRS). Councils have the power to issue emergency remedial action orders for immediate hazards.

## Eviction Protection

The Renters Reform Act abolished Section 21 no-fault evictions for new tenancies created after the Act came into force. Under the new rules, landlords must provide a valid ground for eviction, which typically means proving rent arrears, property damage, or that they intend to sell or occupy the property themselves.

For existing tenancies, Section 21 notices still apply but must meet strict requirements: the notice must give at least 2 months, the deposit must have been properly protected, and the landlord must have provided the correct prescribed information. Any procedural error can invalidate the notice.

If you receive an eviction notice, seek advice immediately from Citizens Advice, Shelter, or your university student union. There are strict time limits for challenging eviction in court, and missing a deadline can result in a possession order being granted without your input.

## Council Tax and Utility Responsibilities

Full-time students are exempt from council tax in the UK. To claim your exemption, provide your university enrollment confirmation letter to your local council. If you live with non-students, the property may still be liable for council tax, but the student discount (usually 25 to 50 percent) applies.

For utility bills, check your tenancy agreement to see whether electricity, gas, water, and internet are included in the rent. If you are responsible for paying utilities, set up accounts with the local providers at the start of your tenancy and take meter readings on moving in and out.

## Discrimination and Harassment

The Equality Act 2010 prohibits landlords from discriminating against tenants based on race, nationality, religion, gender, disability, or other protected characteristics. If a landlord refuses to rent to you because of your nationality or requires a larger deposit from international students, this may constitute unlawful discrimination.

Harassment by a landlord, including entering your property without notice, cutting off utilities, or making threatening demands, is a criminal offence under the Protection from Eviction Act 1977. Report harassment to the council's private rented sector team and contact Shelter for emergency legal advice.

## Where to Get Help

Your university student union housing advice service is the first port of call for tenancy disputes. They provide free, confidential advice and can represent you in negotiations with landlords. Citizens Advice offers free guidance on housing rights across England and Wales. Shelter operates a helpline and online chat for urgent housing issues.

The London Tenants Federation and local renter unions such as ACORN campaign for tenant rights and can provide practical support if you are facing eviction or disrepair. Your local council's environmental health department handles complaints about property standards and landlord licensing.

## Conclusion

Knowing your rights as a tenant in London protects you from unfair practices and ensures you can focus on your studies rather than housing disputes. Keep copies of all correspondence with your landlord, document the condition of the property with photographs when you move in and out, and do not hesitate to seek advice if something goes wrong. The legal protections are strong — but they only work when you use them.

---

**Disclaimer:** This page is educational and editorial only. It is not legal advice. UK housing law changes; verify every requirement against official government sources and consult a licensed solicitor for your situation.
`

async function main() {
  const browser = await chromium.launch({ headless: true })
  const { ctx, page } = await authenticate(browser)

  const topic = 'student tenant rights london international students'
  const region = 'UK'

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`UK REGIONAL ARTICLE PIPELINE — E2E LIVE`)
  console.log(`${'═'.repeat(60)}`)
  console.log(`Topic: ${topic}`)
  console.log(`Region: ${region}`)
  console.log(`Content type: regional_from`)

  // ─── Stage 0: Discover ───
  console.log(`\n══ Stage 0: DISCOVER ══`)
  const gscRes = await apiFetch(page, '/api/content-studio/gsc/suggestions', {
    method: 'POST',
    body: JSON.stringify({ region: 'UK' }),
  })
  console.log(`  GSC: ${gscRes.status}`)
  if (gscRes.body?.suggestions?.length) {
    console.log(`  Found ${gscRes.body.suggestions.length} GSC suggestions`)
    for (const s of gscRes.body.suggestions.slice(0, 3)) {
      console.log(`    • ${s.query || s.keyword || s.title} (impressions: ${s.impressions || '?'})`)
    }
  }

  const kwRes = await apiFetch(page, '/api/content-studio/suggest-keywords', {
    method: 'POST',
    body: JSON.stringify({ topic, region, contentType: 'regional_from' }),
  })
  console.log(`  Keywords: ${kwRes.status}`)

  // ─── Stage 1: Brief ───
  console.log(`\n══ Stage 1: BRIEF ══`)
  const briefRes = await apiFetch(page, '/api/content-studio/suggest-brief', {
    method: 'POST',
    body: JSON.stringify({ topic, region, contentType: 'regional_from', primaryKeyword: topic }),
  })
  console.log(`  Brief: ${briefRes.status}`)

  // ─── Stage 2: Draft ───
  console.log(`\n══ Stage 2: DRAFT ══`)
  // Find a job to repurpose
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
  console.log(`  Job: ${jobId} (${targetJob.title || targetJob.topic})`)

  // Update metadata
  await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({
      id: jobId,
      action: 'update_meta',
      content_type: 'regional_from',
      primary_keyword: topic,
      region: 'UK',
      title: 'Student Tenant Rights in London: Complete Guide for International Students ' + new Date().getFullYear(),
    }),
  })

  // Save content
  const wordCount = UK_CONTENT.split(/\s+/).filter(w => w.length > 0).length
  const save = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({ id: jobId, action: 'save', content: UK_CONTENT, content_type: 'regional_from' }),
  })
  console.log(`  Save: ${save.status} | Words: ${save.body?.job?.word_count || wordCount}`)

  // ─── Stage 3: Audit ───
  console.log(`\n══ Stage 3: AUDIT ══`)
  const audit = await apiFetch(page, '/api/content-studio/reaudit', {
    method: 'POST',
    body: JSON.stringify({
      content: UK_CONTENT,
      contentType: 'regional_from',
      primaryKeyword: topic,
      region: 'UK',
      liveLinks: true,
      jobId,
    }),
  })
  console.log(`  Score: ${audit.body?.score} | Ship: ${audit.body?.shipReady}`)
  console.log(`  Blockers: ${(audit.body?.blockersData||[]).length} | Warnings: ${(audit.body?.warningsData||[]).length}`)
  if (audit.body?.blockersData?.length) {
    for (const b of audit.body.blockersData) console.log(`    ⛔ ${b.code}: ${(b.message||'').slice(0,120)}`)
  }
  if (audit.body?.warningsData?.length) {
    for (const w of audit.body.warningsData.slice(0, 5)) console.log(`    ⚠️  ${w.code}: ${(w.message||'').slice(0,80)}`)
  }

  let content = UK_CONTENT

  // ─── Stage 4: Fix if not ship-ready ───
  if (!audit.body?.shipReady) {
    console.log(`\n══ Stage 4: FIX ALL ══`)
    const fix = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'PATCH',
      body: JSON.stringify({
        content: UK_CONTENT,
        contentType: 'regional_from',
        primaryKeyword: topic,
        region: 'UK',
        jobId,
        action: 'fix_all',
      }),
    })
    console.log(`  Fix: ${fix.status} | Score: ${fix.body?.score} | Ship: ${fix.body?.shipReady}`)
    console.log(`  Applied: ${(fix.body?.appliedRepairs||[]).length} repairs`)
    if (fix.body?.appliedRepairs?.length) {
      for (const r of fix.body.appliedRepairs.slice(0, 10)) console.log(`    🔧 ${r}`)
    }
    content = fix.body?.fixedContent || UK_CONTENT

    // ─── Stage 5: Re-audit ───
    console.log(`\n══ Stage 5: RE-AUDIT ══`)
    const reaudit = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'POST',
      body: JSON.stringify({
        content,
        contentType: 'regional_from',
        primaryKeyword: topic,
        region: 'UK',
        liveLinks: true,
        jobId,
      }),
    })
    console.log(`  Score: ${reaudit.body?.score} | Ship: ${reaudit.body?.shipReady}`)
    console.log(`  Blockers: ${(reaudit.body?.blockersData||[]).length} | Warnings: ${(reaudit.body?.warningsData||[]).length}`)
  } else {
    console.log(`\n  ✅ Already ship-ready on first audit!`)
  }

  // ─── Stage 6: Approve ───
  console.log(`\n══ Stage 6: APPROVE → DEPLOY ══`)
  const approve = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({
      id: jobId,
      action: 'approve',
      content,
      content_type: 'regional_from',
      primary_keyword: topic,
      region: 'UK',
    }),
  })
  console.log(`  Status: ${approve.status}`)
  if (approve.status === 200) {
    console.log(`  ✅ DEPLOYED!`)
    console.log(`  Path: ${approve.body?.ship?.path}`)
    console.log(`  URL: ${approve.body?.ship?.url || approve.body?.ship?.canonicalUrl}`)
    console.log(`  Host: ${approve.body?.ship?.host || '(check estate)'}`)
  } else {
    console.log(`  ❌ ${JSON.stringify(approve.body).slice(0, 500)}`)
  }

  // ─── Summary ───
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`PIPELINE COMPLETE`)
  console.log(`${'═'.repeat(60)}`)
  console.log(`Job:     ${jobId}`)
  console.log(`Topic:   ${topic}`)
  console.log(`Region:  ${region}`)
  console.log(`Type:    regional_from`)
  console.log(`Words:   ${wordCount}`)
  console.log(`Outcome: ${approve.status === 200 ? '✅ DEPLOYED' : '❌ FAILED'}`)
  if (approve.status === 200) {
    console.log(`URL:     ${approve.body?.ship?.url || approve.body?.ship?.canonicalUrl}`)
    console.log(`Path:    ${approve.body?.ship?.path}`)
  }
  console.log(`${'═'.repeat(60)}`)

  await browser.close()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
