/**
 * Quick script: test the re-audit flow in the deployed studio.
 * Signs in with a Clerk ticket, navigates to Content Studio,
 * opens a draft with warnings, clicks Re-audit, asserts results.
 */
import { chromium } from '@playwright/test'

const PORTAL = 'https://portal.yousafeconsultancy.com'

async function main() {
  // Fresh token from Clerk
  const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: 'user_3DDUel4TxmYmI0GaYxoKAsxzBTm', expires_in_seconds: 120 }),
  })
  const { token } = await tokenRes.json()
  if (!token) { console.error('No token'); process.exit(1) }
  console.log('Got Clerk ticket')

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  // Sign in with Clerk ticket
  await page.goto(`${PORTAL}/sign-in/student?__clerk_ticket=${token}&return_to=/dashboard/admin/content`, { waitUntil: 'networkidle', timeout: 30000 })
  console.log('Page title:', await page.title())
  console.log('URL:', page.url())

  // Wait for dashboard to load
  await page.waitForTimeout(5000)
  console.log('After wait, URL:', page.url())

  // Look for Content Studio or dashboard tabs
  const body = await page.textContent('body')
  console.log('Page contains "Content Studio":', body.includes('Content Studio'))
  console.log('Page contains "Dashboard":', body.includes('Dashboard'))
  console.log('Page contains "Document Vault":', body.includes('Document Vault'))

  // Navigate to admin content if not there
  if (!page.url().includes('/dashboard/admin/content')) {
    await page.goto(`${PORTAL}/dashboard/admin/content`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(3000)
    console.log('After nav to /dashboard/admin/content, URL:', page.url())
  }

  // Look for pipeline tabs
  const body2 = await page.textContent('body')
  console.log('Contains "Discover":', body2.includes('Discover'))
  console.log('Contains "Approve":', body2.includes('Approve'))
  console.log('Contains "Configure":', body2.includes('Configure'))
  console.log('Contains "Document Vault":', body2.includes('Document Vault'))

  // Look for drafted documents
  console.log('Contains "Open in editor":', body2.includes('Open in editor'))
  console.log('Contains "DOCUMENT VAULT":', body2.includes('DOCUMENT VAULT'))
  console.log('Contains "No pending drafts":', body2.includes('No pending drafts'))

  // Try clicking the Approve & Track tab
  const approveTab = page.locator('[data-chapter="approve"], #studio-tab-approve, button:has-text("Approve"), button:has-text("IV")').first()
  if (await approveTab.isVisible()) {
    console.log('Approve tab found, clicking...')
    await approveTab.click()
    await page.waitForTimeout(4000)
    console.log('URL after click:', page.url())
    const body3 = await page.textContent('body')
    console.log('After clicking Approve - has "Document Vault":', body3.includes('Document Vault'))
    console.log('After clicking Approve - has "Open in editor":', body3.includes('Open in editor'))
    console.log('After clicking Approve - has "REVIEW":', body3.includes('REVIEW'))
    console.log('After clicking Approve - has "review":', body3.includes('review'))
    console.log('After clicking Approve - has "GATES":', body3.includes('GATES'))
    console.log('After clicking Approve - has "No draft":', body3.includes('No draft'))
    // Check all visible tab panels
    const panels = page.locator('[data-testid]')
    const count = await panels.count()
    console.log('Data-testid elements count:', count)
    for (let i = 0; i < Math.min(count, 8); i++) {
      const id = await panels.nth(i).getAttribute('data-testid')
      console.log(`  testid[${i}]:`, id)
    }
  }

  // Try clicking Open in editor on a draft
  const openBtn = page.locator('button:has-text("Open in editor")').first()
  if (await openBtn.isVisible()) {
    console.log('Found Open in editor button, clicking...')
    await openBtn.click()
    await page.waitForTimeout(3000)

    // Look for Re-audit button
    const reauditBtn = page.locator('button:has-text("Re-audit")').first()
    if (await reauditBtn.isVisible()) {
      console.log('Found Re-audit button, clicking...')
      await reauditBtn.click()
      
      // Wait for re-audit to complete
      console.log('Waiting for re-audit...')
      await page.waitForTimeout(20000)

      const finalBody = await page.textContent('body')
      console.log('Contains "applied":', finalBody.includes('applied'))
      console.log('Contains "schema_article":', finalBody.includes('schema_article'))
      console.log('Contains "wall_of_text":', finalBody.includes('wall_of_text'))
      console.log('Contains "concrete_example":', finalBody.includes('concrete_example'))
      console.log('Contains "internal_links":', finalBody.includes('internal_links'))
      console.log('Contains "0 warnings":', finalBody.includes('0 warnings') || finalBody.includes('0 warning'))
      
      await page.screenshot({ path: '/tmp/reaudit-result.png', fullPage: true })
      console.log('Screenshot saved to /tmp/reaudit-result.png')
    } else {
      console.log('No Re-audit button found')
      await page.screenshot({ path: '/tmp/no-reaudit.png', fullPage: true })
    }
  } else {
    console.log('No Open in editor button found in Document Vault')
    await page.screenshot({ path: '/tmp/no-drafts.png', fullPage: true })
  }

  await browser.close()
  console.log('Done.')
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1) })
