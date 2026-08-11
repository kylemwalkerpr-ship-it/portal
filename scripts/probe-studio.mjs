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

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'user_3DDUel4TxmYmI0GaYxoKAsxzBTm', expires_in_seconds: 120 }),
  })
  const { token } = await tokenRes.json()

  await page.goto(`${PORTAL}/sign-in/student?__clerk_ticket=${token}&return_to=/dashboard/admin/content`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(8000)
  console.log('URL:', page.url())

  const body = await page.textContent('body')
  console.log('Draft & Review tab:', body.includes('Draft & Review'))
  console.log('Approve & Track tab:', body.includes('Approve & Track'))
  console.log('Document Vault:', body.includes('Document Vault') || body.includes('DOCUMENT VAULT'))

  // Click Draft & Review tab
  const draftTab = page.locator('button:has-text("Draft")').first()
  if (await draftTab.isVisible().catch(() => false)) {
    await draftTab.click()
    await page.waitForTimeout(4000)
    console.log('After Draft tab click, URL:', page.url())
    const b2 = await page.textContent('body')
    console.log('DOCUMENT VAULT:', b2.includes('DOCUMENT VAULT'))
    console.log('Open in editor:', b2.includes('Open in editor'))
    console.log('No pending drafts:', b2.includes('No pending drafts'))
  } else {
    console.log('Draft tab not found')
    // List all visible buttons with text
    const buttons = await page.locator('button').allTextContents()
    console.log('Visible buttons:', JSON.stringify(buttons.slice(0, 15)))
  }

  await page.screenshot({ path: '/tmp/studio-probe.png', fullPage: true })
  console.log('Screenshot saved')
  await browser.close()
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1) })
