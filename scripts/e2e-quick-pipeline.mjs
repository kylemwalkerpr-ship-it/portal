/**
 * Quick pipeline: hardcoded brief → Draft → Audit → Fix → Approve.
 * Proves the full chain works without waiting for slow brief generation.
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

async function streamToCompletion(page, path, body, maxMs = 300000) {
  return page.evaluate(async ({ path, body, maxMs }) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), maxMs)
    try {
      const r = await fetch(path, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal,
      })
      clearTimeout(timer)
      if (r.status !== 200) {
        const text = await r.text()
        return { status: r.status, error: text.slice(0, 500) }
      }
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let fullText = '', events = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              events.push(data)
              if (data.text) fullText += data.text
              if (data.type === 'done' || data.type === 'error') break
            } catch {}
          }
        }
      }
      return { status: 200, content: fullText, eventCount: events.length }
    } catch (e) {
      clearTimeout(timer)
      return { status: 0, error: e.message }
    }
  }, { path, body, maxMs })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const { ctx, page } = await authenticate(browser)

  // ═══════════════════════════════════════════════════════════════
  // STAGE 1: BRIEF — use a hardcoded brief for "K State Off Campus Housing"
  // ═══════════════════════════════════════════════════════════════
  const keyword = 'k state off campus housing'
  const region = 'US'
  console.log(`\n══ PIPELINE: ${keyword} [${region}] ══`)

  const brief = {
    suggestedH1: 'K State Off Campus Housing: Complete Guide for Kansas State Students (2026)',
    title: 'K State Off Campus Housing Guide 2026',
    primaryKeyword: keyword,
    region: 'US',
    contentType: 'article',
    h2Outline: [
      'Why Live Off Campus at K State',
      'Popular Off Campus Neighborhoods Near K State',
      'Average Rent Prices Near Manhattan Kansas',
      'How to Find Off Campus Housing at K State',
      'Lease Terms and What to Watch For',
      'Transportation and Commute Options',
      'Utilities and Internet Setup',
      'Roommate Matching Tips',
      'FAQs About K State Off Campus Housing',
    ],
    sources: [
      'https://www.k-state.edu/housing/',
      'https://www.manhattan-hs.org/',
    ],
    wordBudget: { min: 2200, target: 2500, max: 2800 },
  }
  console.log(`Brief: ${brief.suggestedH1}`)

  // ═══════════════════════════════════════════════════════════════
  // STAGE 2: DRAFT — generate the article
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══ STAGE 2: DRAFT ══')
  console.log('Generating article (streaming, up to 5 min)...')
  const draft = await streamToCompletion(page, '/api/seo-factory/generate-stream', {
    topic: keyword,
    primaryKeyword: keyword,
    region,
    contentType: 'legal_guide',
    brief,
    indexable: true,
    shipMode: 'none',
    title: brief.suggestedH1,
  }, 300000)
  console.log(`Draft status: ${draft.status}`)
  if (draft.status !== 200 || !draft.content) {
    console.log('Draft failed:', JSON.stringify(draft.error || '').slice(0, 500))
    await browser.close()
    return
  }
  const wordCount = draft.content.split(/\s+/).length
  console.log(`✅ Draft complete: ${wordCount} words, ${draft.eventCount} events`)

  // ═══════════════════════════════════════════════════════════════
  // STAGE 3: AUDIT
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══ STAGE 3: AUDIT ══')
  let auditContent = draft.content
  let shipReady = false
  for (let fixLoop = 0; fixLoop < 3; fixLoop++) {
    const audit = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'POST',
      body: JSON.stringify({
        content: auditContent, contentType: 'legal_guide',
        primaryKeyword: keyword, region, liveLinks: true,
      }),
    })
    if (audit.status !== 200) { console.log(`Audit fail: ${audit.status}`); break }
    auditContent = audit.body?.fixedContent || auditContent
    shipReady = audit.body?.shipReady
    console.log(`Score: ${audit.body?.score} | Ship: ${shipReady} | Blockers: ${(audit.body?.blockersData || []).length} | Warnings: ${(audit.body?.warningsData || []).length}`)
    if (audit.body?.blockersData?.length) {
      for (const b of audit.body.blockersData) console.log(`  ⛔ ${b.code}: ${(b.message || '').slice(0, 80)}`)
    }
    if (shipReady) break

    // Fix All
    console.log(`  Fix All...`)
    const fix = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'fix_all', content: auditContent, contentType: 'legal_guide',
        primaryKeyword: keyword, region,
        annotations: audit.body?.annotations || [],
        warnings: audit.body?.warningsData || [],
        blockers: audit.body?.blockersData || [],
      }),
    })
    if (fix.status !== 200) { console.log(`Fix fail: ${fix.status}`); break }
    auditContent = fix.body?.fixedContent || auditContent
    shipReady = fix.body?.shipReady
    console.log(`  Fix result: score=${fix.body?.score} ship=${shipReady}`)
    console.log(`  Repairs: ${(fix.body?.appliedRepairs || []).join(', ')}`)
  }

  // ═══════════════════════════════════════════════════════════════
  // STAGE 4: CREATE JOB + APPROVE
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══ STAGE 4: CREATE JOB ══')
  const jobCreate = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'POST',
    body: JSON.stringify({
      title: brief.suggestedH1, content: auditContent,
      primary_keyword: keyword, region, content_type: 'legal_guide',
    }),
  })
  console.log(`Job create: ${jobCreate.status}`)
  const jobId = jobCreate.body?.id || jobCreate.body?.job?.id
  if (!jobId) { console.log('No job ID:', JSON.stringify(jobCreate.body).slice(0, 300)); await browser.close(); return }
  console.log(`Job ID: ${jobId}`)

  // Final re-audit with jobId
  console.log('Final audit with jobId...')
  const finalAudit = await apiFetch(page, '/api/content-studio/reaudit', {
    method: 'POST',
    body: JSON.stringify({
      content: auditContent, jobId, contentType: 'legal_guide',
      primaryKeyword: keyword, region, liveLinks: true,
    }),
  })
  if (finalAudit.status === 200) {
    auditContent = finalAudit.body?.fixedContent || auditContent
    shipReady = finalAudit.body?.shipReady
    console.log(`Final audit: score=${finalAudit.body?.score} ship=${shipReady}`)
  }

  console.log('\n══ STAGE 4: APPROVE ══')
  const approval = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({ id: jobId, action: 'approve', content: auditContent }),
  })
  console.log(`Approve: ${approval.status}`)
  if (approval.status === 200) {
    console.log(`✅ APPROVED AND DEPLOYED!`)
    console.log(`   Path: ${approval.body?.ship?.path}`)
    console.log(`   URL: ${approval.body?.ship?.canonicalUrl}`)
    console.log(`   Status: ${approval.body?.ship?.status}`)
  } else {
    console.log(`❌ Failed: ${JSON.stringify(approval.body).slice(0, 500)}`)
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log('PIPELINE RESULT')
  console.log(`${'═'.repeat(60)}`)
  console.log(`Keyword: ${keyword}`)
  console.log(`Draft: ${wordCount} words`)
  console.log(`Approved: ${approval.status === 200}`)
  await browser.close()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
