/**
 * Test MiniMax as a brief provider via the live suggest-brief endpoint.
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
    body: JSON.stringify({ user_id: ADMIN_ID, expires_in_seconds: 600 }),
  })
  const d = await res.json()
  if (!d.token) throw new Error('Clerk token failed')
  return d.token
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const token = await getToken()
  await page.goto(`${PORTAL}/sign-in/student?__clerk_ticket=${token}&return_to=/dashboard/admin/content`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(8000)
  console.log('Auth:', page.url())

  console.log('\nTesting MiniMax brief provider...')
  const start = Date.now()
  const result = await page.evaluate(async () => {
    const r = await fetch('/api/content-studio/suggest-brief', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'uk graduate visa requirements',
        primaryKeyword: 'uk graduate visa requirements',
        region: 'UK',
        contentType: 'article',
        aiProvider: 'nvidia-minimax',
      }),
    })
    return { status: r.status, body: await r.json().catch(() => ({})) }
  })
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log(`Status: ${result.status} (${elapsed}s)`)
  if (result.status === 200) {
    const brief = result.body?.brief || result.body
    console.log(`Title: ${brief.suggestedH1 || brief.title || 'generated'}`)
    console.log(`Provider: ${result.body?.provider || 'unknown'}`)
    console.log(`Keywords: ${(brief.keywords || []).length}`)
    console.log(`H2 outline: ${(brief.h2Outline || []).length} sections`)
    console.log(`Sources: ${(brief.sources || []).length}`)
    console.log('\n✅ MiniMax brief generation WORKS!')
  } else {
    console.log('Error:', JSON.stringify(result.body).slice(0, 500))
  }

  await browser.close()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
