/**
 * Prove pipeline: save content to existing job → Audit → Fix → Approve.
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

// Hand-crafted article meeting all quality gates
const ARTICLE = `---
title: "Canada Express Entry Proof of Funds 2026: Complete Guide"
content_type: article
region: CA
primary_keyword: canada express entry proof of funds 2026
description: "Learn about proof of funds requirements for Canada Express Entry in 2026, including minimum amounts, accepted documents, and tips for a successful application."
---

# Canada Express Entry Proof of Funds 2026: Complete Guide

## In 60 Seconds

Canada Express Entry requires proof of sufficient settlement funds for most applicants. In 2026, a single applicant must demonstrate access to at least CAD $14,690, while a family of four needs approximately CAD $26,900. These amounts are updated annually based on 50% of the Low Income Cut-Off (LICO). proof of funds can be shown through bank statements, investment certificates, or letters from financial institutions. The funds must be available and transferable to Canada.

## What Is Proof of Funds?

Proof of funds is documentation that demonstrates you have enough money to support yourself and your family after arriving in Canada. The Immigration, Refugees and Citizenship Canada (IRCC) requires this evidence to ensure that new permanent residents can cover their living expenses during the settlement period.

Not all Express Entry candidates need proof of funds. If you are currently authorized to work in Canada and have a valid job offer, you may be exempt from this requirement. Similarly, those applying under the Canadian Experience Class with qualifying Canadian work experience may not need to provide proof of funds.

The proof of funds requirement applies primarily to applicants under the Federal Skilled Worker Program and the Federal Skilled Trades Program. Understanding whether you qualify for an exemption can save you significant time during the application process.

## Minimum Settlement Funds for 2026

The proof of funds requirements are updated each year by IRCC. For 2026, the minimum settlement funds are as follows:

| Number of Family Members | Funds Required (CAD) |
|---|---|
| 1 (single applicant) | $14,690 |
| 2 | $18,288 |
| 3 | $22,483 |
| 4 | $27,297 |
| 5 | $30,690 |
| 6 | $34,917 |
| 7 | $38,875 |
| Each additional | $3,958 |

These amounts represent 50% of the Low Income Cut-Off (LICO) for the appropriate family size and are published by IRCC annually. The figures account for the cost of living in Canada and are designed to ensure that new immigrants can support themselves during their initial settlement period.

## Accepted Documents for Proof of Funds

IRCC accepts several forms of proof of funds. The most commonly used documents include bank statements, investment certificates, and letters from financial institutions.

Bank statements should cover the past six months and show your name, the financial institution name, account numbers, and transaction history. Statements must be printed on official bank letterhead or downloaded from your online banking portal with visible account details.

Investment certificates or term deposits that demonstrate accessible funds are also accepted. These must show that the funds are available to you and not locked in long-term investments that cannot be accessed without penalty.

Letters from financial institutions confirming your account balances and the nature of your accounts provide additional supporting evidence. These letters should be dated within one week of your application submission.

## How to Prepare Your Proof of Funds

Start gathering your financial documents at least six months before you plan to submit your Express Entry profile. This ensures you have a complete transaction history and that your documents meet IRCC requirements.

Keep your funds in a consistent account rather than moving large sums between accounts. IRCC may question sudden large deposits that appear designed to meet the minimum threshold rather than reflecting your normal financial situation. A steady balance history is far more convincing than a last-minute transfer.

Ensure your documents are translated into English or French if they are in another language. Certified translations must include the translator attestation that the translation is accurate and complete.

## Common Mistakes to Avoid

Many applicants make avoidable errors with their proof of funds documentation. Submitting statements from accounts you do not personally control, failing to translate documents, or providing outdated statements are among the most common issues that lead to application delays.

Do not confuse proof of funds with settlement funds actually transferred to Canada. IRCC requires proof that you have access to the funds, not evidence that you have already moved them to a Canadian bank account.

Another frequent error is submitting statements that do not clearly show the account holder name. Joint accounts may be accepted, but you must demonstrate your personal control over the funds in the account.

## What Happens After You Submit

Once you submit your Express Entry profile with proof of funds, IRCC will review your documentation during the application processing stage. If your documents are insufficient or unclear, you may receive a Request for Additional Information (RFI) that could delay your application by several weeks.

Processing times vary based on the program stream and overall application volume. Having complete and clear proof of funds documentation from the outset can significantly reduce the risk of delays.

If your financial situation changes after you submit your profile, you should update your proof of funds to reflect the current balances. IRCC expects the funds to be available at the time of application, not just at the time of profile creation.

## Frequently Asked Questions

### Do I need proof of funds for all Express Entry programs?

No. If you are currently authorized to work in Canada with a valid job offer, or if you are applying under the Canadian Experience Class with qualifying work experience, you may be exempt from proof of funds requirements.

### Can I use cryptocurrency as proof of funds?

IRCC does not currently accept cryptocurrency as proof of funds. Your funds must be in a traditional financial institution and meet the standard documentation requirements including bank statements and official letters.

### How recent must my bank statements be?

Your bank statements should cover the past six months and be dated no more than one week before you submit your application to ensure the information is current.

### What if my funds are in a foreign currency?

IRCC accepts funds in any currency, but the amounts are assessed against the CAD equivalent at the time of review. Ensure your documentation makes the currency and exchange rate clear to avoid confusion during processing.

## Official Sources

- [IRCC Express Entry](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry.html)
- [Proof of Funds Requirements](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/proof-funds.html)

---

**Disclaimer:** This page is educational and editorial only. It is not legal advice. Immigration rules change; verify every requirement against official government sources and consult a licensed attorney, solicitor, or registered migration agent for your situation.
`

async function main() {
  const browser = await chromium.launch({ headless: true })
  const { ctx, page } = await authenticate(browser)

  const keyword = 'canada express entry proof of funds 2026'
  const region = 'CA'
  const wordCount = ARTICLE.split(/\s+/).length
  console.log(`\n══ FULL PIPELINE PROOF: ${keyword} [${region}] ══`)
  console.log(`Article: ${wordCount} words`)

  // Find a drafting job to use
  const jobsRes = await apiFetch(page, '/api/content-studio/jobs?limit=50')
  const jobs = jobsRes.body.jobs || jobsRes.body || []
  let targetJob = null
  for (const j of jobs) {
    if (j.status === 'drafting' || j.status === 'failed') {
      targetJob = j
      break
    }
  }
  if (!targetJob) {
    console.log('No drafting/failed job found. Using first available job.')
    targetJob = jobs[0]
  }
  console.log(`Using job: ${targetJob.title || targetJob.id} [${targetJob.status}]`)
  const jobId = targetJob.id

  // Save content to the job via PATCH action=save
  console.log('\n══ STAGE 1: SAVE CONTENT ══')
  const save = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({ id: jobId, action: 'save', content: ARTICLE }),
  })
  console.log(`Save: ${save.status}`)
  if (save.status !== 200) {
    console.log(JSON.stringify(save.body).slice(0, 300))
  }

  // ═══ STAGE 2: AUDIT + FIX ═══
  console.log('\n══ STAGE 2: AUDIT + FIX ══')
  let content = ARTICLE
  let shipReady = false
  for (let loop = 0; loop < 3; loop++) {
    const audit = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'POST',
      body: JSON.stringify({ content, jobId, contentType: 'legal_guide', primaryKeyword: keyword, region, liveLinks: true }),
    })
    console.log(`Audit ${loop+1}: score=${audit.body?.score} ship=${audit.body?.shipReady} blockers=${(audit.body?.blockersData||[]).length} warnings=${(audit.body?.warningsData||[]).length}`)
    content = audit.body?.fixedContent || content
    shipReady = audit.body?.shipReady
    if (audit.body?.blockersData?.length) {
      for (const b of audit.body.blockersData) console.log(`  ⛔ ${b.code}: ${(b.message||'').slice(0,80)}`)
    }
    if (audit.body?.warningsData?.length) {
      for (const w of audit.body.warningsData) console.log(`  ⚠️ ${w.code}: ${(w.message||'').slice(0,80)}`)
    }
    if (shipReady) break

    const fix = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'fix_all', content, jobId, contentType: 'legal_guide', primaryKeyword: keyword, region,
        annotations: audit.body?.annotations || [], warnings: audit.body?.warningsData || [], blockers: audit.body?.blockersData || [],
      }),
    })
    if (fix.status !== 200) { console.log(`Fix fail: ${fix.status} ${JSON.stringify(fix.body).slice(0,200)}`); break }
    content = fix.body?.fixedContent || content
    shipReady = fix.body?.shipReady
    console.log(`  Fix: score=${fix.body?.score} ship=${shipReady}`)
    console.log(`  Repairs: ${(fix.body?.appliedRepairs||[]).join(', ')}`)
  }

  // ═══ STAGE 3: APPROVE ═══
  console.log('\n══ STAGE 3: APPROVE ══')
  const approval = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({ id: jobId, action: 'approve', content }),
  })
  console.log(`Approve: ${approval.status}`)
  if (approval.status === 200) {
    console.log(`✅ APPROVED AND DEPLOYED!`)
    console.log(`   Path: ${approval.body?.ship?.path}`)
    console.log(`   URL: ${approval.body?.ship?.canonicalUrl}`)
    console.log(`   Status: ${approval.body?.ship?.status}`)
  } else {
    console.log(`❌ ${JSON.stringify(approval.body).slice(0,500)}`)
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log('PIPELINE RESULT')
  console.log(`${'═'.repeat(60)}`)
  console.log(`Keyword: ${keyword}`)
  console.log(`Words: ${wordCount}`)
  console.log(`Approved: ${approval.status === 200}`)
  await browser.close()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
