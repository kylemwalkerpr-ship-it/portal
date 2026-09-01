/**
 * Live admin Content Studio walk. Credentials from env PORTAL_EMAIL / PORTAL_PASSWORD.
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'https://portal.yousafeconsultancy.com'
const OUT = '/tmp/yousafe-live-studio'
fs.mkdirSync(OUT, { recursive: true })

const email = process.env.PORTAL_EMAIL
const password = process.env.PORTAL_PASSWORD
if (!email || !password) {
  console.error('PORTAL_EMAIL and PORTAL_PASSWORD required')
  process.exit(1)
}

const notes = []
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  notes.push(line)
  fs.writeFileSync(path.join(OUT, 'notes.txt'), notes.join('\n'))
}

async function shot(page, name) {
  const p = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: p, fullPage: true })
  log(`screenshot ${p}`)
}

async function waitEnabled(page, needle, timeoutMs) {
  await page.waitForFunction(
    (n) => {
      const buttons = [...document.querySelectorAll('button')]
      const b = buttons.find((el) => (el.textContent || '').replace(/\s+/g, ' ').toUpperCase().includes(n))
      return Boolean(b && !b.disabled)
    },
    needle,
    { timeout: timeoutMs },
  )
}

async function clickWhenReady(page, needle, waitMs) {
  await waitEnabled(page, needle, waitMs)
  const btn = page.locator('button').filter({ hasText: new RegExp(needle, 'i') }).first()
  await btn.click()
  log(`clicked ${needle}`)
}

async function clerkLogin(page) {
  await page.goto(`${BASE}/sign-in/admin?return_to=${encodeURIComponent('/dashboard/admin/content')}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await page.waitForTimeout(1500)
  await shot(page, '01-sign-in')
  const emailBox = page.locator('.cl-signIn-root input[name="identifier"]').first()
  await emailBox.waitFor({ timeout: 20_000 })
  await emailBox.fill(email)
  await page.locator('.cl-signIn-root').getByRole('button', { name: /^continue$/i }).click()
  const passBox = page.locator('.cl-signIn-root input[name="password"]:not([disabled])')
  await passBox.waitFor({ state: 'visible', timeout: 20_000 })
  await passBox.fill(password)
  await page.locator('.cl-signIn-root').getByRole('button', { name: /^continue$/i }).click()
  await page.waitForURL((u) => !u.pathname.includes('/sign-in'), { timeout: 45_000 })
  log(`logged in ${page.url()}`)
  await shot(page, '02-after-login')
}

async function generateOne(page, spec) {
  log(`GENERATE start type=${spec.contentType} topic=${spec.topic} region=${spec.region} pin=${spec.aiProvider}`)
  const res = await page.request.post(`${BASE}/api/seo-factory/generate-stream`, {
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    data: {
      topic: spec.topic,
      title: spec.title || spec.topic,
      primaryKeyword: spec.topic,
      region: spec.region,
      contentType: spec.contentType,
      tone: 'educational',
      keywords: spec.keywords || [spec.topic],
      shipMode: 'pr',
      indexable: true,
      minAuditScore: 55,
      maxRefine: 3,
      aiProvider: spec.aiProvider,
    },
    timeout: 420_000,
  })
  const text = await res.text()
  log(`GENERATE http=${res.status()} bytes=${text.length}`)
  const events = []
  for (const block of text.split('\n\n')) {
    const line = block.split('\n').find((l) => l.startsWith('data:'))
    if (!line) continue
    try { events.push(JSON.parse(line.slice(5).trim())) } catch { /* ignore */ }
  }
  const final = events.find((e) => e.type === 'final') || events[events.length - 1] || {}
  const ship = events.find((e) => e.type === 'ship')
  const attempts = events.filter((e) => e.type === 'attempt')
  const providers = events.filter((e) => e.type === 'provider')
  const summary = {
    type: spec.contentType,
    topic: spec.topic,
    http: res.status(),
    jobId: final.jobId || final.result?.jobId,
    provider: final.provider || providers.at(-1)?.provider,
    model: final.model || providers.at(-1)?.model,
    words: final.wordCount || final.result?.audit?.wordCount,
    score: final.seoScore || final.result?.audit?.score,
    shipError: ship?.shipError || final.result?.shipError,
    prUrl: ship?.ship?.prUrl || final.result?.ship?.prUrl,
    canonicalUrl: final.result?.ship?.canonicalUrl || ship?.ship?.canonicalUrl,
    attempts: attempts.length,
    lastAttempt: attempts.at(-1) || null,
    eventTypes: events.map((e) => e.type).slice(0, 40),
    error: final.error || final.message,
  }
  log(`GENERATE done ${JSON.stringify(summary)}`)
  fs.writeFileSync(path.join(OUT, `gen-${spec.contentType}.json`), JSON.stringify({ summary, tail: events.slice(-8) }, null, 2))
  return summary
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  page.setDefaultTimeout(60_000)

  try {
    await clerkLogin(page)
    await page.goto(`${BASE}/dashboard/admin/content?tab=discover`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    await shot(page, '03-desk')

    await clickWhenReady(page, 'INGEST KNOWLEDGE', 20_000)
    log('waiting for ingest to finish')
    await waitEnabled(page, 'INGEST KNOWLEDGE', 420_000)
    await shot(page, '04-ingest-done')
    log('ingest finished')

    await clickWhenReady(page, 'RUN PLANNER', 20_000)
    log('waiting for planner')
    await waitEnabled(page, 'RUN PLANNER', 420_000)
    await shot(page, '05-planner-done')
    log('planner finished')

    await clickWhenReady(page, 'LLM AUDIT', 20_000)
    log('waiting for llm audit')
    await waitEnabled(page, 'LLM AUDIT', 420_000)
    await shot(page, '06-llm-done')
    log('llm audit finished')

    const planRes = await page.request.get(`${BASE}/api/seo-engine/plan`)
    const planJson = await planRes.json()
    fs.writeFileSync(path.join(OUT, 'plans.json'), JSON.stringify(planJson, null, 2).slice(0, 200_000))
    const plans = planJson.plans || planJson.clusters || []
    log(`plans http=${planRes.status()} count=${Array.isArray(plans) ? plans.length : 0} keys=${Object.keys(planJson).join(',')}`)

    const list = Array.isArray(plans) ? plans : []
    const pick = (pred, fallbackTopic, region, contentType) => {
      const hit = list.find(pred)
      if (hit) {
        return {
          topic: String(hit.primaryKeyword || hit.keyword || hit.topic || hit.title || fallbackTopic),
          title: String(hit.title || hit.primaryKeyword || fallbackTopic),
          region: String(hit.country || hit.region || region),
          contentType,
          keywords: hit.keywords || [hit.primaryKeyword || fallbackTopic],
          aiProvider: contentType === 'legal_guide' || contentType === 'regional_page' || contentType === 'blog_summary'
            ? 'runbios-minimax'
            : 'runbios-minimax',
        }
      }
      return { topic: fallbackTopic, title: fallbackTopic, region, contentType, keywords: [fallbackTopic], aiProvider: 'runbios-minimax' }
    }

    const jobs = [
      pick((p) => /legal|guide|visa/i.test(JSON.stringify(p)) && !/blog/i.test(String(p.contentType || '')), 'UK Student visa requirements 2026', 'UK', 'legal_guide'),
      pick((p) => /regional|from|university|country/i.test(JSON.stringify(p)), 'study in Canada from Kenya', 'CA', 'regional_page'),
      pick((p) => /blog/i.test(JSON.stringify(p)), 'CAS letter explained for African students', 'UK', 'blog_summary'),
    ]
    log(`job specs ${JSON.stringify(jobs)}`)

    const results = []
    for (const spec of jobs) {
      results.push(await generateOne(page, spec))
      await shot(page, `07-after-${spec.contentType}`)
    }
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
  } catch (e) {
    log(`ERROR ${e instanceof Error ? e.stack : e}`)
    try { await shot(page, '99-error') } catch { /* ignore */ }
    throw e
  } finally {
    fs.writeFileSync(path.join(OUT, 'notes.txt'), notes.join('\n'))
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
