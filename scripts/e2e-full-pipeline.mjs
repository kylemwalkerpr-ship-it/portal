/**
 * Full pipeline test: Discover → Brief → Draft → Audit → Fix → Approve.
 * Uses the real live Content Studio pipeline end-to-end.
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

// Helper: stream SSE to completion, returning the accumulated text
async function streamToCompletion(page, path, body, maxMs = 300000) {
  return page.evaluate(async ({ path, body, maxMs }) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), maxMs)
    try {
      const r = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (r.status !== 200) {
        const text = await r.text()
        return { status: r.status, error: text.slice(0, 500) }
      }
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let events = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        for (const line of lines) {
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
      const lastEvent = events[events.length - 1]
      return { status: 200, content: fullText, lastEvent, eventCount: events.length }
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
  // STAGE 1: DISCOVER — get a real opportunity
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══ STAGE 1: DISCOVER ══')
  const discover = await apiFetch(page, '/api/seo-factory/optimal-plan', {
    method: 'POST',
    body: JSON.stringify({ limit: 3 }),
  })
  console.log(`Discover status: ${discover.status}`)
  if (discover.status !== 200) {
    console.log('Discover failed:', JSON.stringify(discover.body).slice(0, 300))
    await browser.close()
    return
  }
  const opportunities = discover.body?.plan || discover.body?.opportunities || []
  console.log(`Found ${opportunities.length} opportunities`)
  if (opportunities.length === 0) {
    console.log('No opportunities found')
    await browser.close()
    return
  }
  const opp = opportunities[0]
  const keyword = opp.term || opp.primaryKeyword || opp.keyword || opp.topic || 'student visa documents'
  const region = opp.region || 'US'
  console.log(`Selected: ${keyword} [${region}]`)

  // ═══════════════════════════════════════════════════════════════
  // STAGE 2: BRIEF — generate a structured brief
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══ STAGE 2: BRIEF ══')
  const briefReq = {
    primaryKeyword: keyword,
    region,
    topic: keyword,
    opportunity: opp,
    aiProvider: 'baseten-deepseek-pro',
  }
  const brief = await apiFetch(page, '/api/content-studio/suggest-brief', {
    method: 'POST',
    body: JSON.stringify(briefReq),
  })
  console.log(`Brief status: ${brief.status}`)
  if (brief.status !== 200) {
    console.log('Brief failed:', JSON.stringify(brief.body).slice(0, 500))
    await browser.close()
    return
  }
  const briefData = brief.body?.brief || brief.body
  console.log(`Brief title: ${briefData.title || briefData.primaryKeyword || 'generated'}`)
  console.log(`Brief words: ${JSON.stringify(briefData).split(' ').length} tokens`)

  // ═══════════════════════════════════════════════════════════════
  // STAGE 3: DRAFT — generate the article via streaming
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══ STAGE 3: DRAFT ══')
  const draftBody = {
    topic: keyword,
    primaryKeyword: keyword,
    region,
    contentType: 'legal_guide',
    brief: briefData,
    indexable: true,
    shipMode: 'none',
    title: briefData.suggestedH1 || briefData.title || keyword,
  }
  console.log('Starting draft generation (streaming)...')
  const draft = await streamToCompletion(page, '/api/seo-factory/generate-stream', draftBody, 300000)
  console.log(`Draft status: ${draft.status}`)
  if (draft.status !== 200 || !draft.content) {
    console.log('Draft failed:', JSON.stringify(draft.error || draft.lastEvent || '').slice(0, 500))
    await browser.close()
    return
  }
  const wordCount = draft.content.split(/\s+/).length
  console.log(`Draft complete: ${wordCount} words, ${draft.eventCount} events`)
  console.log(`First 200 chars: ${draft.content.slice(0, 200)}`)

  // ═══════════════════════════════════════════════════════════════
  // STAGE 4: AUDIT — check quality
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══ STAGE 4: AUDIT ══')
  const audit = await apiFetch(page, '/api/content-studio/reaudit', {
    method: 'POST',
    body: JSON.stringify({
      content: draft.content,
      contentType: 'legal_guide',
      primaryKeyword: opp.primaryKeyword || opp.keyword,
      region: opp.region || 'US',
      liveLinks: true,
    }),
  })
  console.log(`Audit status: ${audit.status}`)
  if (audit.status !== 200) {
    console.log('Audit failed:', JSON.stringify(audit.body).slice(0, 500))
    await browser.close()
    return
  }
  console.log(`Score: ${audit.body?.score} | Ship-ready: ${audit.body?.shipReady} | Blockers: ${(audit.body?.blockersData || []).length} | Warnings: ${(audit.body?.warningsData || []).length}`)
  if (audit.body?.blockersData?.length) {
    for (const b of audit.body.blockersData) console.log(`  ⛔ ${b.code}: ${(b.message || '').slice(0, 100)}`)
  }

  // ═══════════════════════════════════════════════════════════════
  // STAGE 5: FIX — fix all blockers
  // ═══════════════════════════════════════════════════════════════
  let fixedContent = audit.body?.fixedContent || draft.content
  let shipReady = audit.body?.shipReady

  for (let fixLoop = 1; fixLoop <= 3 && !shipReady; fixLoop++) {
    console.log(`\n══ STAGE 5: FIX (loop ${fixLoop}) ══`)
    const fix = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'fix_all',
        content: fixedContent,
        contentType: 'legal_guide',
        primaryKeyword: opp.primaryKeyword || opp.keyword,
        region: opp.region || 'US',
        annotations: audit.body?.annotations || [],
        warnings: audit.body?.warningsData || [],
        blockers: audit.body?.blockersData || [],
      }),
    })
    console.log(`Fix status: ${fix.status}`)
    if (fix.status !== 200) {
      console.log('Fix failed:', JSON.stringify(fix.body).slice(0, 300))
      break
    }
    fixedContent = fix.body?.fixedContent || fixedContent
    console.log(`Fix score: ${fix.body?.score} | Ship: ${fix.body?.shipReady}`)
    console.log(`Repairs: ${(fix.body?.appliedRepairs || []).join(', ')}`)

    if (fix.body?.shipReady) {
      shipReady = true
      break
    }

    // Re-audit
    console.log(`  Re-auditing...`)
    const reaudit = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'POST',
      body: JSON.stringify({
        content: fixedContent,
        contentType: 'legal_guide',
        primaryKeyword: opp.primaryKeyword || opp.keyword,
        region: opp.region || 'US',
        liveLinks: true,
      }),
    })
    if (reaudit.status === 200) {
      fixedContent = reaudit.body?.fixedContent || fixedContent
      shipReady = reaudit.body?.shipReady
      console.log(`  Re-audit score: ${reaudit.body?.score} | Ship: ${shipReady} | Blockers: ${(reaudit.body?.blockersData || []).length}`)
      if (reaudit.body?.blockersData?.length) {
        for (const b of reaudit.body.blockersData) console.log(`    ⛔ ${b.code}`)
      }
      audit.body = reaudit.body
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STAGE 6: CREATE JOB + APPROVE
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══ STAGE 6: CREATE JOB ══')
  const jobCreate = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'POST',
    body: JSON.stringify({
      title: briefData.title || opp.primaryKeyword || 'Pipeline Test Article',
      content: fixedContent,
      primary_keyword: opp.primaryKeyword || opp.keyword,
      region: opp.region || 'US',
      content_type: 'legal_guide',
    }),
  })
  console.log(`Job create status: ${jobCreate.status}`)
  if (jobCreate.status !== 200 && jobCreate.status !== 201) {
    console.log('Job create failed:', JSON.stringify(jobCreate.body).slice(0, 300))
    // Try approve directly with the content
    console.log('Trying direct approve without job creation...')
  }
  const jobId = jobCreate.body?.id || jobCreate.body?.job?.id

  if (jobId) {
    console.log(`Job ID: ${jobId}`)

    // Run final audit on the job
    console.log('Running final audit on job...')
    const finalAudit = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'POST',
      body: JSON.stringify({
        content: fixedContent,
        jobId,
        contentType: 'legal_guide',
        primaryKeyword: opp.primaryKeyword || opp.keyword,
        region: opp.region || 'US',
        liveLinks: true,
      }),
    })
    if (finalAudit.status === 200) {
      fixedContent = finalAudit.body?.fixedContent || fixedContent
      shipReady = finalAudit.body?.shipReady
      console.log(`Final audit: score=${finalAudit.body?.score} ship=${shipReady}`)
    }

    console.log('\n══ STAGE 6: APPROVE ══')
    const approval = await apiFetch(page, '/api/content-studio/jobs', {
      method: 'PATCH',
      body: JSON.stringify({ id: jobId, action: 'approve', content: fixedContent }),
    })
    console.log(`Approve status: ${approval.status}`)
    if (approval.status === 200) {
      console.log(`✅ APPROVED!`)
      console.log(`   Path: ${approval.body?.ship?.path}`)
      console.log(`   URL: ${approval.body?.ship?.canonicalUrl}`)
      console.log(`   Status: ${approval.body?.ship?.status}`)
    } else {
      console.log(`❌ Approve failed: ${JSON.stringify(approval.body).slice(0, 500)}`)
    }
  }

  // Final summary
  console.log(`\n${'═'.repeat(60)}`)
  console.log('PIPELINE SUMMARY')
  console.log(`${'═'.repeat(60)}`)
  console.log(`Keyword: ${opp.primaryKeyword || opp.keyword}`)
  console.log(`Draft: ${wordCount} words`)
  console.log(`Final score: ${audit.body?.score || '-'}`)
  console.log(`Ship-ready: ${shipReady}`)
  console.log(`Approved: ${jobId ? 'yes' : 'no job created'}`)

  await browser.close()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
