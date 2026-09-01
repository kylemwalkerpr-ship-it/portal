/**
 * Live E2E (2026-08-31): authenticate as admin via Clerk sign-in token,
 * run the FULL Content Studio pipeline against production for TWO distinct
 * opportunities: Discover → Brief → Draft (SSE) → Audit → Fix (article 1
 * exercises fix_until_gates — the convergence loop fixed today; article 2
 * exercises the classic fix_all loop) → Create job → Approve to main.
 * Verifies ship results and prints a final PASS/FAIL summary.
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
  if (!d.token) throw new Error('Clerk token failed: ' + JSON.stringify(d).slice(0, 200))
  return d.token
}

async function authenticate(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const token = await getToken()
  let lastErr = null
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(`${PORTAL}/sign-in/student?__clerk_ticket=${token}&return_to=/dashboard/admin/content`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      lastErr = null
      break
    } catch (e) { lastErr = e; await page.waitForTimeout(3000) }
  }
  if (lastErr) throw lastErr
  await page.waitForTimeout(9000)
  if (!page.url().includes('/dashboard')) throw new Error('Auth failed, landed on: ' + page.url())
  console.log('✓ Browser authenticated →', page.url())
  return { ctx, page }
}

async function apiFetch(page, path, opts = {}) {
  return page.evaluate(async ({ path, opts }) => {
    const r = await fetch(path, { credentials: 'include', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } })
    const body = await r.json().catch(() => ({ _text: 'parse failed' }))
    return { status: r.status, body }
  }, { path, opts })
}

async function streamToCompletion(page, path, body, maxMs = 600000) {
  return page.evaluate(async ({ path, body, maxMs }) => {
    const r = await fetch(path, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.status !== 200) return { status: r.status, error: (await r.text()).slice(0, 600) }
    const reader = r.body.getReader(); const decoder = new TextDecoder()
    let fullText = ''; let events = []; let lastEvent = null; let jobId = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            events.push(data); lastEvent = data
            if (data.text) fullText += data.text
            if (data.type === 'job' && data.jobId) jobId = data.jobId
            if (data.type === 'done' || data.type === 'error') return { status: 200, content: fullText, lastEvent, eventCount: events.length, jobId }
          } catch {}
        }
      }
    }
    return { status: 200, content: fullText, lastEvent, eventCount: events.length, jobId }
  }, { path, body, maxMs })
}

const summary = []

async function runArticle(page, label, fixMode, keyword, region, opp) {
  const log = (...a) => console.log(`[${label}]`, ...a)
  log('══ DISCOVER input:', keyword, `[${region}]`)

  // ── BRIEF ──
  log('STAGE 2: BRIEF')
  const brief = await apiFetch(page, '/api/content-studio/suggest-brief', {
    method: 'POST',
    body: JSON.stringify({ primaryKeyword: keyword, region, topic: keyword, opportunity: opp }),
  })
  if (brief.status !== 200) { summary.push({ label, stage: 'brief', ok: false, detail: JSON.stringify(brief.body).slice(0, 200) }); return null }
  const briefData = brief.body?.brief || brief.body
  log('brief ok:', briefData.title || briefData.suggestedH1 || '(untitled)')

  // ── DRAFT (SSE) ──
  log('STAGE 3: DRAFT (streaming, up to 10 min)')
  const draft = await streamToCompletion(page, '/api/seo-factory/generate-stream', {
    topic: keyword,
    primaryKeyword: keyword,
    region,
    contentType: 'legal_guide',
    brief: briefData,
    indexable: true,
    shipMode: 'none',
    title: briefData.suggestedH1 || briefData.title || keyword,
  }, 600000)
  if (draft.status !== 200 || !draft.content || draft.content.split(/\s+/).length < 300) {
    summary.push({ label, stage: 'draft', ok: false, detail: JSON.stringify(draft.error || draft.lastEvent || draft.content?.slice(0, 150)).slice(0, 300) })
    return null
  }
  log('draft ok:', draft.content.split(/\s+/).length, 'words,', draft.eventCount, 'events')

  // ── AUDIT ──
  log('STAGE 4: AUDIT')
  const audit = await apiFetch(page, '/api/content-studio/reaudit', {
    method: 'POST',
    body: JSON.stringify({ content: draft.content, contentType: 'legal_guide', primaryKeyword: keyword, region, liveLinks: true }),
  })
  if (audit.status !== 200) { summary.push({ label, stage: 'audit', ok: false, detail: JSON.stringify(audit.body).slice(0, 300) }); return null }
  let content = audit.body?.fixedContent || draft.content
  let shipReady = audit.body?.shipReady
  log(`audit: score=${audit.body?.score} shipReady=${shipReady} blockers=${(audit.body?.blockersData || []).length} warnings=${(audit.body?.warningsData || []).length}`)
  for (const b of (audit.body?.blockersData || []).slice(0, 5)) log('  ⛔', b.code, (b.message || '').slice(0, 90))

  // ── FIX LOOP ──
  for (let i = 1; i <= 4 && !shipReady; i++) {
    log(`STAGE 5: FIX (loop ${i}, mode=${fixMode})`)
    const fixBody = fixMode === 'fix_until_gates'
      ? { action: 'fix_until_gates', content, contentType: 'legal_guide', primaryKeyword: keyword, region, annotations: audit.body?.annotations || [], warnings: audit.body?.warningsData || [], blockers: audit.body?.blockersData || [] }
      : { action: 'fix_all', content, contentType: 'legal_guide', primaryKeyword: keyword, region, annotations: audit.body?.annotations || [], warnings: audit.body?.warningsData || [], blockers: audit.body?.blockersData || [] }
    const fix = await apiFetch(page, '/api/content-studio/reaudit', { method: 'PATCH', body: JSON.stringify(fixBody) })
    if (fix.status !== 200) {
      log(`fix ${fix.status}:`, JSON.stringify(fix.body).slice(0, 250))
      if (fix.body?.heldForReview) { summary.push({ label, stage: `fix(${fixMode})`, ok: false, detail: fix.body.error?.slice(0, 250) }); return null }
      break
    }
    content = fix.body?.fixedContent || content
    shipReady = fix.body?.shipReady
    log(`fix: score=${fix.body?.score} shipReady=${shipReady} repairs=${(fix.body?.appliedRepairs || []).slice(0, 6).join(',')}`)
    if (shipReady) break
    const re = await apiFetch(page, '/api/content-studio/reaudit', {
      method: 'POST',
      body: JSON.stringify({ content, contentType: 'legal_guide', primaryKeyword: keyword, region, liveLinks: true }),
    })
    if (re.status === 200) {
      content = re.body?.fixedContent || content
      shipReady = re.body?.shipReady
      log(`  re-audit: score=${re.body?.score} shipReady=${shipReady} blockers=${(re.body?.blockersData || []).length}`)
      audit.body = re.body
    }
  }

  // ── JOB (created by the draft stream) + APPROVE ──
  log('STAGE 6: JOB + APPROVE')
  let jobId = draft.jobId || null
  if (!jobId) {
    // Fallback: the draft stream inserts the content_jobs row — find it by keyword.
    const jobsList = await apiFetch(page, '/api/content-studio/jobs?limit=50')
    const rows = jobsList.body?.jobs || jobsList.body || []
    const match = (Array.isArray(rows) ? rows : []).find(
      (j) => (j.primary_keyword || '').toLowerCase() === keyword.toLowerCase(),
    )
    jobId = match?.id || null
  }
  if (!jobId) {
    log('job lookup failed: no job row for keyword', keyword)
    summary.push({ label, stage: 'job-create', ok: false, detail: `no content_jobs row for "${keyword}"` })
    return null
  }
  log('job:', jobId)

  // Persist the audited/fixed content as the job's review draft.
  const save = await apiFetch(page, '/api/content-studio/drafts', {
    method: 'POST',
    body: JSON.stringify({ jobId, content, source: 'fix' }),
  })
  if (save.status !== 200 && save.body?.persisted !== true) {
    log('draft save:', save.status, JSON.stringify(save.body).slice(0, 250))
  }

  const finalAudit = await apiFetch(page, '/api/content-studio/reaudit', {
    method: 'POST',
    body: JSON.stringify({ content, jobId, contentType: 'legal_guide', primaryKeyword: keyword, region, liveLinks: true }),
  })
  if (finalAudit.status === 200) {
    content = finalAudit.body?.fixedContent || content
    shipReady = finalAudit.body?.shipReady
    log(`final audit: score=${finalAudit.body?.score} shipReady=${shipReady}`)
  }

  const approval = await apiFetch(page, '/api/content-studio/jobs', {
    method: 'PATCH',
    body: JSON.stringify({ id: jobId, action: 'approve', content }),
  })
  if (approval.status === 200) {
    const ship = approval.body?.ship || {}
    log(`✅ APPROVED — repo=${ship.repo} status=${ship.status} path=${ship.path} url=${ship.canonicalUrl || ship.prUrl || ''}`)
    summary.push({ label, stage: 'approve', ok: true, detail: `${ship.repo || '?'} · ${ship.status} · ${ship.path || ''}` })
    return { jobId, ship }
  }
  log('❌ approve failed:', approval.status, JSON.stringify(approval.body).slice(0, 400))
  summary.push({ label, stage: 'approve', ok: false, detail: JSON.stringify(approval.body).slice(0, 300) })
  return null
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const { page } = await authenticate(browser)

  // Explicit-topic fallback: E2E_TOPICS="term1|term2" bypasses Discover when
  // prod GSC/snapshot surfaces are starved (junk-dominated live rows).
  const explicitTopics = (process.env.E2E_TOPICS || '')
    .split('|').map((t) => t.trim()).filter(Boolean)
    .map((t) => {
      const [term, region] = t.split('@').map((s) => s.trim())
      return { term, region: region || 'US' }
    })

  let opportunities
  if (explicitTopics.length >= 1) {
    console.log(`\n══ STAGE 1: DISCOVER (explicit topics: ${explicitTopics.map((t) => t.term).join(' / ')}) ══`)
    opportunities = explicitTopics
  } else {
    console.log('\n══ STAGE 1: DISCOVER ══')
    const discover = await apiFetch(page, '/api/seo-factory/optimal-plan', { method: 'POST', body: JSON.stringify({ limit: 6 }) })
    if (discover.status !== 200) { console.log('Discover failed:', JSON.stringify(discover.body).slice(0, 300)); await browser.close(); process.exit(1) }
    opportunities = discover.body?.plan || discover.body?.opportunities || []
    console.log(`Found ${opportunities.length} opportunities`)
    if (opportunities.length < 2) { console.log('Need ≥2 opportunities'); await browser.close(); process.exit(1) }
  }

  const used = new Set()
  const pick = () => opportunities.find(o => {
    const k = o.term || o.primaryKeyword || o.keyword || o.topic
    return k && !used.has(k.toLowerCase())
  })

  for (const [label, fixMode] of [['ARTICLE-1', 'fix_until_gates'], ['ARTICLE-2', 'fix_all']]) {
    const opp = pick()
    if (!opp) { summary.push({ label, stage: 'discover', ok: false, detail: 'no unused opportunity' }); continue }
    const keyword = (opp.term || opp.primaryKeyword || opp.keyword || opp.topic).trim()
    const region = opp.region || 'US'
    used.add(keyword.toLowerCase())
    console.log(`\n═════════ ${label}: "${keyword}" [${region}] fix-mode=${fixMode} ═════════`)
    try {
      await runArticle(page, label, fixMode, keyword, region, opp)
    } catch (e) {
      console.log(`[${label}] CRASH:`, e.message)
      summary.push({ label, stage: 'crash', ok: false, detail: e.message.slice(0, 250) })
    }
  }

  console.log('\n════════════ FINAL SUMMARY ════════════')
  for (const s of summary) console.log(`${s.ok ? '✅' : '❌'} ${s.label} · ${s.stage} · ${s.detail}`)
  const approved = summary.filter(s => s.stage === 'approve' && s.ok).length
  console.log(`\nApproved to main: ${approved}/2`)
  await browser.close()
  process.exit(approved >= 2 ? 0 : 2)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
